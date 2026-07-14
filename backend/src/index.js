import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import cron from 'node-cron';
import { initFirebase } from './firebase.js';
import { createApp } from './app.js';
import { createConfigStore } from './config/configStore.js';
import { createDecisionsStore } from './store/decisions.js';
import { createSalesStore } from './store/sales.js';
import { createLearningsStore } from './store/learnings.js';
import { createProposalsStore } from './store/proposals.js';
import { createCreativesStore } from './store/creatives.js';
import { createAgentStateStore } from './store/agentState.js';
import { createMetaClient } from './services/meta.js';
import { createTiendanubeClient } from './services/tiendanube.js';
import { createStorage } from './services/storage.js';
import { createContextBuilder } from './agent/contextBuilder.js';
import { createToolDispatcher } from './agent/dispatcher.js';
import { createAdBuilder } from './agent/createAd.js';
import { createAgentRunner } from './agent/runner.js';
import { createSaleProcessor } from './agent/saleProcessor.js';
import { createDecisionExecutor } from './agent/decisionExecutor.js';
import { createWebhookRouter } from './routes/webhooks.js';
import { createApiRouter } from './routes/api.js';
import { createAuthMiddleware } from './routes/authMiddleware.js';

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta env var: ${k}`);
  return v;
};

const { db, auth, bucket } = initFirebase();

const configStore = createConfigStore(db);
const stores = {
  decisions: createDecisionsStore(db),
  sales: createSalesStore(db),
  learnings: createLearningsStore(db),
  proposals: createProposalsStore(db),
  creatives: createCreativesStore(db),
};
const agentState = createAgentStateStore(db);
const storage = createStorage(bucket);

const meta = createMetaClient({ accessToken: env('META_ACCESS_TOKEN'), accountId: env('META_ACCOUNT_ID') });
const tiendanube = createTiendanubeClient({ storeId: env('TIENDANUBE_STORE_ID'), token: env('TIENDANUBE_TOKEN') });
const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });

const createAdFromCreative = createAdBuilder({
  meta, storage, stores, configStore,
  pageId: env('META_PAGE_ID'), igActorId: env('META_IG_ACTOR_ID'), linkUrl: 'https://ginezaonline.com/',
});
const dispatch = createToolDispatcher({ meta, stores, configStore, createAdFromCreative });
const contextBuilder = createContextBuilder({ meta, tiendanube, stores, configStore });
const runner = createAgentRunner({ anthropic, contextBuilder, dispatch, agentState, configStore });
const saleProcessor = createSaleProcessor({ tiendanube, meta, stores, configStore, runner });
const executor = createDecisionExecutor({ meta, tiendanube, createAdFromCreative });

const app = createApp({
  corsOrigin: env('FRONTEND_ORIGIN'),
  webhookRouter: createWebhookRouter({
    secret: env('TIENDANUBE_WEBHOOK_SECRET'),
    onOrderEvent: (event) => saleProcessor.processOrderEvent(event),
  }),
  apiRouter: [
    createAuthMiddleware({ auth, allowedEmail: env('ALLOWED_EMAIL') }),
    createApiRouter({ stores, configStore, executor, storage, runner }),
  ],
});

// Análisis profundo 09:00 y retrospectiva 09:30 (hora argentina)
cron.schedule('0 9 * * *', () => runner.runDeep().catch((e) => console.error('[cron deep] falló:', e)),
  { timezone: 'America/Argentina/Buenos_Aires' });
cron.schedule('30 9 * * *', () => runner.runRetrospective().catch((e) => console.error('[cron retro] falló:', e)),
  { timezone: 'America/Argentina/Buenos_Aires' });

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`gineza-agent-backend escuchando en :${port}`));
