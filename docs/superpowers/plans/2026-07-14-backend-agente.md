# Backend Agente Autónomo Gineza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend Node/Express en Railway que corre el agente autónomo (Claude Sonnet 5 vía tool-use) sobre Meta Ads + Tienda Nube, con motor de rentabilidad real, cola de aprobaciones, historial y aprendizaje, expuesto como API para el dashboard.

**Architecture:** Express con inyección de dependencias en todo (cada módulo es una factory `createX(deps)` — permite testear con fakes sin mocks globales). Firestore como única DB, Firebase Storage para imágenes de creativos. El "cerebro" es un loop de tool-use contra la API de Anthropic; las tools se dividen en autónomas (ejecutan al toque) y con-aprobación (escriben decisión `pending` que el dashboard aprueba/rechaza).

**Tech Stack:** Node 20+ (ESM, JavaScript puro, sin TypeScript), Express 4, firebase-admin, @anthropic-ai/sdk, node-cron, multer, cors, dotenv. Tests: vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-07-14-gineza-autonomous-agent-design.md` — leerla antes de empezar.

## Global Constraints

- Todo el código del backend vive en `backend/` en la raíz del repo. Paths de este plan son relativos a la raíz del repo (`C:\Users\Usuario\Desktop\gineza-agent`).
- ESM (`"type": "module"`), JavaScript puro. Sin TypeScript.
- Toda plata en ARS. Presupuestos de Meta van en centavos a la Graph API (`daily_budget: 3000000` = $30.000).
- Modelo Claude: `claude-sonnet-5`.
- Cuenta Meta: `act_33890648080578737`. Page ID `104448066033431`. IG actor `17841444761910024`. Pixel `659564062266866`. Link: `https://ginezaonline.com/`.
- Creativos SIEMPRE con `optimization_type: 'PLACEMENT'` y enhancements de IA desactivados (`standard_enhancements: OPT_OUT`) — regla del usuario, no negociable.
- Naming de objetos nuevos: `{FUNNEL}_{TAG}_{CREATIVO}_{YYYYMMDD}`. No renombrar objetos históricos.
- Timezone del cron: `America/Argentina/Buenos_Aires`.
- Secretos SOLO en env vars. Nunca commitear `.env` (sí `.env.example`).
- Correr tests desde `backend/`: `npx vitest run`.
- Commits frecuentes, mensajes en español, con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Scaffold del backend + health endpoint

**Files:**
- Create: `backend/package.json`, `backend/.gitignore`, `backend/src/app.js`, `backend/test/app.test.js`

**Interfaces:**
- Produces: `createApp({ webhookRouter, apiRouter, corsOrigin })` → Express app. Los routers se montan en `/webhooks` (ANTES de `express.json()`, necesita raw body) y `/api`.

- [ ] **Step 1: Crear package.json y .gitignore**

`backend/package.json`:
```json
{
  "name": "gineza-agent-backend",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "firebase-admin": "^12.3.0",
    "multer": "^1.4.5-lts.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^2.0.0"
  }
}
```

`backend/.gitignore`:
```
node_modules/
.env
serviceAccount*.json
```

Correr: `cd backend && npm install`

- [ ] **Step 2: Test que falla para /health**

`backend/test/app.test.js`:
```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('app', () => {
  it('responde /health', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

Correr: `npx vitest run` — Expected: FAIL (no existe `../src/app.js`).

- [ ] **Step 3: Implementar app factory**

`backend/src/app.js`:
```js
import express from 'express';
import cors from 'cors';

export function createApp({ webhookRouter, apiRouter, corsOrigin } = {}) {
  const app = express();
  if (corsOrigin) app.use(cors({ origin: corsOrigin }));
  // webhooks van ANTES de express.json(): la verificación HMAC necesita el raw body
  if (webhookRouter) app.use('/webhooks', webhookRouter);
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  if (apiRouter) app.use('/api', apiRouter);
  return app;
}
```

- [ ] **Step 4: Correr tests** — `npx vitest run` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/ && git commit -m "feat: scaffold backend express + health"
```

---

### Task 2: Motor de rentabilidad (funciones puras)

**Files:**
- Create: `backend/src/engine/profit.js`
- Test: `backend/test/profit.test.js`

**Interfaces:**
- Produces:
  - `paymentFeePct(payment, feeTable)` → number. `payment = { method: 'transfer'|'card', installments?: number }`.
  - `computeSaleProfit(sale, config)` → `{ revenue, productsCost, paymentFee, taxes, adCost, profit }` (todos redondeados a 2 decimales). `sale = { productsRevenue, shippingCharged, productsCost, payment: { method, installments?, exactFee? }, estimatedCpa }`.
  - `breakEvenRoas(product, config)` → number | Infinity. `product = { price, cost }`.
- Consumes: shape de `config` de Task 3 (`taxPct`, `metaSurcharge`, `metaSurchargeEnabled`, `paymentFees: { transfer, card_1, card_3 }`).

- [ ] **Step 1: Tests que fallan**

`backend/test/profit.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { computeSaleProfit, breakEvenRoas, paymentFeePct } from '../src/engine/profit.js';

const config = {
  taxPct: 0.08,
  metaSurcharge: 1.3,
  metaSurchargeEnabled: true,
  paymentFees: { transfer: 0.01, card_1: 0.049, card_3: 0.089 },
};

describe('paymentFeePct', () => {
  it('transferencia usa fee de transfer', () =>
    expect(paymentFeePct({ method: 'transfer' }, config.paymentFees)).toBe(0.01));
  it('tarjeta 3+ cuotas usa card_3', () =>
    expect(paymentFeePct({ method: 'card', installments: 3 }, config.paymentFees)).toBe(0.089));
  it('tarjeta 1 cuota usa card_1', () =>
    expect(paymentFeePct({ method: 'card', installments: 1 }, config.paymentFees)).toBe(0.049));
});

describe('computeSaleProfit', () => {
  it('venta rentable por transferencia: desglose completo', () => {
    const r = computeSaleProfit({
      productsRevenue: 50000, shippingCharged: 5000, productsCost: 20000,
      payment: { method: 'transfer' }, estimatedCpa: 10000,
    }, config);
    // fee = (50000+5000)*0.01 = 550 (la comisión se cobra sobre el total transaccionado, envío incluido)
    // taxes = 50000*0.08 = 4000 ; adCost = 10000*1.3 = 13000
    // profit = 50000 - 20000 - 550 - 4000 - 13000 = 12450 (el envío es pass-through: no suma ni resta)
    expect(r).toEqual({ revenue: 50000, productsCost: 20000, paymentFee: 550, taxes: 4000, adCost: 13000, profit: 12450 });
  });
  it('usa comisión exacta si la orden la trae', () => {
    const r = computeSaleProfit({
      productsRevenue: 50000, shippingCharged: 0, productsCost: 20000,
      payment: { method: 'card', installments: 3, exactFee: 3100 }, estimatedCpa: 0,
    }, config);
    expect(r.paymentFee).toBe(3100);
  });
  it('multiplicador Meta desactivado no infla adCost', () => {
    const r = computeSaleProfit({
      productsRevenue: 50000, shippingCharged: 0, productsCost: 20000,
      payment: { method: 'transfer' }, estimatedCpa: 10000,
    }, { ...config, metaSurchargeEnabled: false });
    expect(r.adCost).toBe(10000);
  });
  it('una venta puede dar pérdida', () => {
    const r = computeSaleProfit({
      productsRevenue: 30000, shippingCharged: 0, productsCost: 25000,
      payment: { method: 'card', installments: 3 }, estimatedCpa: 8000,
    }, config);
    expect(r.profit).toBeLessThan(0);
  });
});

describe('breakEvenRoas', () => {
  it('producto con buen margen → ROAS de equilibrio bajo', () => {
    // margen antes de ads = 50000*(1-0.049-0.08) - 20000 = 23550
    // beROAS = 50000*1.3/23550 ≈ 2.76
    expect(breakEvenRoas({ price: 50000, cost: 20000 }, config)).toBeCloseTo(2.76, 2);
  });
  it('producto que pierde antes de ads → Infinity', () =>
    expect(breakEvenRoas({ price: 20000, cost: 19000 }, config)).toBe(Infinity));
});
```

- [ ] **Step 2: Correr** — `npx vitest run test/profit.test.js` — Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

`backend/src/engine/profit.js`:
```js
// Matemática de rentabilidad. Toda la plata en ARS. Funciones puras.
const round2 = (n) => Math.round(n * 100) / 100;

export function paymentFeePct(payment, feeTable) {
  if (payment.method === 'transfer') return feeTable.transfer;
  return (payment.installments || 1) >= 3 ? feeTable.card_3 : feeTable.card_1;
}

export function computeSaleProfit(sale, config) {
  const { productsRevenue, productsCost, payment, estimatedCpa } = sale;
  const fee = payment.exactFee ??
    (productsRevenue + (sale.shippingCharged || 0)) * paymentFeePct(payment, config.paymentFees);
  const taxes = productsRevenue * config.taxPct;
  const mult = config.metaSurchargeEnabled ? config.metaSurcharge : 1;
  const adCost = (estimatedCpa || 0) * mult;
  return {
    revenue: round2(productsRevenue),
    productsCost: round2(productsCost),
    paymentFee: round2(fee),
    taxes: round2(taxes),
    adCost: round2(adCost),
    profit: round2(productsRevenue - productsCost - fee - taxes - adCost),
  };
}

// ROAS mínimo para que UNA venta de este producto no pierda plata.
// Conservador: asume el fee de tarjeta 1 cuota (peor caso habitual).
export function breakEvenRoas(product, config) {
  const marginBeforeAds = product.price * (1 - config.paymentFees.card_1 - config.taxPct) - product.cost;
  if (marginBeforeAds <= 0) return Infinity;
  const mult = config.metaSurchargeEnabled ? config.metaSurcharge : 1;
  return round2((product.price * mult) / marginBeforeAds);
}
```

- [ ] **Step 4: Correr** — `npx vitest run test/profit.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add backend/ && git commit -m "feat: motor de rentabilidad (profit, break-even ROAS)"`

---

### Task 3: Config store con defaults + fake Firestore para tests

**Files:**
- Create: `backend/src/config/defaults.js`, `backend/src/config/configStore.js`, `backend/test/helpers/fakeFirestore.js`
- Test: `backend/test/configStore.test.js`

**Interfaces:**
- Produces:
  - `DEFAULTS` — objeto de config por defecto (shape abajo).
  - `createConfigStore(db)` → `{ get(): Promise<config>, update(patch): Promise<config> }`. Cache en memoria 60s; `update` invalida.
  - `createFakeFirestore()` → fake in-memory con la sub-API de Firestore que usamos (`collection().doc().get/set/create/update/delete`, `collection().add`, `where('f','==',v).get()`, `orderBy().limit().get()`). Lo usan TODOS los tests de stores.

- [ ] **Step 1: Fake Firestore (helper de test, sin test propio)**

`backend/test/helpers/fakeFirestore.js`:
```js
// Fake mínimo de Firestore para tests. Solo la sub-API que usa el backend.
export function createFakeFirestore() {
  const data = {}; // { colName: { docId: {...} } }
  function collection(name) {
    data[name] ||= {};
    let autoInc = 0;
    return {
      doc(id = `auto_${++autoInc}_${Date.now()}`) {
        return {
          id,
          async get() { const d = data[name][id]; return { exists: !!d, id, data: () => d }; },
          async set(v, opts) { data[name][id] = opts?.merge ? { ...data[name][id], ...v } : { ...v }; },
          async create(v) {
            if (data[name][id]) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
            data[name][id] = { ...v };
          },
          async update(v) { data[name][id] = { ...data[name][id], ...v }; },
          async delete() { delete data[name][id]; },
        };
      },
      async add(v) { const id = `auto_${Object.keys(data[name]).length + 1}`; data[name][id] = { ...v }; return { id }; },
      where(f, _op, v) {
        const filters = [[f, v]];
        const q = {
          where(f2, _o2, v2) { filters.push([f2, v2]); return q; },
          async get() {
            const docs = Object.entries(data[name])
              .filter(([, d]) => filters.every(([ff, vv]) => d[ff] === vv))
              .map(([id, d]) => ({ id, data: () => d }));
            return { docs };
          },
        };
        return q;
      },
      orderBy(field, dir = 'asc') {
        return {
          limit(n) {
            return {
              async get() {
                const docs = Object.entries(data[name]).map(([id, d]) => ({ id, data: () => d }))
                  .sort((a, b) => {
                    const cmp = a.data()[field] < b.data()[field] ? -1 : 1;
                    return dir === 'desc' ? -cmp : cmp;
                  })
                  .slice(0, n);
                return { docs };
              },
            };
          },
        };
      },
    };
  }
  return { collection, _data: data };
}
```

