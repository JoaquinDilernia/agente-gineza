// Corre el análisis profundo del agente UNA vez, con el wiring real completo.
// Uso: node scripts/runAgentOnce.js [--live]
//  - Sin flags: fuerza autonomousMode=false (kill switch) — todo queda pending, nada se ejecuta.
//  - Con --live: respeta la config guardada (puede ejecutar pause_ad/create_ad de verdad).
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { initFirebase } from '../src/firebase.js';
import { prefixedDb } from '../src/store/prefixedDb.js';
import { createConfigStore } from '../src/config/configStore.js';
import { createDecisionsStore } from '../src/store/decisions.js';
import { createSalesStore } from '../src/store/sales.js';
import { createLearningsStore } from '../src/store/learnings.js';
import { createProposalsStore } from '../src/store/proposals.js';
import { createCreativesStore } from '../src/store/creatives.js';
import { createAgentStateStore } from '../src/store/agentState.js';
import { createMetaClient } from '../src/services/meta.js';
import { createTiendanubeClient } from '../src/services/tiendanube.js';
import { createStorage } from '../src/services/storage.js';
import { createContextBuilder } from '../src/agent/contextBuilder.js';
import { createToolDispatcher } from '../src/agent/dispatcher.js';
import { createAdBuilder } from '../src/agent/createAd.js';
import { createAgentRunner } from '../src/agent/runner.js';

const live = process.argv.includes('--live');

const { db: rawDb, bucket } = initFirebase();
const db = prefixedDb(rawDb);

const configStore = createConfigStore(db);
if (!live) {
  await configStore.update({ autonomousMode: false });
  console.log('🔒 Kill switch ACTIVADO — nada se ejecuta, todo queda pending. (usá --live para modo real)');
} else {
  console.log('⚡ Modo LIVE — el agente puede pausar/crear anuncios de verdad.');
}

const stores = {
  decisions: createDecisionsStore(db),
  sales: createSalesStore(db),
  learnings: createLearningsStore(db),
  proposals: createProposalsStore(db),
  creatives: createCreativesStore(db),
};
const agentState = createAgentStateStore(db);
const storage = createStorage(bucket);
const meta = createMetaClient({ accessToken: process.env.META_ACCESS_TOKEN, accountId: process.env.META_ACCOUNT_ID });
const tiendanube = createTiendanubeClient({ storeId: process.env.TIENDANUBE_STORE_ID, token: process.env.TIENDANUBE_TOKEN });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const createAdFromCreative = createAdBuilder({
  meta, storage, stores, configStore,
  pageId: process.env.META_PAGE_ID, igActorId: process.env.META_IG_ACTOR_ID, linkUrl: 'https://ginezaonline.com/',
});
const dispatch = createToolDispatcher({ meta, stores, configStore, createAdFromCreative });

// Wrapper para loguear cada tool call en consola
const loggedDispatch = async (name, input) => {
  console.log(`\n🔧 ${name}`);
  if (input.reason) console.log(`   razón: ${input.reason}`);
  const result = await dispatch(name, input);
  console.log(`   → ${JSON.stringify(result).slice(0, 200)}`);
  return result;
};

// Proxy del cliente Anthropic que loguea el texto de cada respuesta del agente
const loggedAnthropic = {
  messages: {
    stream(params) {
      console.log(`\n[debug] llamando a ${params.model} — contexto: ${JSON.stringify(params.messages).length} chars`);
      const stream = anthropic.messages.stream(params);
      return {
        async finalMessage() {
          const resp = await stream.finalMessage();
          console.log(`[debug] stop_reason=${resp.stop_reason} bloques=[${resp.content.map((b) => b.type).join(',')}] tokens_out=${resp.usage?.output_tokens}`);
          for (const block of resp.content) {
            if (block.type === 'text' && block.text.trim()) console.log(`\n💬 Agente: ${block.text}`);
          }
          return resp;
        },
      };
    },
  },
};

const contextBuilder = createContextBuilder({ meta, tiendanube, stores, configStore });
const runner = createAgentRunner({ anthropic: loggedAnthropic, contextBuilder, dispatch: loggedDispatch, agentState, configStore });

console.log('\n🤖 Corriendo análisis profundo (esto puede tardar 1-3 minutos)...');
await runner.runDeep();

const pending = await stores.decisions.listPending();
const recent = await stores.decisions.listRecent(20);
console.log(`\n📋 Decisiones pendientes de aprobación: ${pending.length}`);
for (const d of pending) console.log(`  - [${d.tool}] ${d.reason?.slice(0, 150)}`);
console.log(`\n📚 Últimas decisiones registradas: ${recent.length}`);
process.exit(0);
