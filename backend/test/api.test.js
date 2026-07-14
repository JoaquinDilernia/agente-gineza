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
import { createChatMessagesStore } from '../src/store/chatMessages.js';
import { createConfigStore } from '../src/config/configStore.js';

const PASSWORD = 'test-password';

let app, stores, meta, tiendanube, storage, runner;

beforeEach(() => {
  const db = createFakeFirestore();
  stores = {
    decisions: createDecisionsStore(db), sales: createSalesStore(db),
    learnings: createLearningsStore(db), proposals: createProposalsStore(db),
    creatives: createCreativesStore(db), chatMessages: createChatMessagesStore(db),
  };
  meta = { updateBudget: vi.fn().mockResolvedValue({}), pauseAd: vi.fn(), pauseCampaign: vi.fn(), updateAdsetStatus: vi.fn(), createAdset: vi.fn(), createCampaign: vi.fn() };
  tiendanube = { updateVariantPrice: vi.fn().mockResolvedValue({}) };
  storage = { save: vi.fn().mockResolvedValue('path'), download: vi.fn() };
  runner = { runDeep: vi.fn().mockResolvedValue(), chat: vi.fn().mockResolvedValue({ reply: 'una respuesta' }) };
  const executor = createDecisionExecutor({ meta, tiendanube, createAdFromCreative: vi.fn() });
  const metrics = { last7d: vi.fn().mockResolvedValue({ roas: 7 }) };
  const apiRouter = createApiRouter({ stores, configStore: createConfigStore(db), executor, storage, runner, metrics });
  app = createApp({ apiRouter: [createAuthMiddleware({ password: PASSWORD }), apiRouter] });
});

const auth = (r) => r.set('authorization', `Bearer ${PASSWORD}`);

describe('auth', () => {
  it('sin token → 401', async () => {
    expect((await request(app).get('/api/summary')).status).toBe(401);
  });
  it('contraseña incorrecta → 401', async () => {
    const res = await request(app).get('/api/summary').set('authorization', 'Bearer mala');
    expect(res.status).toBe(401);
  });
  it('contraseña correcta → 200 y /metrics responde', async () => {
    expect((await auth(request(app).get('/api/metrics'))).body.roas).toBe(7);
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

describe('chat', () => {
  it('POST /chat manda el mensaje al runner y devuelve la respuesta', async () => {
    const res = await auth(request(app).post('/api/chat')).send({ message: '¿por qué bajó el ROAS?' });
    expect(res.status).toBe(200);
    expect(runner.chat).toHaveBeenCalledWith('¿por qué bajó el ROAS?');
    expect(res.body.reply).toBe('una respuesta');
  });
  it('POST /chat sin mensaje → 400', async () => {
    expect((await auth(request(app).post('/api/chat')).send({})).status).toBe(400);
  });
  it('GET /chat devuelve el historial', async () => {
    await stores.chatMessages.add({ role: 'user', content: 'hola' });
    const res = await auth(request(app).get('/api/chat'));
    expect(res.body).toHaveLength(1);
  });
});