- [ ] **Step 2: Test de configStore que falla**

`backend/test/configStore.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createConfigStore } from '../src/config/configStore.js';

describe('configStore', () => {
  it('devuelve defaults si no hay doc guardado', async () => {
    const store = createConfigStore(createFakeFirestore());
    const c = await store.get();
    expect(c.targetRoasFloor).toBe(7);
    expect(c.metaSurcharge).toBe(1.3);
    expect(c.autonomousMode).toBe(true);
  });
  it('mergea overrides guardados sobre defaults', async () => {
    const store = createConfigStore(createFakeFirestore());
    await store.update({ taxPct: 0.05 });
    const c = await store.get();
    expect(c.taxPct).toBe(0.05);
    expect(c.metaSurcharge).toBe(1.3); // default intacto
  });
});
```

Correr: `npx vitest run test/configStore.test.js` — Expected: FAIL.

- [ ] **Step 3: Implementación**

`backend/src/config/defaults.js`:
```js
// Valores por defecto — TODOS editables desde el dashboard (colección config, doc 'main').
// Los % de comisión e impuestos son estimaciones iniciales: el usuario los ajusta con los reales.
export const DEFAULTS = {
  targetRoasFloor: 7,
  dailyBudgetMinArs: 30000,
  dailyBudgetMaxArs: 50000,
  metaSurcharge: 1.3,          // recargo por pagar Meta en ARS vía MercadoPago
  metaSurchargeEnabled: true,  // apagar cuando el usuario migre a dólar app
  taxPct: 0.08,
  paymentFees: { transfer: 0.01, card_1: 0.049, card_3: 0.089 },
  autonomousMode: true,        // kill switch: en false, TODO va a pending
  minMinutesBetweenSaleRuns: 30,
  // Mapeo para naming convention de anuncios nuevos
  adsetTags: {
    '120240905711110412': 'ATC14D',
    '120240906047320412': 'CATALOGO',
    '120240711724490412': 'BROADIG',
  },
  funnelByAdset: {
    '120240905711110412': 'CALIENTE',
    '120240906047320412': 'CALIENTE',
    '120240711724490412': 'FRIO',
  },
};
```

`backend/src/config/configStore.js`:
```js
import { DEFAULTS } from './defaults.js';

export function createConfigStore(db) {
  const ref = db.collection('config').doc('main');
  let cache = null, cacheAt = 0;
  return {
    async get() {
      if (cache && Date.now() - cacheAt < 60_000) return cache;
      const snap = await ref.get();
      cache = { ...DEFAULTS, ...(snap.exists ? snap.data() : {}) };
      cacheAt = Date.now();
      return cache;
    },
    async update(patch) {
      await ref.set(patch, { merge: true });
      cache = null;
      return this.get();
    },
  };
}
```

- [ ] **Step 4: Correr** — `npx vitest run test/configStore.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add backend/ && git commit -m "feat: config store con defaults editables + fake firestore de test"`

---

### Task 4: Stores de Firestore (decisions, sales, learnings, proposals, creatives, agentState)

**Files:**
- Create: `backend/src/store/decisions.js`, `backend/src/store/sales.js`, `backend/src/store/learnings.js`, `backend/src/store/proposals.js`, `backend/src/store/creatives.js`, `backend/src/store/agentState.js`
- Test: `backend/test/stores.test.js`

**Interfaces:**
- Produces (todas reciben `db` — real o fake):
  - `createDecisionsStore(db)` → `{ add(d), setStatus(id, status, extra?), get(id), listPending(), listRecent(limit?), listExecutedWithoutOutcome(olderThanIso) }`. `add` agrega `createdAt` ISO y devuelve `{ id, ...d }`.
  - `createSalesStore(db)` → `{ addIfNew(orderId, sale): Promise<boolean>, listRecent(limit?) }` — dedupe por doc id = orderId.
  - `createLearningsStore(db)` → `{ upsert({ learning_id?, text, evidence, status? }): Promise<id>, listActive(), remove(id) }`.
  - `createProposalsStore(db)` → `{ add({ title, body }), list() }`.
  - `createCreativesStore(db)` → `{ add(c): Promise<id>, get(id), listUnused(), list(), markUsed(id, adId) }`.
  - `createAgentStateStore(db)` → `{ get(): Promise<{ pendingOrderIds: string[], lastSaleRunAt: string|null }>, set(patch) }`.

- [ ] **Step 1: Tests que fallan**

`backend/test/stores.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createDecisionsStore } from '../src/store/decisions.js';
import { createSalesStore } from '../src/store/sales.js';
import { createLearningsStore } from '../src/store/learnings.js';
import { createCreativesStore } from '../src/store/creatives.js';
import { createAgentStateStore } from '../src/store/agentState.js';

describe('decisions', () => {
  it('add + listPending + setStatus', async () => {
    const s = createDecisionsStore(createFakeFirestore());
    const d = await s.add({ tool: 'propose_budget_change', status: 'pending', reason: 'x' });
    expect((await s.listPending())).toHaveLength(1);
    await s.setStatus(d.id, 'approved', { approvedAt: 'now' });
    expect((await s.listPending())).toHaveLength(0);
    expect((await s.get(d.id)).status).toBe('approved');
  });
  it('listExecutedWithoutOutcome filtra por fecha y outcome', async () => {
    const s = createDecisionsStore(createFakeFirestore());
    const old = await s.add({ tool: 'pause_ad', status: 'executed' });
    await s.setStatus(old.id, 'executed', { createdAt: '2026-07-10T00:00:00Z' });
    await s.add({ tool: 'pause_ad', status: 'executed' }); // reciente, queda afuera
    const list = await s.listExecutedWithoutOutcome('2026-07-12T00:00:00Z');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(old.id);
  });
});

describe('sales dedupe', () => {
  it('la segunda inserción del mismo orderId devuelve false', async () => {
    const s = createSalesStore(createFakeFirestore());
    expect(await s.addIfNew(123, { profit: 10 })).toBe(true);
    expect(await s.addIfNew(123, { profit: 10 })).toBe(false);
  });
});

describe('learnings', () => {
  it('upsert nuevo y update por id', async () => {
    const s = createLearningsStore(createFakeFirestore());
    const id = await s.upsert({ text: 'IG Engagers 30D no convierte', evidence: '3 ciclos $0' });
    expect((await s.listActive())).toHaveLength(1);
    await s.upsert({ learning_id: id, text: 'x', evidence: 'y', status: 'obsolete' });
    expect((await s.listActive())).toHaveLength(0);
  });
});

describe('creatives', () => {
  it('listUnused excluye usados', async () => {
    const s = createCreativesStore(createFakeFirestore());
    const id = await s.add({ name: 'BORDO', copy: 'Tu uniforme', funnel: 'caliente', status: 'unused' });
    expect((await s.listUnused())).toHaveLength(1);
    await s.markUsed(id, 'ad_1');
    expect((await s.listUnused())).toHaveLength(0);
    expect((await s.get(id)).adId).toBe('ad_1');
  });
});

describe('agentState', () => {
  it('default vacío y merge de patch', async () => {
    const s = createAgentStateStore(createFakeFirestore());
    expect((await s.get()).pendingOrderIds).toEqual([]);
    await s.set({ pendingOrderIds: ['1'], lastSaleRunAt: '2026-07-14T12:00:00Z' });
    expect((await s.get()).pendingOrderIds).toEqual(['1']);
  });
});
```

Correr: `npx vitest run test/stores.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementar los 6 stores**

`backend/src/store/decisions.js`:
```js
export function createDecisionsStore(db) {
  const col = db.collection('decisions');
  return {
    async add(d) {
      const doc = { createdAt: new Date().toISOString(), ...d };
      const ref = await col.add(doc);
      return { id: ref.id, ...doc };
    },
    async setStatus(id, status, extra = {}) { await col.doc(id).set({ status, ...extra }, { merge: true }); },
    async get(id) { const s = await col.doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null; },
    async listPending() {
      const s = await col.where('status', '==', 'pending').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async listRecent(limit = 50) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async listExecutedWithoutOutcome(olderThanIso) {
      const s = await col.where('status', '==', 'executed').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => !x.outcome && x.createdAt < olderThanIso);
    },
  };
}
```

`backend/src/store/sales.js`:
```js
export function createSalesStore(db) {
  const col = db.collection('sales');
  return {
    async addIfNew(orderId, sale) {
      try {
        await col.doc(String(orderId)).create({ ...sale, orderId: String(orderId), createdAt: new Date().toISOString() });
        return true;
      } catch (e) {
        if (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message))) return false;
        throw e;
      }
    },
    async listRecent(limit = 100) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}
