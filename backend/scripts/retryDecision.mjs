// Utilidad manual: re-ejecuta una decisión (pending o failed) contra Meta real con el
// executor actual, sin pasar por el endpoint HTTP (que exige status=pending). Útil para
// reintentar una propuesta después de arreglar un bug sin esperar el deploy.
// Uso: node scripts/retryDecision.mjs <decisionId>
import 'dotenv/config';
import { initFirebase } from '../src/firebase.js';
import { prefixedDb } from '../src/store/prefixedDb.js';
import { createDecisionsStore } from '../src/store/decisions.js';
import { createMetaClient } from '../src/services/meta.js';
import { createDecisionExecutor } from '../src/agent/decisionExecutor.js';

const DECISION_ID = process.argv[2];
if (!DECISION_ID) throw new Error('uso: node scripts/retryDecision.mjs <decisionId>');

const { db: rawDb } = initFirebase();
const db = prefixedDb(rawDb);
const decisions = createDecisionsStore(db);
const meta = createMetaClient({ accessToken: process.env.META_ACCESS_TOKEN, accountId: process.env.META_ACCOUNT_ID });
const executor = createDecisionExecutor({
  meta,
  tiendanube: {},
  createAdFromCreative: async () => { throw new Error('createAdFromCreative no implementado en este script — no se esperaba creative_id'); },
  pixelId: process.env.META_PIXEL_ID,
});

const d = await decisions.get(DECISION_ID);
if (!d) throw new Error('no existe: ' + DECISION_ID);
console.log('Reintentando decisión', d.id, d.status, JSON.stringify(d.input));

try {
  const result = await executor(d);
  await decisions.setStatus(d.id, 'approved', { executedAt: new Date().toISOString(), result: result ?? null });
  console.log('OK:', JSON.stringify(result, null, 2));
} catch (err) {
  await decisions.setStatus(d.id, 'failed', { error: String(err.message || err) });
  console.error('FALLÓ:', err.message);
  process.exit(1);
}
process.exit(0);
