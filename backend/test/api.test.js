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
import { createCreativeRequestsStore } from '../src/store/creativeRequests.js';
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
    creativeRequests: createCreativeRequestsStore(db),
  };
  meta = {
    updateBudget: vi.fn().mockResolvedValue({}), pauseAd: vi.fn(), pauseCampaign: vi.fn(),
    updateAdsetStatus: vi.fn(), createAdset: vi.fn(), createCampaign: vi.fn(),
    uploadVideo: vi.fn().mockResolvedValueOnce('vid_feed').mockResolvedValueOnce('vid_story'),
  };
  tiendanube = { updateVariantPrice: vi.fn().mockResolvedValue({}) };
  storage = { save: vi.fn().mockResolvedValue('path'), download: vi.fn() };
  runner = { runDeep: vi.fn().mockResolvedValue(), chat: vi.fn().mockResolvedValue({ reply: 'una respuesta' }) };
  const executor = createDecisionExecutor({ meta, tiendanube, createAdFromCreative: vi.fn() });
  const metrics = { last7d: vi.fn().mockResolvedValue({ roas: 7 }) };
  const apiRouter = createApiRouter({ stores, configStore: createConfigStore(db), executor, storage, runner, metrics, meta });
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
  it('POST /creatives con videos → sube a Meta y guarda mediaType video', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'REEL1').field('copy', 'Mirá esto').field('funnel', 'frio')
      .attach('feedVideo', Buffer.from('fake-feed-video'), 'feed.mp4')
      .attach('storyVideo', Buffer.from('fake-story-video'), 'story.mp4');
    expect(res.status).toBe(201);
    expect(meta.uploadVideo).toHaveBeenCalledTimes(2);
    expect(storage.save).not.toHaveBeenCalled();
    const [c] = await stores.creatives.listUnused();
    expect(c).toMatchObject({ mediaType: 'video', feedVideoId: 'vid_feed', storyVideoId: 'vid_story' });
  });
  it('POST /creatives mezcla imagen + video → 400', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedImage', Buffer.from('img'), 'feed.jpg')
      .attach('storyVideo', Buffer.from('vid'), 'story.mp4');
    expect(res.status).toBe(400);
  });
  it('POST /creatives con un solo video → 400', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedVideo', Buffer.from('vid'), 'feed.mp4');
    expect(res.status).toBe(400);
  });
  it('POST /creatives: si Meta falla la subida, 502 y NO queda doc', async () => {
    meta.uploadVideo.mockReset().mockRejectedValue(new Error('Meta 100: bad video'));
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedVideo', Buffer.from('v1'), 'f.mp4')
      .attach('storyVideo', Buffer.from('v2'), 's.mp4');
    expect(res.status).toBe(502);
    expect(await stores.creatives.listUnused()).toHaveLength(0);
  });
  it('POST /creatives de imágenes guarda mediaType image', async () => {
    await auth(request(app).post('/api/creatives'))
      .field('name', 'BORDO2').field('copy', 'c').field('funnel', 'caliente')
      .attach('feedImage', Buffer.from('f'), 'feed.jpg')
      .attach('storyImage', Buffer.from('s'), 'story.jpg');
    const [c] = await stores.creatives.listUnused();
    expect(c.mediaType).toBe('image');
  });
  it('POST /creatives exitoso dispara una corrida del agente (evalúa el creativo nuevo)', async () => {
    await auth(request(app).post('/api/creatives'))
      .field('name', 'BORDO3').field('copy', 'c').field('funnel', 'caliente')
      .attach('feedImage', Buffer.from('f'), 'feed.jpg')
      .attach('storyImage', Buffer.from('s'), 'story.jpg');
    expect(runner.runDeep).toHaveBeenCalledTimes(1);
  });
  it('POST /creatives inválido NO dispara corrida del agente', async () => {
    await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedImage', Buffer.from('f'), 'feed.jpg');
    expect(runner.runDeep).not.toHaveBeenCalled();
  });
});

describe('agent run manual', () => {
  it('POST /agent/run dispara runDeep', async () => {
    const res = await auth(request(app).post('/api/agent/run'));
    expect(res.status).toBe(200);
    expect(runner.runDeep).toHaveBeenCalled();
  });
});

describe('creative-requests', () => {
  it('GET lista abiertos, POST dismiss los saca de la lista', async () => {
    const r = await stores.creativeRequests.add({ funnel: 'caliente', concept: 'X', styleNotes: 'Y', reason: 'Z' });
    expect((await auth(request(app).get('/api/creative-requests'))).body).toHaveLength(1);
    await auth(request(app).post(`/api/creative-requests/${r.id}/dismiss`));
    expect((await auth(request(app).get('/api/creative-requests'))).body).toHaveLength(0);
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