```

`backend/src/store/learnings.js`:
```js
export function createLearningsStore(db) {
  const col = db.collection('learnings');
  return {
    async upsert({ learning_id, text, evidence, status = 'active' }) {
      if (learning_id) {
        await col.doc(learning_id).set({ text, evidence, status, updatedAt: new Date().toISOString() }, { merge: true });
        return learning_id;
      }
      const ref = await col.add({ text, evidence, status, createdAt: new Date().toISOString() });
      return ref.id;
    },
    async listActive() {
      const s = await col.where('status', '==', 'active').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async remove(id) { await col.doc(id).delete(); },
  };
}
```

`backend/src/store/proposals.js`:
```js
export function createProposalsStore(db) {
  const col = db.collection('proposals');
  return {
    async add({ title, body }) {
      const ref = await col.add({ title, body, createdAt: new Date().toISOString() });
      return ref.id;
    },
    async list(limit = 50) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}
```

`backend/src/store/creatives.js`:
```js
export function createCreativesStore(db) {
  const col = db.collection('creatives');
  return {
    async add(c) {
      const ref = await col.add({ status: 'unused', createdAt: new Date().toISOString(), ...c });
      return ref.id;
    },
    async get(id) { const s = await col.doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null; },
    async listUnused() {
      const s = await col.where('status', '==', 'unused').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async list(limit = 100) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async markUsed(id, adId) {
      await col.doc(id).set({ status: 'used', adId, usedAt: new Date().toISOString() }, { merge: true });
    },
  };
}
```

`backend/src/store/agentState.js`:
```js
export function createAgentStateStore(db) {
  const ref = db.collection('agent_state').doc('main');
  return {
    async get() {
      const s = await ref.get();
      return { pendingOrderIds: [], lastSaleRunAt: null, ...(s.exists ? s.data() : {}) };
    },
    async set(patch) { await ref.set(patch, { merge: true }); },
  };
}
```

- [ ] **Step 3: Correr** — `npx vitest run test/stores.test.js` — Expected: PASS.

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: stores de firestore (decisions, sales, learnings, proposals, creatives, agentState)"`

---

### Task 5: Verificación HMAC + webhook de Tienda Nube

**Files:**
- Create: `backend/src/services/hmac.js`, `backend/src/routes/webhooks.js`
- Test: `backend/test/webhook.test.js`

**Interfaces:**
- Produces:
  - `verifyTiendanubeHmac(rawBodyBuffer, headerValue, secret)` → boolean (timing-safe).
  - `createWebhookRouter({ secret, onOrderEvent })` → Express Router. Monta `POST /tiendanube`. `onOrderEvent(event)` se llama fire-and-forget DESPUÉS de responder 200 (TN reintenta si tardamos >10s). Eventos que disparan: `order/created` y `order/paid`.
- Consumes: nada de tasks anteriores.

- [ ] **Step 1: Tests que fallan**

`backend/test/webhook.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createWebhookRouter } from '../src/routes/webhooks.js';

const SECRET = 'test-secret';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');

function makeApp(onOrderEvent = vi.fn().mockResolvedValue()) {
  const app = createApp({ webhookRouter: createWebhookRouter({ secret: SECRET, onOrderEvent }) });
  return { app, onOrderEvent };
}

describe('webhook tiendanube', () => {
  it('rechaza sin firma', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/webhooks/tiendanube').send({ event: 'order/paid', id: 1 });
    expect(res.status).toBe(401);
  });
  it('rechaza firma inválida', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/webhooks/tiendanube')
      .set('x-linkedstore-hmac-sha256', 'deadbeef').send({ event: 'order/paid', id: 1 });
    expect(res.status).toBe(401);
  });
  it('acepta firma válida y dispara el handler', async () => {
    const { app, onOrderEvent } = makeApp();
    const body = JSON.stringify({ event: 'order/paid', id: 999, store_id: 1 });
    const res = await request(app).post('/webhooks/tiendanube')
      .set('content-type', 'application/json')
      .set('x-linkedstore-hmac-sha256', sign(body)).send(body);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10)); // handler corre post-respuesta
    expect(onOrderEvent).toHaveBeenCalledWith({ event: 'order/paid', id: 999, store_id: 1 });
  });
  it('ignora eventos que no son de órdenes', async () => {
    const { app, onOrderEvent } = makeApp();
    const body = JSON.stringify({ event: 'product/updated', id: 5 });
    await request(app).post('/webhooks/tiendanube')
      .set('content-type', 'application/json')
      .set('x-linkedstore-hmac-sha256', sign(body)).send(body);
    await new Promise((r) => setTimeout(r, 10));
    expect(onOrderEvent).not.toHaveBeenCalled();
  });
});
```

Correr: `npx vitest run test/webhook.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementación**

`backend/src/services/hmac.js`:
```js
import crypto from 'node:crypto';

export function verifyTiendanubeHmac(rawBody, headerValue, secret) {
  if (!headerValue || !secret) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(String(headerValue));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

`backend/src/routes/webhooks.js`:
```js
import express from 'express';
import { verifyTiendanubeHmac } from '../services/hmac.js';

const ORDER_EVENTS = new Set(['order/created', 'order/paid']);

export function createWebhookRouter({ secret, onOrderEvent }) {
  const router = express.Router();
  router.post('/tiendanube', express.raw({ type: '*/*' }), (req, res) => {
    if (!verifyTiendanubeHmac(req.body, req.get('x-linkedstore-hmac-sha256'), secret)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    res.json({ ok: true }); // responder YA — TN reintenta si tardamos
    if (ORDER_EVENTS.has(event.event)) {
      Promise.resolve(onOrderEvent(event)).catch((err) => console.error('[webhook] handler falló:', err));
    }
  });
  return router;
}
```

- [ ] **Step 3: Correr** — `npx vitest run test/webhook.test.js` — Expected: PASS.

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: webhook tienda nube con verificación HMAC"`

---

### Task 6: Cliente Tienda Nube + extractor de datos de venta

**Files:**
- Create: `backend/src/services/tiendanube.js`, `backend/src/engine/extractSale.js`
- Test: `backend/test/tiendanube.test.js`

**Interfaces:**
- Produces:
  - `createTiendanubeClient({ storeId, token, fetchFn? })` → `{ getOrder(id), getProducts(page?), listRecentOrders(sinceIso), updateVariantPrice(productId, variantId, price) }`. Auth header de TN es `Authentication: bearer TOKEN` (así, con esa key — quirk de su API).
  - `extractSaleInputs(order, costIndex)` → shape de `sale` para `computeSaleProfit` (Task 2). `costIndex` = `{ [variantId]: costNumber }`.
  - `buildCostIndex(products)` → `costIndex` desde la respuesta de `getProducts` (el costo está en `variant.cost`).
- **Nota de la spec:** al primer webhook real, inspeccionar el payload de la orden y ajustar el mapeo de `payment_details`/`gateway` si difiere — dejar log de la orden cruda en consola la primera vez.

- [ ] **Step 1: Tests que fallan**

`backend/test/tiendanube.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createTiendanubeClient } from '../src/services/tiendanube.js';
import { extractSaleInputs, buildCostIndex } from '../src/engine/extractSale.js';

describe('cliente tiendanube', () => {
  it('getOrder pega al endpoint correcto con auth', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
    const tn = createTiendanubeClient({ storeId: '111', token: 'tok', fetchFn });
    await tn.getOrder(55);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.tiendanube.com/v1/111/orders/55');
    expect(opts.headers.Authentication).toBe('bearer tok');
  });
  it('updateVariantPrice manda PUT con price string', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const tn = createTiendanubeClient({ storeId: '111', token: 'tok', fetchFn });
    await tn.updateVariantPrice(10, 20, 45990);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.tiendanube.com/v1/111/products/10/variants/20');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ price: '45990' });
  });
  it('error HTTP → throw con status', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    const tn = createTiendanubeClient({ storeId: '111', token: 'tok', fetchFn });
    await expect(tn.getOrder(1)).rejects.toThrow(/429/);
  });
});

describe('extractSaleInputs', () => {
  const order = {
    products: [
      { variant_id: 100, price: '25000.00', quantity: 2 },
      { variant_id: 200, price: '10000.00', quantity: 1 },
    ],
    shipping_cost_customer: '5000.00',
    gateway: 'nuvempago',
    payment_details: { method: 'credit_card', installments: '3' },
  };
  it('mapea revenue, costo, envío y pago', () => {
    const r = extractSaleInputs(order, { 100: 9000, 200: 4000 });
    expect(r.productsRevenue).toBe(60000);
    expect(r.productsCost).toBe(22000);
    expect(r.shippingCharged).toBe(5000);
    expect(r.payment).toEqual({ method: 'card', installments: 3 });
  });
  it('transferencia se detecta por payment_details.method', () => {
    const r = extractSaleInputs({ ...order, payment_details: { method: 'bank_transfer' } }, {});
    expect(r.payment.method).toBe('transfer');
  });
  it('variante sin costo cargado cuenta 0 (y se loguea aparte)', () => {
    const r = extractSaleInputs(order, {});
    expect(r.productsCost).toBe(0);
    expect(r.missingCosts).toEqual([100, 200]);
  });
});

describe('buildCostIndex', () => {
  it('indexa variant.cost por id', () => {
    const idx = buildCostIndex([
      { id: 1, variants: [{ id: 100, cost: '9000.00' }, { id: 101, cost: null }] },
    ]);
    expect(idx).toEqual({ 100: 9000 });
  });
});
```

Correr: `npx vitest run test/tiendanube.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementación**

`backend/src/services/tiendanube.js`:
```js
const BASE = 'https://api.tiendanube.com/v1';

export function createTiendanubeClient({ storeId, token, fetchFn = fetch }) {
  const headers = {
    Authentication: `bearer ${token}`, // sí: "Authentication", no "Authorization" — quirk de TN
    'User-Agent': 'gineza-agent (jdilernia99@gmail.com)',
    'Content-Type': 'application/json',
  };
  async function req(path, opts = {}) {
    const res = await fetchFn(`${BASE}/${storeId}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
    if (!res.ok) throw new Error(`Tienda Nube ${res.status}: ${await res.text()}`);
    return res.json();
  }
  return {
    getOrder: (id) => req(`/orders/${id}`),
    getProducts: (page = 1) => req(`/products?per_page=200&page=${page}`),
    listRecentOrders: (sinceIso) => req(`/orders?created_at_min=${encodeURIComponent(sinceIso)}&per_page=200`),
    updateVariantPrice: (productId, variantId, price) =>
      req(`/products/${productId}/variants/${variantId}`, { method: 'PUT', body: JSON.stringify({ price: String(price) }) }),
  };
}
```

`backend/src/engine/extractSale.js`:
```js
// Mapea una orden de Tienda Nube a los inputs de computeSaleProfit.
// OJO: al primer webhook real, loguear la orden cruda y validar este mapeo contra el payload real (spec §4).
export function extractSaleInputs(order, costIndex) {
  let productsRevenue = 0, productsCost = 0;
  const missingCosts = [];
  for (const p of order.products || []) {
    productsRevenue += Number(p.price) * p.quantity;
    const cost = costIndex[String(p.variant_id)] ?? costIndex[p.variant_id];
    if (cost == null) missingCosts.push(p.variant_id);
    else productsCost += cost * p.quantity;
  }
  const method = order.payment_details?.method === 'bank_transfer' ? 'transfer' : 'card';
  return {
    productsRevenue,
    productsCost,
    shippingCharged: Number(order.shipping_cost_customer || 0),
    payment: { method, installments: Number(order.payment_details?.installments || 1) },
    ...(missingCosts.length ? { missingCosts } : {}),
  };
}

export function buildCostIndex(products) {
  const idx = {};
  for (const prod of products) {
    for (const v of prod.variants || []) {
      const cost = Number(v.cost);
      if (v.cost != null && !Number.isNaN(cost) && cost > 0) idx[v.id] = cost;
    }
  }
  return idx;
}
```

- [ ] **Step 3: Correr** — `npx vitest run test/tiendanube.test.js` — Expected: PASS. (Si el test de `missingCosts` falla por el spread condicional, ajustar el test para chequear `r.missingCosts` solo cuando existe — el comportamiento correcto es: la key aparece solo si falta algún costo.)

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: cliente tienda nube + extractor de venta con costos"`

---

### Task 7: Cliente Meta Graph API + naming + spec de creative

**Files:**
- Create: `backend/src/services/meta.js`, `backend/src/engine/naming.js`, `backend/src/engine/creativeSpec.js`
- Test: `backend/test/meta.test.js`

**Interfaces:**
- Produces:
  - `createMetaClient({ accessToken, accountId, fetchFn? })` → `{ getCampaigns(), getAdsets(), getAds(), getInsights(level, since, until), pauseAd(adId), updateBudget(objectId, dailyBudgetCents), updateAdsetStatus(id, status), createAdset(payload), createCampaign(payload), uploadImage(buffer): Promise<hash>, createCreative(spec): Promise<{id}>, createAd({ name, adsetId, creativeId, status? }) }`. Versión de API `v23.0`. Errores de Graph (`json.error`) → throw `Meta {code}: {message}`. Reintento simple: en error de red o status 5xx/rate-limit (code 17, 32, 613), esperar 2s y reintentar 1 vez.
  - `buildAdName({ funnel, adsetTag, creativeName, date? })` → `'CALIENTE_ATC14D_BORDO_20260714'` (mayúsculas, sin acentos ni símbolos).
  - `buildPlacementCreativeSpec({ name, pageId, igActorId, link, message, feedImageHash, storyImageHash })` → payload para `POST /adcreatives` con `optimization_type: 'PLACEMENT'`, imágenes etiquetadas feed/story y enhancements OPT_OUT. **Conocimiento ganado en sesiones previas:** `image_label` dentro de `asset_customization_rules` DEBE ser objeto `{ name: 'feed' }`, no string — con string Meta tira `(#100) Labels' spec should consist of json objects`.

- [ ] **Step 1: Tests que fallan**

`backend/test/meta.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createMetaClient } from '../src/services/meta.js';
import { buildAdName } from '../src/engine/naming.js';
import { buildPlacementCreativeSpec } from '../src/engine/creativeSpec.js';

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

describe('cliente meta', () => {
  it('pauseAd hace POST al ad con status PAUSED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ success: true }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    await meta.pauseAd('120001');
    const [url, opts] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/v23.0/120001');
    expect(String(url)).toContain('access_token=tok');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ status: 'PAUSED' });
  });
  it('error de Graph API → throw con código y mensaje', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ error: { code: 100, message: 'Invalid parameter' } }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    await expect(meta.getCampaigns()).rejects.toThrow('Meta 100: Invalid parameter');
  });
  it('rate limit (code 17) reintenta una vez', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(okJson({ error: { code: 17, message: 'rate limit' } }))
      .mockResolvedValueOnce(okJson({ data: [] }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn, retryDelayMs: 1 });
    expect(await meta.getCampaigns()).toEqual({ data: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('buildAdName', () => {
  it('formato FUNNEL_TAG_CREATIVO_FECHA, sin acentos', () => {
    expect(buildAdName({ funnel: 'caliente', adsetTag: 'ATC14D', creativeName: 'Bordó', date: new Date('2026-07-14T12:00:00Z') }))
      .toBe('CALIENTE_ATC14D_BORDO_20260714');
  });
});

describe('buildPlacementCreativeSpec', () => {
  const spec = buildPlacementCreativeSpec({
    name: 'X', pageId: 'p1', igActorId: 'ig1', link: 'https://ginezaonline.com/',
    message: 'Tu uniforme', feedImageHash: 'h_feed', storyImageHash: 'h_story',
  });
  it('image_label es objeto {name}, NUNCA string (error #100 de Meta)', () => {
    for (const rule of spec.asset_feed_spec.asset_customization_rules) {
      expect(typeof rule.image_label).toBe('object');
      expect(typeof rule.image_label.name).toBe('string');
    }
  });
  it('enhancements de IA desactivados y optimization PLACEMENT', () => {
    expect(spec.degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status).toBe('OPT_OUT');
    expect(spec.asset_feed_spec.optimization_type).toBe('PLACEMENT');
  });
});
```

Correr: `npx vitest run test/meta.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementación**

`backend/src/engine/naming.js`:
```js
const clean = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '');

export function buildAdName({ funnel, adsetTag, creativeName, date = new Date() }) {
  const d = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `${clean(funnel)}_${clean(adsetTag)}_${clean(creativeName)}_${d}`;
}
```

`backend/src/engine/creativeSpec.js`:
```js
// Spec de creative con customización por placement (feed 4:5 / story 9:16).
// Reglas ganadas con sangre en sesiones previas:
//  - image_label DEBE ser objeto {name}, no string (error #100 de Meta si no).
//  - standard_enhancements OPT_OUT: el usuario no quiere mejoras de IA. No negociable.
export function buildPlacementCreativeSpec({ name, pageId, igActorId, link, message, feedImageHash, storyImageHash }) {
  return {
    name,
    object_story_spec: { page_id: pageId, instagram_actor_id: igActorId },
    asset_feed_spec: {
      images: [
        { hash: feedImageHash, adlabels: [{ name: 'feed' }] },
        { hash: storyImageHash, adlabels: [{ name: 'story' }] },
      ],
      bodies: [{ text: message }],
      titles: [{ text: name }],
      link_urls: [{ website_url: link }],
      ad_formats: ['SINGLE_IMAGE'],
      call_to_action_types: ['SHOP_NOW'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] },
          image_label: { name: 'feed' },
        },
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story'], instagram_positions: ['story'] },
          image_label: { name: 'story' },
        },
      ],
    },
    degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
  };
}
```

`backend/src/services/meta.js`:
```js
const V = 'v23.0';
const RETRYABLE = new Set([17, 32, 613]); // rate limits de Graph API

export function createMetaClient({ accessToken, accountId, fetchFn = fetch, retryDelayMs = 2000 }) {
  const BASE = `https://graph.facebook.com/${V}`;

  async function reqOnce(path, { method = 'GET', params = {}, body } = {}) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('access_token', accessToken);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    const res = await fetchFn(url, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const json = await res.json();
    if (json.error) {
      const err = new Error(`Meta ${json.error.code}: ${json.error.message}`);
      err.code = json.error.code;
      throw err;
    }
    return json;
  }

  async function req(path, opts) {
    try {
      return await reqOnce(path, opts);
    } catch (err) {
      if (RETRYABLE.has(err.code)) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return reqOnce(path, opts);
      }
      throw err;
    }
  }

  const FIELDS = {
    campaign: 'id,name,status,effective_status,daily_budget',
    adset: 'id,name,status,effective_status,daily_budget,campaign_id',
    ad: 'id,name,status,effective_status,adset_id',
    insights: 'campaign_id,adset_id,ad_id,ad_name,spend,purchase_roas,actions,action_values',
  };

  return {
    getCampaigns: () => req(`${accountId}/campaigns`, { params: { fields: FIELDS.campaign, limit: '100' } }),
    getAdsets: () => req(`${accountId}/adsets`, { params: { fields: FIELDS.adset, limit: '200' } }),
    getAds: () => req(`${accountId}/ads`, { params: { fields: FIELDS.ad, limit: '500' } }),
    getInsights: (level, since, until) => req(`${accountId}/insights`, {
      params: { level, fields: FIELDS.insights, time_range: { since, until }, limit: '500' },
    }),
    pauseAd: (adId) => req(adId, { method: 'POST', body: { status: 'PAUSED' } }),
    updateBudget: (objectId, dailyBudgetCents) => req(objectId, { method: 'POST', body: { daily_budget: dailyBudgetCents } }),
    updateAdsetStatus: (id, status) => req(id, { method: 'POST', body: { status } }),
    createAdset: (payload) => req(`${accountId}/adsets`, { method: 'POST', body: payload }),
    createCampaign: (payload) => req(`${accountId}/campaigns`, { method: 'POST', body: payload }),
    async uploadImage(buffer) {
      const json = await req(`${accountId}/adimages`, { method: 'POST', body: { bytes: buffer.toString('base64') } });
      return Object.values(json.images)[0].hash;
    },
    createCreative: (spec) => req(`${accountId}/adcreatives`, { method: 'POST', body: spec }),
    createAd: ({ name, adsetId, creativeId, status = 'ACTIVE' }) =>
      req(`${accountId}/ads`, { method: 'POST', body: { name, adset_id: adsetId, creative: { creative_id: creativeId }, status } }),
  };
}
```

- [ ] **Step 3: Correr** — `npx vitest run test/meta.test.js` — Expected: PASS.

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: cliente meta graph api + naming convention + spec de creative sin IA"`

---

### Task 8: Tools del agente + dispatcher + creación de anuncios

**Files:**
- Create: `backend/src/agent/tools.js`, `backend/src/agent/dispatcher.js`, `backend/src/agent/createAd.js`
- Test: `backend/test/dispatcher.test.js`

**Interfaces:**
- Consumes: `createMetaClient` (Task 7), stores (Task 4), `createConfigStore` (Task 3), `buildAdName`/`buildPlacementCreativeSpec` (Task 7).
- Produces:
  - `TOOL_DEFINITIONS` — array de tools formato Anthropic (name, description, input_schema).
  - `createAdBuilder({ meta, storage, stores, configStore, pageId, igActorId, linkUrl })` → `async createAdFromCreative({ creative_id, adset_id })` → `{ ad_id, name }`. `storage` es el wrapper de Task 12 con `download(path): Promise<Buffer>`.
  - `createToolDispatcher({ meta, stores, configStore, createAdFromCreative })` → `async dispatch(toolName, input)` → objeto resultado para devolver a Claude. **Reglas:** `pause_ad`/`create_ad` autónomas SALVO `config.autonomousMode === false` (→ pending). `propose_*` SIEMPRE pending. `log_improvement_proposal`/`save_learning`/`record_outcome` solo escriben. TODA invocación queda en `decisions` (executed/pending/failed) salvo las de solo-registro.

- [ ] **Step 1: Tests que fallan**

`backend/test/dispatcher.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createToolDispatcher } from '../src/agent/dispatcher.js';
import { createDecisionsStore } from '../src/store/decisions.js';
import { createLearningsStore } from '../src/store/learnings.js';
import { createProposalsStore } from '../src/store/proposals.js';
import { createConfigStore } from '../src/config/configStore.js';

let db, stores, configStore, meta, createAdFromCreative, dispatch;

beforeEach(() => {
  db = createFakeFirestore();
  stores = {
    decisions: createDecisionsStore(db),
    learnings: createLearningsStore(db),
    proposals: createProposalsStore(db),
  };
  configStore = createConfigStore(db);
  meta = { pauseAd: vi.fn().mockResolvedValue({ success: true }) };
  createAdFromCreative = vi.fn().mockResolvedValue({ ad_id: 'ad_9', name: 'X' });
  dispatch = createToolDispatcher({ meta, stores, configStore, createAdFromCreative });
});

describe('dispatcher', () => {
  it('pause_ad autónomo: ejecuta y registra executed', async () => {
    const r = await dispatch('pause_ad', { ad_id: '120', reason: 'sin ventas', expected_impact: 'redistribuye gasto' });
    expect(r.ok).toBe(true);
    expect(meta.pauseAd).toHaveBeenCalledWith('120');
    const recent = await stores.decisions.listRecent();
    expect(recent[0]).toMatchObject({ tool: 'pause_ad', status: 'executed', reason: 'sin ventas' });
  });
  it('kill switch: pause_ad va a pending y NO toca Meta', async () => {
    await configStore.update({ autonomousMode: false });
    const r = await dispatch('pause_ad', { ad_id: '120', reason: 'x', expected_impact: 'y' });
    expect(r.queued).toBe(true);
    expect(meta.pauseAd).not.toHaveBeenCalled();
    expect(await stores.decisions.listPending()).toHaveLength(1);
  });
  it('propose_budget_change SIEMPRE queda pending', async () => {
    const r = await dispatch('propose_budget_change', {
      level: 'adset', object_id: '456', current_budget: 21500, proposed_budget: 25000,
      reason: 'ROAS 8x sostenido', expected_impact: '+3 ventas/día',
    });
    expect(r.queued).toBe(true);
    const [d] = await stores.decisions.listPending();
    expect(d.tool).toBe('propose_budget_change');
    expect(d.input.proposed_budget).toBe(25000);
  });
  it('error de Meta → decisión failed + error devuelto a Claude', async () => {
    meta.pauseAd.mockRejectedValue(new Error('Meta 100: bad'));
    const r = await dispatch('pause_ad', { ad_id: '120', reason: 'x', expected_impact: 'y' });
    expect(r.error).toMatch(/Meta 100/);
    const recent = await stores.decisions.listRecent();
    expect(recent[0].status).toBe('failed');
  });
  it('save_learning guarda lección activa', async () => {
    const r = await dispatch('save_learning', { text: 'genéricos rinden en frío', evidence: '2 ciclos' });
    expect(r.ok).toBe(true);
    expect(await stores.learnings.listActive()).toHaveLength(1);
  });
  it('record_outcome escribe outcome en la decisión', async () => {
    const d = await stores.decisions.add({ tool: 'pause_ad', status: 'executed' });
    await dispatch('record_outcome', { decision_id: d.id, outcome: 'ROAS del conjunto subió 6.9→7.4' });
    expect((await stores.decisions.get(d.id)).outcome).toMatch(/7.4/);
  });
  it('tool desconocida → error sin romper', async () => {
    const r = await dispatch('inventada', {});
    expect(r.error).toMatch(/desconocida/);
  });
});
```

Correr: `npx vitest run test/dispatcher.test.js` — Expected: FAIL.

- [ ] **Step 2: Definiciones de tools**

`backend/src/agent/tools.js`:
```js
const s = (desc) => ({ type: 'string', description: desc });
const n = (desc) => ({ type: 'number', description: desc });
const baseReq = ['reason', 'expected_impact'];
const base = {
  reason: s('Por qué tomás esta decisión, con los números que la justifican'),
  expected_impact: s('Qué esperás que pase y en cuánto tiempo se puede medir'),
};

export const TOOL_DEFINITIONS = [
  {
    name: 'pause_ad',
    description: 'Pausa un anuncio de Meta Ads. Se ejecuta inmediatamente sin aprobación. Usar para ads con gasto real y $0 conversión o fatiga clara.',
    input_schema: { type: 'object', properties: { ad_id: s('ID del anuncio'), ...base }, required: ['ad_id', ...baseReq] },
  },
  {
    name: 'create_ad',
    description: 'Crea un anuncio nuevo en un adset usando un creativo subido desde el dashboard (por su creative_id de la lista de creativos sin usar). Se ejecuta inmediatamente sin aprobación.',
    input_schema: { type: 'object', properties: { creative_id: s('ID del creativo en Firestore (de la lista unusedCreatives)'), adset_id: s('ID del adset destino'), ...base }, required: ['creative_id', 'adset_id', ...baseReq] },
  },
  {
    name: 'propose_price_change',
    description: 'Propone cambiar el precio de una variante de producto en Tienda Nube. QUEDA PENDIENTE de aprobación humana. Incluir el cálculo de margen completo en reason.',
    input_schema: { type: 'object', properties: { product_id: s('ID producto TN'), variant_id: s('ID variante TN'), product_name: s('Nombre legible'), current_price: n('Precio actual ARS'), proposed_price: n('Precio propuesto ARS'), ...base }, required: ['product_id', 'variant_id', 'current_price', 'proposed_price', ...baseReq] },
  },
  {
    name: 'propose_budget_change',
    description: 'Propone cambiar el presupuesto diario de una campaña o adset. QUEDA PENDIENTE de aprobación humana.',
    input_schema: { type: 'object', properties: { level: { type: 'string', enum: ['campaign', 'adset'] }, object_id: s('ID del objeto'), object_name: s('Nombre legible'), current_budget: n('Presupuesto diario actual ARS'), proposed_budget: n('Presupuesto diario propuesto ARS'), ...base }, required: ['level', 'object_id', 'current_budget', 'proposed_budget', ...baseReq] },
  },
  {
    name: 'propose_campaign_structure_change',
    description: 'Propone pausar o crear conjuntos/campañas. QUEDA PENDIENTE de aprobación humana. Para crear, incluir el payload completo de Graph API en payload.',
    input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['pause_adset', 'pause_campaign', 'create_adset', 'create_campaign'] }, object_id: s('ID del objeto a pausar (para pause_*)'), object_name: s('Nombre legible'), payload: { type: 'object', description: 'Payload Graph API completo (para create_*)' }, ...base }, required: ['action', ...baseReq] },
  },
  {
    name: 'log_improvement_proposal',
    description: 'Registra una idea de mejora que no es una acción directa (ej. "probar remarketing 7D"). Solo se guarda para que el usuario la lea.',
    input_schema: { type: 'object', properties: { title: s('Título corto'), body: s('Desarrollo de la idea con evidencia') }, required: ['title', 'body'] },
  },
  {
    name: 'save_learning',
    description: 'Guarda o actualiza una lección aprendida con evidencia repetida (mínimo 2-3 observaciones consistentes — NUNCA de una sola muestra). Se inyecta en todos los análisis futuros. Pasar learning_id para actualizar una existente o marcarla obsolete.',
    input_schema: { type: 'object', properties: { learning_id: s('ID de lección existente (omitir para crear)'), text: s('La lección, corta y accionable'), evidence: s('Evidencia concreta con fechas y números'), status: { type: 'string', enum: ['active', 'obsolete'] } }, required: ['text', 'evidence'] },
  },
  {
    name: 'record_outcome',
    description: 'Registra el resultado medido de una decisión pasada (usado en la retrospectiva diaria). Comparar el snapshot "antes" con el estado actual.',
    input_schema: { type: 'object', properties: { decision_id: s('ID de la decisión'), outcome: s('Qué pasó realmente, con números') }, required: ['decision_id', 'outcome'] },
  },
];
```

- [ ] **Step 3: Dispatcher y builder de anuncios**

`backend/src/agent/dispatcher.js`:
```js
const PROPOSALS = new Set(['propose_price_change', 'propose_budget_change', 'propose_campaign_structure_change']);

export function createToolDispatcher({ meta, stores, configStore, createAdFromCreative }) {
  return async function dispatch(name, input) {
    const base = { tool: name, input, reason: input.reason ?? null, expectedImpact: input.expected_impact ?? null };
    try {
      if (name === 'pause_ad' || name === 'create_ad') {
        const config = await configStore.get();
        if (!config.autonomousMode) {
          const d = await stores.decisions.add({ ...base, status: 'pending', note: 'modo autónomo apagado' });
          return { queued: true, decision_id: d.id, note: 'modo autónomo apagado: quedó pendiente de aprobación' };
        }
        if (name === 'pause_ad') {
          await meta.pauseAd(input.ad_id);
          await stores.decisions.add({ ...base, status: 'executed' });
          return { ok: true, paused: input.ad_id };
        }
        const ad = await createAdFromCreative(input);
        await stores.decisions.add({ ...base, status: 'executed', result: ad });
        return { ok: true, ...ad };
      }
      if (PROPOSALS.has(name)) {
        const d = await stores.decisions.add({ ...base, status: 'pending' });
        return { queued: true, decision_id: d.id };
      }
      if (name === 'log_improvement_proposal') {
        await stores.proposals.add({ title: input.title, body: input.body });
        return { ok: true };
      }
      if (name === 'save_learning') {
        const id = await stores.learnings.upsert(input);
        return { ok: true, learning_id: id };
      }
      if (name === 'record_outcome') {
        await stores.decisions.setStatus(input.decision_id, 'executed', { outcome: input.outcome, outcomeAt: new Date().toISOString() });
        return { ok: true };
      }
      return { error: `tool desconocida: ${name}` };
    } catch (err) {
      await stores.decisions.add({ ...base, status: 'failed', error: String(err.message || err) });
      return { error: String(err.message || err) };
    }
  };
}
```

`backend/src/agent/createAd.js`:
```js
import { buildAdName } from '../engine/naming.js';
import { buildPlacementCreativeSpec } from '../engine/creativeSpec.js';

export function createAdBuilder({ meta, storage, stores, configStore, pageId, igActorId, linkUrl }) {
  return async function createAdFromCreative({ creative_id, adset_id }) {
    const creative = await stores.creatives.get(creative_id);
    if (!creative) throw new Error(`creativo ${creative_id} no existe`);
    if (creative.status === 'used') throw new Error(`creativo ${creative_id} ya fue usado en el ad ${creative.adId}`);
    const config = await configStore.get();
    const [feedBuf, storyBuf] = await Promise.all([
      storage.download(creative.feedImagePath),
      storage.download(creative.storyImagePath),
    ]);
    const feedHash = await meta.uploadImage(feedBuf);
    const storyHash = await meta.uploadImage(storyBuf);
    const adName = buildAdName({
      funnel: config.funnelByAdset[adset_id] || 'GEN',
      adsetTag: config.adsetTags[adset_id] || 'SINTAG',
      creativeName: creative.name,
    });
    const spec = buildPlacementCreativeSpec({
      name: adName, pageId, igActorId, link: linkUrl,
      message: creative.copy, feedImageHash: feedHash, storyImageHash: storyHash,
    });
    const { id: metaCreativeId } = await meta.createCreative(spec);
    const ad = await meta.createAd({ name: adName, adsetId: adset_id, creativeId: metaCreativeId });
    await stores.creatives.markUsed(creative_id, ad.id);
    return { ad_id: ad.id, name: adName };
  };
}
```

- [ ] **Step 4: Correr** — `npx vitest run test/dispatcher.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add backend/ && git commit -m "feat: tools del agente + dispatcher con buckets autónomo/aprobación"`

---

### Task 9: Contexto base heredado + system prompt + context builder

**Files:**
- Create: `backend/src/agent/baseContext.js`, `backend/src/agent/systemPrompt.js`, `backend/src/agent/contextBuilder.js`
- Test: `backend/test/contextBuilder.test.js`

**Interfaces:**
- Consumes: meta client (Task 7), tn client (Task 6), stores (Task 4), configStore (Task 3), `breakEvenRoas` (Task 2), `buildCostIndex` (Task 6).
- Produces: `createContextBuilder({ meta, tiendanube, stores, configStore })` → `{ build(kind, extra?) }` donde `kind ∈ 'sale' | 'deep' | 'retrospective'`. Devuelve string: BASE_CONTEXT + secciones JSON. `'sale'` es liviano (sin productos TN); `'deep'` agrega tabla de productos con break-even ROAS y ventas recientes; `'retrospective'` agrega decisiones ejecutadas ≥48h sin outcome.

- [ ] **Step 1: Contexto base y system prompt (sin test — son constantes)**

`backend/src/agent/baseContext.js`:
```js
// Conocimiento operativo heredado de las sesiones manuales (spec §9). Estado al 08/07/2026.
export const BASE_CONTEXT = `# Contexto operativo heredado (Gineza, al 08/07/2026)

- Cuenta: GinezaOficial (act_33890648080578737), ARS. Tienda: https://ginezaonline.com/
- Estructura: campaña CALIENTE ABO (120240905711130412) con adsets ADD TO CART 14D (120240905711110412) y CATALOGO CALIENTE AW (120240906047320412); campaña FRIO CBO (120240711724470412) con adset BROAD IG (120240711724490412).
- ADD TO CART 14D: mejor motor histórico (~7-8x ROAS) pero con 92% del gasto concentrado en 1 solo ad (AUD28-POST HOTSALE-Copia) — riesgo de fatiga alto. El 08/07 se subieron 3 creativos nuevos (Blanco, Bordó, Magna Sale) para diversificar.
- CATALOGO CALIENTE AW: reactivado 01/07; 10x ROAS inicial fue muestra chica (2 ventas); después 0 ventas en 5.5 días. En observación: si sigue en 0, bajar presupuesto o pausar.
- IG ENGAGERS 30D (120240905851260412): PAUSADO definitivo tras 3 ciclos (may/jun/jul) de $0 ventas con creativos distintos. La audiencia está saturada. NO reactivar; si se retoma remarketing IG, proponer ventana 7D como estructura nueva.
- FRIO CBO: sólido (6.7-7.7x) pero el más variable semana a semana. CPA más alto que caliente es NORMAL (público frío).
- Regla de diagnóstico: tras un cambio de estructura, aislar la ventana de fechas al período posterior al cambio. No usar "últimos 7 días" a secas si hubo cambios en el medio.
- Regla anti-muestra-chica: no sacar conclusiones con menos de ~5 conversiones o pocos días de datos (el "10x" del catálogo con 2 ventas ya nos quemó una vez).`;
```

`backend/src/agent/systemPrompt.js`:
```js
export const SYSTEM_PROMPT = `Sos el agente autónomo de optimización de e-commerce de Gineza (marca de ropa argentina). Tu objetivo REAL es maximizar la ganancia neta, no el ROAS crudo: una venta con ROAS alto puede perder plata si el margen del producto es flaco.

Reglas de decisión:
1. RENTABILIDAD PRIMERO. Usá el margen neto real y el ROAS de equilibrio por producto (te los doy en el contexto). El ROAS piso blended configurado es una alerta, no el criterio único.
2. El gasto de Meta cuesta un 30% más de lo que reporta (recargo por pago en ARS) mientras metaSurchargeEnabled sea true. Todos tus cálculos deben usar el costo real.
3. Podés ejecutar SIN permiso: pause_ad (ads con gasto y $0 conversión, o fatiga clara) y create_ad (solo con creativos de la lista unusedCreatives, respetando su funnel recomendado).
4. TODO lo demás (precios, presupuestos, estructura de campañas) va por propose_* y queda pendiente de aprobación humana. En reason incluí SIEMPRE los números que justifican la propuesta.
5. Presupuesto diario total: respetá los límites min/max de la config. Nunca propongas salirte de ese rango.
6. Anti-muestra-chica: no saques conclusiones ni guardes learnings con menos de ~5 conversiones o pocos días de datos.
7. Naming: los ads nuevos se nombran solos con la convención. NO propongas renombrar objetos históricos.
8. Si no hay nada para hacer, no fuerces acciones: decilo y terminá. Menos es más con presupuestos chicos.
9. En la retrospectiva: usá record_outcome comparando el snapshot previo con el estado actual, y save_learning SOLO con evidencia repetida.

Respondé siempre en español rioplatense. Sé concreto y numérico en reasons y expected_impacts.`;
```

- [ ] **Step 2: Test del context builder que falla**

`backend/test/contextBuilder.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createContextBuilder } from '../src/agent/contextBuilder.js';
import { createConfigStore } from '../src/config/configStore.js';
import { createDecisionsStore } from '../src/store/decisions.js';
import { createLearningsStore } from '../src/store/learnings.js';
import { createCreativesStore } from '../src/store/creatives.js';
import { createSalesStore } from '../src/store/sales.js';

function makeBuilder() {
  const db = createFakeFirestore();
  const stores = {
    decisions: createDecisionsStore(db),
    learnings: createLearningsStore(db),
    creatives: createCreativesStore(db),
    sales: createSalesStore(db),
  };
  const meta = {
    getCampaigns: vi.fn().mockResolvedValue({ data: [{ id: 'c1', name: 'FRIO CBO' }] }),
    getAdsets: vi.fn().mockResolvedValue({ data: [] }),
    getAds: vi.fn().mockResolvedValue({ data: [] }),
    getInsights: vi.fn().mockResolvedValue({ data: [{ ad_id: 'a1', spend: '1000' }] }),
  };
  const tiendanube = {
    getProducts: vi.fn().mockResolvedValue([
      { id: 1, name: 'Calza Magna', variants: [{ id: 100, price: '50000', cost: '20000' }] },
    ]),
  };
  return { builder: createContextBuilder({ meta, tiendanube, stores, configStore: createConfigStore(db) }), stores, tiendanube };
}

describe('contextBuilder', () => {
  it('sale: incluye base, insights y learnings; NO productos', async () => {
    const { builder, stores } = makeBuilder();
    await stores.learnings.upsert({ text: 'lección X', evidence: 'e' });
    const ctx = await builder.build('sale', { newOrders: [{ id: 1 }] });
    expect(ctx).toContain('Contexto operativo heredado');
    expect(ctx).toContain('lección X');
    expect(ctx).toContain('newOrders');
    expect(ctx).not.toContain('breakEvenRoas');
  });
  it('deep: incluye tabla de productos con break-even ROAS', async () => {
    const { builder } = makeBuilder();
    const ctx = await builder.build('deep');
    expect(ctx).toContain('Calza Magna');
    expect(ctx).toContain('breakEvenRoas');
  });
  it('retrospective: incluye decisiones ejecutadas viejas sin outcome', async () => {
    const { builder, stores } = makeBuilder();
    const d = await stores.decisions.add({ tool: 'pause_ad', status: 'executed' });
    await stores.decisions.setStatus(d.id, 'executed', { createdAt: '2026-07-01T00:00:00Z' });
    const ctx = await builder.build('retrospective');
    expect(ctx).toContain('decisionsToEvaluate');
    expect(ctx).toContain(d.id);
  });
});
```

Correr: `npx vitest run test/contextBuilder.test.js` — Expected: FAIL.

- [ ] **Step 3: Implementación**

`backend/src/agent/contextBuilder.js`:
```js
import { BASE_CONTEXT } from './baseContext.js';
import { breakEvenRoas } from '../engine/profit.js';

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString();
const day = (iso) => iso.slice(0, 10);

export function createContextBuilder({ meta, tiendanube, stores, configStore }) {
  async function metaSnapshot() {
    const [campaigns, adsets, ads, insights] = await Promise.all([
      meta.getCampaigns(), meta.getAdsets(), meta.getAds(),
      meta.getInsights('ad', day(isoDaysAgo(7)), day(new Date().toISOString())),
    ]);
    return { campaigns: campaigns.data, adsets: adsets.data, ads: ads.data, insightsLast7d: insights.data };
  }

  async function productTable(config) {
    const products = await tiendanube.getProducts();
    return products.flatMap((p) => (p.variants || []).map((v) => ({
      productId: p.id,
      name: typeof p.name === 'object' ? (p.name.es ?? Object.values(p.name)[0]) : p.name,
      variantId: v.id,
      price: Number(v.price),
      cost: v.cost != null ? Number(v.cost) : null,
      breakEvenRoas: v.cost != null ? breakEvenRoas({ price: Number(v.price), cost: Number(v.cost) }, config) : 'SIN COSTO CARGADO',
    })));
  }

  return {
    async build(kind, extra = {}) {
      const config = await configStore.get();
      const sections = {
        kind,
        config,
        ...(await metaSnapshot()),
        activeLearnings: await stores.learnings.listActive(),
        recentDecisions: await stores.decisions.listRecent(30),
        unusedCreatives: await stores.creatives.listUnused(),
        ...extra,
      };
      if (kind === 'deep') {
        sections.products = await productTable(config);
        sections.recentSales = await stores.sales.listRecent(50);
      }
      if (kind === 'retrospective') {
        sections.decisionsToEvaluate = await stores.decisions.listExecutedWithoutOutcome(isoDaysAgo(2));
      }
      const body = Object.entries(sections)
        .map(([k, v]) => `## ${k}\n${JSON.stringify(v, null, 1)}`)
        .join('\n\n');
      return `${BASE_CONTEXT}\n\n---\n\n${body}`;
    },
  };
}
```

- [ ] **Step 4: Correr** — `npx vitest run test/contextBuilder.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add backend/ && git commit -m "feat: context builder + contexto heredado + system prompt del agente"`

---

### Task 10: Runner del agente (loop de tool-use) + rate limiter

**Files:**
- Create: `backend/src/agent/runner.js`, `backend/src/agent/rateLimit.js`
- Test: `backend/test/runner.test.js`

**Interfaces:**
- Consumes: `createContextBuilder` (Task 9), `createToolDispatcher` (Task 8), `TOOL_DEFINITIONS` (Task 8), `SYSTEM_PROMPT` (Task 9), `createAgentStateStore` (Task 4).
- Produces:
  - `shouldRunSaleAnalysis(state, nowMs, minMinutes)` → boolean (pura).
  - `createAgentRunner({ anthropic, contextBuilder, dispatch, agentState, configStore, model? })` → `{ runDeep(), runRetrospective(), onSale(orderSummary) }`. `onSale` encola la orden en `agentState.pendingOrderIds`; si pasó el mínimo de minutos desde `lastSaleRunAt`, corre análisis con TODAS las encoladas y las limpia; si no, quedan para la próxima. El loop de tool-use corta a las 15 vueltas (tope de seguridad) o cuando `stop_reason !== 'tool_use'`.

- [ ] **Step 1: Tests que fallan**

`backend/test/runner.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { shouldRunSaleAnalysis } from '../src/agent/rateLimit.js';
import { createAgentRunner } from '../src/agent/runner.js';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createAgentStateStore } from '../src/store/agentState.js';
import { createConfigStore } from '../src/config/configStore.js';

describe('shouldRunSaleAnalysis', () => {
  const now = new Date('2026-07-14T12:00:00Z').getTime();
  it('sin corrida previa → true', () =>
    expect(shouldRunSaleAnalysis({ lastSaleRunAt: null }, now, 30)).toBe(true));
  it('corrida hace 10 min con mínimo 30 → false', () =>
    expect(shouldRunSaleAnalysis({ lastSaleRunAt: '2026-07-14T11:50:00Z' }, now, 30)).toBe(false));
  it('corrida hace 31 min con mínimo 30 → true', () =>
    expect(shouldRunSaleAnalysis({ lastSaleRunAt: '2026-07-14T11:29:00Z' }, now, 30)).toBe(true));
});

function makeRunner(anthropicResponses) {
  const db = createFakeFirestore();
  const agentState = createAgentStateStore(db);
  const configStore = createConfigStore(db);
  const create = vi.fn();
  anthropicResponses.forEach((r) => create.mockResolvedValueOnce(r));
  const anthropic = { messages: { create } };
  const contextBuilder = { build: vi.fn().mockResolvedValue('CONTEXT') };
  const dispatch = vi.fn().mockResolvedValue({ ok: true });
  const runner = createAgentRunner({ anthropic, contextBuilder, dispatch, agentState, configStore });
  return { runner, create, dispatch, agentState };
}

describe('runner', () => {
  it('loop: ejecuta tools hasta que Claude termina', async () => {
    const { runner, dispatch, create } = makeRunner([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'pause_ad', input: { ad_id: '1' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'listo' }] },
    ]);
    await runner.runDeep();
    expect(dispatch).toHaveBeenCalledWith('pause_ad', { ad_id: '1' });
    expect(create).toHaveBeenCalledTimes(2);
    // el segundo call incluye el tool_result
    const secondMessages = create.mock.calls[1][0].messages;
    expect(secondMessages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });
  it('onSale respeta el rate limit: encola sin correr', async () => {
    const { runner, create, agentState } = makeRunner([]);
    await agentState.set({ lastSaleRunAt: new Date().toISOString() });
    await runner.onSale({ orderId: '55' });
    expect(create).not.toHaveBeenCalled();
    expect((await agentState.get()).pendingOrderIds).toContain('55');
  });
  it('onSale corre con las órdenes acumuladas cuando pasó la ventana', async () => {
    const { runner, create, agentState } = makeRunner([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
    ]);
    await agentState.set({ pendingOrderIds: ['44'], lastSaleRunAt: '2026-01-01T00:00:00Z' });
    await runner.onSale({ orderId: '55' });
    expect(create).toHaveBeenCalledTimes(1);
    expect((await agentState.get()).pendingOrderIds).toEqual([]);
  });
});
```

Correr: `npx vitest run test/runner.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementación**

`backend/src/agent/rateLimit.js`:
```js
export function shouldRunSaleAnalysis(state, nowMs, minMinutes) {
  if (!state.lastSaleRunAt) return true;
  return nowMs - new Date(state.lastSaleRunAt).getTime() >= minMinutes * 60_000;
}
```

`backend/src/agent/runner.js`:
```js
import { TOOL_DEFINITIONS } from './tools.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { shouldRunSaleAnalysis } from './rateLimit.js';

const MAX_TURNS = 15;

export function createAgentRunner({ anthropic, contextBuilder, dispatch, agentState, configStore, model = 'claude-sonnet-5' }) {
  async function run(kind, extra = {}) {
    const context = await contextBuilder.build(kind, extra);
    const messages = [{ role: 'user', content: context }];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await anthropic.messages.create({
        model, max_tokens: 4096, system: SYSTEM_PROMPT, tools: TOOL_DEFINITIONS, messages,
      });
      messages.push({ role: 'assistant', content: resp.content });
      if (resp.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
        const result = await dispatch(block.name, block.input);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: results });
    }
  }

  return {
    runDeep: () => run('deep'),
    runRetrospective: () => run('retrospective'),
    async onSale(orderSummary) {
      const config = await configStore.get();
      const state = await agentState.get();
      const pending = [...new Set([...state.pendingOrderIds, String(orderSummary.orderId)])];
      if (!shouldRunSaleAnalysis(state, Date.now(), config.minMinutesBetweenSaleRuns)) {
        await agentState.set({ pendingOrderIds: pending });
        return { queued: true };
      }
      await agentState.set({ pendingOrderIds: [], lastSaleRunAt: new Date().toISOString() });
      await run('sale', { newOrders: pending.map((id) => ({ orderId: id })), latestOrder: orderSummary });
      return { ran: true, orders: pending };
    },
  };
}
```

- [ ] **Step 3: Correr** — `npx vitest run test/runner.test.js` — Expected: PASS.

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: runner del agente con loop de tool-use y rate limit por venta"`

---

### Task 11: Procesador de ventas (webhook → profit → feed → agente)

**Files:**
- Create: `backend/src/agent/saleProcessor.js`
- Test: `backend/test/saleProcessor.test.js`

**Interfaces:**
- Consumes: tn client + `extractSaleInputs`/`buildCostIndex` (Task 6), `computeSaleProfit` (Task 2), sales store (Task 4), meta client (Task 7, para CPA blended), runner `onSale` (Task 10), configStore (Task 3).
- Produces: `createSaleProcessor({ tiendanube, meta, stores, configStore, runner })` → `async processOrderEvent(event)`. Flujo: `getOrder(event.id)` → dedupe (`sales.addIfNew`; si ya existe, corta) → costos (`getProducts` + `buildCostIndex`) → CPA blended últimas 48h de insights Meta → `computeSaleProfit` → guarda desglose en `sales` → `runner.onSale`. La PRIMERA orden procesada loguea el payload crudo a consola (validación del mapeo, spec §4).

- [ ] **Step 1: Test que falla**

`backend/test/saleProcessor.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createSaleProcessor } from '../src/agent/saleProcessor.js';
import { createSalesStore } from '../src/store/sales.js';
import { createConfigStore } from '../src/config/configStore.js';

function make() {
  const db = createFakeFirestore();
  const stores = { sales: createSalesStore(db) };
  const tiendanube = {
    getOrder: vi.fn().mockResolvedValue({
      id: 999,
      products: [{ variant_id: 100, price: '50000.00', quantity: 1 }],
      shipping_cost_customer: '0.00',
      payment_details: { method: 'bank_transfer', installments: '1' },
    }),
    getProducts: vi.fn().mockResolvedValue([{ id: 1, variants: [{ id: 100, cost: '20000.00' }] }]),
  };
  const meta = {
    // 48h: gasto 40000, 4 compras → CPA blended 10000
    getInsights: vi.fn().mockResolvedValue({ data: [
      { spend: '40000', actions: [{ action_type: 'purchase', value: '4' }] },
    ] }),
  };
  const runner = { onSale: vi.fn().mockResolvedValue({ ran: true }) };
  const processor = createSaleProcessor({ tiendanube, meta, stores, configStore: createConfigStore(db), runner });
  return { processor, stores, runner, tiendanube };
}

describe('saleProcessor', () => {
  it('procesa orden: desglose correcto en sales + dispara agente', async () => {
    const { processor, stores, runner } = make();
    await processor.processOrderEvent({ event: 'order/paid', id: 999 });
    const [sale] = await stores.sales.listRecent();
    // fee = 50000*0.01 = 500 ; taxes = 4000 ; adCost = 10000*1.3 = 13000
    // profit = 50000-20000-500-4000-13000 = 12500
    expect(sale.profit.profit).toBe(12500);
    expect(sale.profit.adCost).toBe(13000);
    expect(runner.onSale).toHaveBeenCalledWith(expect.objectContaining({ orderId: '999' }));
  });
  it('orden duplicada: no reprocesa ni dispara agente', async () => {
    const { processor, runner } = make();
    await processor.processOrderEvent({ event: 'order/paid', id: 999 });
    await processor.processOrderEvent({ event: 'order/paid', id: 999 });
    expect(runner.onSale).toHaveBeenCalledTimes(1);
  });
});
```

Correr: `npx vitest run test/saleProcessor.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementación**

`backend/src/agent/saleProcessor.js`:
```js
import { extractSaleInputs, buildCostIndex } from '../engine/extractSale.js';
import { computeSaleProfit } from '../engine/profit.js';

const day = (d) => d.toISOString().slice(0, 10);

export function createSaleProcessor({ tiendanube, meta, stores, configStore, runner }) {
  let firstOrderLogged = false;

  async function blendedCpa48h() {
    const until = new Date();
    const since = new Date(until.getTime() - 2 * 86400_000);
    const { data } = await meta.getInsights('account', day(since), day(until));
    let spend = 0, purchases = 0;
    for (const row of data || []) {
      spend += Number(row.spend || 0);
      purchases += Number((row.actions || []).find((a) => a.action_type === 'purchase')?.value || 0);
    }
    return purchases > 0 ? spend / purchases : 0;
  }

  return {
    async processOrderEvent(event) {
      const order = await tiendanube.getOrder(event.id);
      if (!firstOrderLogged) {
        // spec §4: validar el mapeo contra el payload real la primera vez
        console.log('[saleProcessor] primera orden cruda:', JSON.stringify(order));
        firstOrderLogged = true;
      }
      const config = await configStore.get();
      const costIndex = buildCostIndex(await tiendanube.getProducts());
      const inputs = extractSaleInputs(order, costIndex);
      const estimatedCpa = await blendedCpa48h();
      const profit = computeSaleProfit({ ...inputs, estimatedCpa }, config);
      const isNew = await stores.sales.addIfNew(order.id, {
        inputs, profit, estimatedCpa,
        ...(inputs.missingCosts ? { missingCosts: inputs.missingCosts } : {}),
      });
      if (!isNew) return { duplicate: true };
      await runner.onSale({ orderId: String(order.id), profit });
      return { processed: true };
    },
  };
}
```

- [ ] **Step 3: Correr** — `npx vitest run test/saleProcessor.test.js` — Expected: PASS.

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: procesador de ventas con desglose de rentabilidad y trigger del agente"`

---

### Task 12: API del dashboard + auth + ejecución de aprobaciones + upload de creativos

**Files:**
- Create: `backend/src/routes/api.js`, `backend/src/routes/authMiddleware.js`, `backend/src/agent/decisionExecutor.js`, `backend/src/services/storage.js`
- Test: `backend/test/api.test.js`

**Interfaces:**
- Consumes: stores (Task 4), configStore (Task 3), meta/tn clients (Tasks 6-7), `createAdFromCreative` (Task 8), runner (Task 10).
- Produces:
  - `createAuthMiddleware({ auth, allowedEmail })` — verifica `Authorization: Bearer <firebase-id-token>` con `auth.verifyIdToken`; 401 sin/mal token, 403 si el email no es el permitido.
  - `createStorage(bucket)` → `{ save(path, buffer, contentType), download(path) }`.
  - `createDecisionExecutor({ meta, tiendanube, createAdFromCreative })` → `async execute(decision)` — mapea decisión aprobada a la llamada real.
  - `createApiRouter({ stores, configStore, executor, storage, runner })` — endpoints:
    - `GET /summary` → `{ sales: últimas 100 con profit, pendingCount }`
    - `GET /sales`, `GET /decisions?status=`, `GET /proposals`, `GET /learnings`, `DELETE /learnings/:id`
    - `POST /decisions/:id/approve` → ejecuta vía executor; éxito → status `approved` + `executedAt`; fallo → status `failed` + error; 404 si no existe; 409 si no está `pending`.
    - `POST /decisions/:id/reject` → status `rejected`.
    - `GET /config`, `PUT /config` (merge parcial).
    - `POST /creatives` (multipart: campos `name`, `copy`, `funnel`, `notes`; archivos `feedImage`, `storyImage`) → guarda en Storage (`creatives/{ts}_feed.jpg` / `_story.jpg`) y crea doc. 400 si falta imagen o campo obligatorio.
    - `GET /creatives`
    - `POST /agent/run` → dispara `runner.runDeep()` fire-and-forget → `{ started: true }` (para probar el agente a demanda).

- [ ] **Step 1: Tests que fallan**

`backend/test/api.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createApiRouter } from '../src/routes/api.js';
import { createAuthMiddleware } from '../src/routes/authMiddleware.js';
import { createDecisionExecutor } from '../src/agent/decisionExecutor.js';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createDecisionsStore } from '../src/store/decisions.js';
import { createSalesStore } from '../src/store/sales.js';
import { createLearningsStore } from '../src/store/learnings.js';
import { createProposalsStore } from '../src/store/proposals.js';
import { createCreativesStore } from '../src/store/creatives.js';
import { createConfigStore } from '../src/config/configStore.js';

const okAuth = { verifyIdToken: vi.fn().mockResolvedValue({ email: 'jdilernia99@gmail.com' }) };

let app, stores, meta, tiendanube, storage, runner;

beforeEach(() => {
  const db = createFakeFirestore();
  stores = {
    decisions: createDecisionsStore(db), sales: createSalesStore(db),
    learnings: createLearningsStore(db), proposals: createProposalsStore(db),
    creatives: createCreativesStore(db),
  };
  meta = { updateBudget: vi.fn().mockResolvedValue({}), pauseAd: vi.fn(), updateAdsetStatus: vi.fn(), createAdset: vi.fn(), createCampaign: vi.fn() };
  tiendanube = { updateVariantPrice: vi.fn().mockResolvedValue({}) };
  storage = { save: vi.fn().mockResolvedValue('path'), download: vi.fn() };
  runner = { runDeep: vi.fn().mockResolvedValue() };
  const executor = createDecisionExecutor({ meta, tiendanube, createAdFromCreative: vi.fn() });
  const apiRouter = createApiRouter({ stores, configStore: createConfigStore(db), executor, storage, runner });
  app = createApp({ apiRouter: [createAuthMiddleware({ auth: okAuth, allowedEmail: 'jdilernia99@gmail.com' }), apiRouter] });
});

const auth = (r) => r.set('authorization', 'Bearer tok');

describe('auth', () => {
  it('sin token → 401', async () => {
    expect((await request(app).get('/api/summary')).status).toBe(401);
  });
  it('email ajeno → 403', async () => {
    okAuth.verifyIdToken.mockResolvedValueOnce({ email: 'otro@x.com' });
    expect((await auth(request(app).get('/api/summary'))).status).toBe(403);
  });
});

describe('aprobaciones', () => {
  it('approve de propose_budget_change ejecuta en Meta (ARS → centavos)', async () => {
    const d = await stores.decisions.add({
      tool: 'propose_budget_change', status: 'pending',
      input: { level: 'adset', object_id: '456', proposed_budget: 25000 },
    });
    const res = await auth(request(app).post(`/api/decisions/${d.id}/approve`));
    expect(res.status).toBe(200);
    expect(meta.updateBudget).toHaveBeenCalledWith('456', 2500000);
    expect((await stores.decisions.get(d.id)).status).toBe('approved');
  });
  it('approve de propose_price_change ejecuta en Tienda Nube', async () => {
    const d = await stores.decisions.add({
      tool: 'propose_price_change', status: 'pending',
      input: { product_id: '10', variant_id: '20', proposed_price: 45990 },
    });
    await auth(request(app).post(`/api/decisions/${d.id}/approve`));
    expect(tiendanube.updateVariantPrice).toHaveBeenCalledWith('10', '20', 45990);
  });
  it('approve fallido → status failed y 502', async () => {
    meta.updateBudget.mockRejectedValueOnce(new Error('Meta 100: bad'));
    const d = await stores.decisions.add({
      tool: 'propose_budget_change', status: 'pending',
      input: { object_id: '456', proposed_budget: 25000 },
    });
    const res = await auth(request(app).post(`/api/decisions/${d.id}/approve`));
    expect(res.status).toBe(502);
    expect((await stores.decisions.get(d.id)).status).toBe('failed');
  });
  it('reject marca rejected sin ejecutar', async () => {
    const d = await stores.decisions.add({ tool: 'propose_price_change', status: 'pending', input: {} });
    await auth(request(app).post(`/api/decisions/${d.id}/reject`));
    expect((await stores.decisions.get(d.id)).status).toBe('rejected');
    expect(tiendanube.updateVariantPrice).not.toHaveBeenCalled();
  });
  it('approve de decisión no-pending → 409', async () => {
    const d = await stores.decisions.add({ tool: 'propose_price_change', status: 'rejected', input: {} });
    expect((await auth(request(app).post(`/api/decisions/${d.id}/approve`))).status).toBe(409);
  });
});

describe('config y creativos', () => {
  it('PUT /config mergea', async () => {
    await auth(request(app).put('/api/config')).send({ taxPct: 0.05 });
    const res = await auth(request(app).get('/api/config'));
    expect(res.body.taxPct).toBe(0.05);
  });
  it('POST /creatives guarda imágenes y doc', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'BORDO').field('copy', 'Tu uniforme').field('funnel', 'caliente').field('notes', 'activewear')
      .attach('feedImage', Buffer.from('fake-feed'), 'feed.jpg')
      .attach('storyImage', Buffer.from('fake-story'), 'story.jpg');
    expect(res.status).toBe(201);
    expect(storage.save).toHaveBeenCalledTimes(2);
    expect((await stores.creatives.listUnused())).toHaveLength(1);
  });
  it('POST /creatives sin story → 400', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedImage', Buffer.from('f'), 'feed.jpg');
    expect(res.status).toBe(400);
  });
});

describe('agent run manual', () => {
  it('POST /agent/run dispara runDeep', async () => {
    const res = await auth(request(app).post('/api/agent/run'));
    expect(res.status).toBe(200);
    expect(runner.runDeep).toHaveBeenCalled();
  });
});
```

Nota: `createApp` recibe `apiRouter` como array `[middleware, router]` — Express lo acepta tal cual en `app.use('/api', ...)`; si la implementación de Task 1 no lo soporta, cambiar `app.use('/api', apiRouter)` por `app.use('/api', ...[].concat(apiRouter))`.

Correr: `npx vitest run test/api.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementación**

`backend/src/routes/authMiddleware.js`:
```js
export function createAuthMiddleware({ auth, allowedEmail }) {
  return async (req, res, next) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'falta token' });
    try {
      const decoded = await auth.verifyIdToken(token);
      if (allowedEmail && decoded.email !== allowedEmail) return res.status(403).json({ error: 'no autorizado' });
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'token inválido' });
    }
  };
}
```

`backend/src/services/storage.js`:
```js
export function createStorage(bucket) {
  return {
    async save(path, buffer, contentType) {
      await bucket.file(path).save(buffer, { contentType });
      return path;
    },
    async download(path) {
      const [buf] = await bucket.file(path).download();
      return buf;
    },
  };
}
```

`backend/src/agent/decisionExecutor.js`:
```js
export function createDecisionExecutor({ meta, tiendanube, createAdFromCreative }) {
  return async function execute(decision) {
    const { tool, input } = decision;
    switch (tool) {
      case 'pause_ad':
        return meta.pauseAd(input.ad_id);
      case 'create_ad':
        return createAdFromCreative(input);
      case 'propose_price_change':
        return tiendanube.updateVariantPrice(input.product_id, input.variant_id, input.proposed_price);
      case 'propose_budget_change':
        return meta.updateBudget(input.object_id, Math.round(input.proposed_budget * 100));
      case 'propose_campaign_structure_change':
        if (input.action === 'pause_adset') return meta.updateAdsetStatus(input.object_id, 'PAUSED');
        if (input.action === 'pause_campaign') return meta.updateBudget && meta.pauseCampaign
          ? meta.pauseCampaign(input.object_id)
          : meta.updateAdsetStatus(input.object_id, 'PAUSED');
        if (input.action === 'create_adset') return meta.createAdset(input.payload);
        if (input.action === 'create_campaign') return meta.createCampaign(input.payload);
        throw new Error(`acción desconocida: ${input.action}`);
      default:
        throw new Error(`decisión no ejecutable: ${tool}`);
    }
  };
}
```

(Nota: agregar `pauseCampaign: (id) => req(id, { method: 'POST', body: { status: 'PAUSED' } })` al cliente Meta de Task 7 al implementar esta task — mismo patrón que `pauseAd`. Simplificar el case `pause_campaign` a `return meta.pauseCampaign(input.object_id)`.)

`backend/src/routes/api.js`:
```js
import express from 'express';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function createApiRouter({ stores, configStore, executor, storage, runner }) {
  const r = express.Router();

  r.get('/summary', async (_req, res) => {
    const [sales, pending] = await Promise.all([stores.sales.listRecent(100), stores.decisions.listPending()]);
    res.json({ sales, pendingCount: pending.length });
  });
  r.get('/sales', async (_req, res) => res.json(await stores.sales.listRecent(100)));
  r.get('/decisions', async (req, res) => {
    if (req.query.status === 'pending') return res.json(await stores.decisions.listPending());
    res.json(await stores.decisions.listRecent(100));
  });
  r.get('/proposals', async (_req, res) => res.json(await stores.proposals.list()));
  r.get('/learnings', async (_req, res) => res.json(await stores.learnings.listActive()));
  r.delete('/learnings/:id', async (req, res) => { await stores.learnings.remove(req.params.id); res.json({ ok: true }); });

  r.post('/decisions/:id/approve', async (req, res) => {
    const d = await stores.decisions.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'no existe' });
    if (d.status !== 'pending') return res.status(409).json({ error: `estado ${d.status}, no pending` });
    try {
      const result = await executor(d);
      await stores.decisions.setStatus(d.id, 'approved', { executedAt: new Date().toISOString(), result: result ?? null });
      res.json({ ok: true });
    } catch (err) {
      await stores.decisions.setStatus(d.id, 'failed', { error: String(err.message || err) });
      res.status(502).json({ error: String(err.message || err) });
    }
  });
  r.post('/decisions/:id/reject', async (req, res) => {
    const d = await stores.decisions.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'no existe' });
    await stores.decisions.setStatus(d.id, 'rejected', { rejectedAt: new Date().toISOString() });
    res.json({ ok: true });
  });

  r.get('/config', async (_req, res) => res.json(await configStore.get()));
  r.put('/config', async (req, res) => res.json(await configStore.update(req.body)));

  r.post('/creatives', upload.fields([{ name: 'feedImage', maxCount: 1 }, { name: 'storyImage', maxCount: 1 }]), async (req, res) => {
    const feed = req.files?.feedImage?.[0];
    const story = req.files?.storyImage?.[0];
    const { name, copy, funnel, notes } = req.body;
    if (!feed || !story || !name || !copy || !funnel) {
      return res.status(400).json({ error: 'faltan campos: feedImage, storyImage, name, copy, funnel' });
    }
    const ts = Date.now();
    const feedPath = await storage.save(`creatives/${ts}_feed.jpg`, feed.buffer, feed.mimetype);
    const storyPath = await storage.save(`creatives/${ts}_story.jpg`, story.buffer, story.mimetype);
    const id = await stores.creatives.add({ name, copy, funnel, notes: notes || '', feedImagePath: feedPath, storyImagePath: storyPath });
    res.status(201).json({ id });
  });
  r.get('/creatives', async (_req, res) => res.json(await stores.creatives.list()));

  r.post('/agent/run', async (_req, res) => {
    Promise.resolve(runner.runDeep()).catch((err) => console.error('[agent/run] falló:', err));
    res.json({ started: true });
  });

  return r;
}
```

Ajuste en `backend/src/app.js` (si hace falta para el array de middleware):
```js
  if (apiRouter) app.use('/api', ...[].concat(apiRouter));
```

- [ ] **Step 3: Correr** — `npx vitest run test/api.test.js` — Expected: PASS. Correr también la suite completa: `npx vitest run` — Expected: todo PASS.

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: api del dashboard con auth, aprobaciones ejecutables y upload de creativos"`

---

### Task 13: Bootstrap (index.js) — wiring real, cron, Firebase

**Files:**
- Create: `backend/src/index.js`, `backend/src/firebase.js`, `backend/.env.example`

**Interfaces:**
- Consumes: TODO lo anterior. Este archivo es el único que toca servicios reales (Firebase Admin, fetch real, Anthropic real).

- [ ] **Step 1: Firebase init**

`backend/src/firebase.js`:
```js
import admin from 'firebase-admin';

export function initFirebase() {
  // En Railway: FIREBASE_SERVICE_ACCOUNT = JSON del service account (una sola línea).
  // Local: apuntar GOOGLE_APPLICATION_CREDENTIALS a un archivo, o usar la misma env var.
  const creds = process.env.FIREBASE_SERVICE_ACCOUNT
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : admin.credential.applicationDefault();
  const app = admin.initializeApp({
    credential: creds,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  return { db: admin.firestore(app), auth: admin.auth(app), bucket: admin.storage(app).bucket() };
}
```

- [ ] **Step 2: Bootstrap completo**

`backend/src/index.js`:
```js
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
```

`backend/.env.example`:
```
# Meta (System User token con: ads_read, ads_management, business_management,
# pages_read_engagement, pages_show_list, catalog_management + activos asignados)
META_ACCESS_TOKEN=
META_ACCOUNT_ID=act_33890648080578737
META_PAGE_ID=104448066033431
META_IG_ACTOR_ID=17841444761910024

# Tienda Nube (app interna: Mi Tiendanube > Configuración > API)
TIENDANUBE_STORE_ID=
TIENDANUBE_TOKEN=
TIENDANUBE_WEBHOOK_SECRET=

# Anthropic
ANTHROPIC_API_KEY=

# Firebase (JSON del service account en una línea + bucket)
FIREBASE_SERVICE_ACCOUNT=
FIREBASE_STORAGE_BUCKET=

# Dashboard
FRONTEND_ORIGIN=https://TU-DOMINIO-EN-HOSTINGER.com
ALLOWED_EMAIL=jdilernia99@gmail.com
```

- [ ] **Step 3: Verificación manual local**

1. `cd backend && npx vitest run` — Expected: toda la suite PASS.
2. Crear `backend/.env` desde `.env.example` con credenciales reales (el usuario las tiene; NO commitear).
3. `node src/index.js` — Expected: `gineza-agent-backend escuchando en :3000` sin stack traces.
4. `curl http://localhost:3000/health` — Expected: `{"ok":true}`.
5. `curl http://localhost:3000/api/summary` — Expected: 401 (sin token — el auth funciona).

- [ ] **Step 4: Commit** — `git add backend/ && git commit -m "feat: bootstrap con wiring real, cron diario y retrospectiva"`

---

### Task 14: Docs de deploy + script de registro de webhook

**Files:**
- Create: `README.md` (raíz del repo), `backend/scripts/registerWebhook.js`, `railway.json` (raíz)

- [ ] **Step 1: Script de registro del webhook de Tienda Nube**

`backend/scripts/registerWebhook.js`:
```js
// Registra los webhooks de órdenes de Tienda Nube apuntando al backend.
// Uso: BACKEND_URL=https://xxx.up.railway.app node scripts/registerWebhook.js
import 'dotenv/config';

const { TIENDANUBE_STORE_ID, TIENDANUBE_TOKEN, BACKEND_URL } = process.env;
if (!BACKEND_URL) throw new Error('Falta BACKEND_URL');

const headers = {
  Authentication: `bearer ${TIENDANUBE_TOKEN}`,
  'User-Agent': 'gineza-agent (jdilernia99@gmail.com)',
  'Content-Type': 'application/json',
};

for (const event of ['order/created', 'order/paid']) {
  const res = await fetch(`https://api.tiendanube.com/v1/${TIENDANUBE_STORE_ID}/webhooks`, {
    method: 'POST', headers,
    body: JSON.stringify({ event, url: `${BACKEND_URL}/webhooks/tiendanube` }),
  });
  console.log(event, res.status, await res.text());
}
```

- [ ] **Step 2: railway.json**

`railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "cd backend && npm install" },
  "deploy": { "startCommand": "cd backend && npm start", "healthcheckPath": "/health" }
}
```

- [ ] **Step 3: README con setup completo**

`README.md` (raíz) — contenido:
```markdown
# Gineza Agent — Agente autónomo de optimización e-commerce

Backend Node/Express (Railway) + Dashboard React (Hostinger) + Firebase.
Spec completa: `docs/superpowers/specs/2026-07-14-gineza-autonomous-agent-design.md`.

## Setup de credenciales (una sola vez)

### 1. Meta — System User token
En business.facebook.com > Configuración del negocio > Usuarios > Usuarios del sistema:
1. Usar el system user existente o crear uno nuevo "gineza-agent" (NO tocar el token del bot de WhatsApp).
2. Asignar activos: cuenta publicitaria act_33890648080578737, página Gineza (104448066033431), píxel 659564062266866 y el catálogo de Tiendanube.
3. Generar token con scopes: ads_read, ads_management, business_management, pages_read_engagement, pages_show_list, catalog_management.
4. Guardarlo como META_ACCESS_TOKEN.

### 2. Tienda Nube — app interna
Panel de la tienda > Configuración > API: crear app interna, darle permisos de
lectura de órdenes/productos y escritura de productos y webhooks.
Guardar TIENDANUBE_STORE_ID, TIENDANUBE_TOKEN y el client secret como TIENDANUBE_WEBHOOK_SECRET.

### 3. Firebase
1. Crear proyecto en console.firebase.google.com con Firestore + Storage + Authentication (Email/Password).
2. Crear el usuario del dashboard (jdilernia99@gmail.com) en Authentication.
3. Descargar service account (Configuración > Cuentas de servicio) y pegar el JSON
   en una línea como FIREBASE_SERVICE_ACCOUNT. Bucket en FIREBASE_STORAGE_BUCKET.

### 4. Anthropic
API key de console.anthropic.com como ANTHROPIC_API_KEY.

## Deploy backend (Railway)
1. Conectar este repo en Railway; railway.json ya define build y start.
2. Cargar TODAS las env vars de backend/.env.example.
3. Verificar https://<railway-url>/health → {"ok":true}.
4. Registrar webhooks: `cd backend && BACKEND_URL=https://<railway-url> node scripts/registerWebhook.js`.

## Verificación end-to-end
1. `POST /api/agent/run` con un ID token de Firebase → revisar en Firestore la
   colección decisions (el agente corrió y decidió).
2. Hacer una orden de prueba en la tienda → aparece en la colección sales con el
   desglose de rentabilidad, y en los logs queda la orden cruda para validar el
   mapeo de payment_details (ajustar extractSale.js si difiere).
3. Primer análisis real: revisar los logs de Railway y el historial de decisiones.

## Correr local
cd backend && cp .env.example .env  # completar credenciales
npm install && npm start            # http://localhost:3000
npx vitest run                      # tests

## Frontend
El dashboard React (Hostinger) tiene su propio plan de implementación (pendiente:
se escribe cuando este backend esté deployado — consume esta API).
```

- [ ] **Step 4: Commit final**

```bash
git add README.md railway.json backend/scripts/
git commit -m "docs: setup de credenciales, deploy railway y registro de webhooks"
```

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura de spec:** loop del agente (T8-11), motor de rentabilidad (T2, T11), feed de ventas (T11-12), aprobaciones (T8, T12), historial (T4, T8), creativos (T12, T8), learnings/retrospectiva (T4, T8-10), naming (T7), HMAC/seguridad (T5, T12-13), kill switch (T8), cron (T13), deploy (T14). El dashboard React es un plan aparte (se escribe post-backend).
- **Riesgo conocido:** los shapes exactos de payloads de TN (`payment_details`) y de Graph API (`asset_feed_spec`) se validan contra la realidad en T14 paso de verificación end-to-end — los tests unitarios fijan el contrato interno, no el externo.


