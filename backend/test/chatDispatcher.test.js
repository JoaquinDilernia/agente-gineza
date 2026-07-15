import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createChatToolDispatcher } from '../src/agent/chatDispatcher.js';
import { createDecisionsStore } from '../src/store/decisions.js';
import { createLearningsStore } from '../src/store/learnings.js';
import { createProposalsStore } from '../src/store/proposals.js';
import { createCreativeRequestsStore } from '../src/store/creativeRequests.js';

let stores, meta, tiendanube, createAdFromCreative, dispatch;

beforeEach(() => {
  const db = createFakeFirestore();
  stores = {
    decisions: createDecisionsStore(db),
    learnings: createLearningsStore(db),
    proposals: createProposalsStore(db),
    creativeRequests: createCreativeRequestsStore(db),
  };
  meta = {
    pauseAd: vi.fn().mockResolvedValue({ success: true }),
    updateBudget: vi.fn().mockResolvedValue({}),
    updateAdsetStatus: vi.fn().mockResolvedValue({}),
    pauseCampaign: vi.fn().mockResolvedValue({}),
    createAdset: vi.fn().mockResolvedValue({ id: 'as_1' }),
    createCampaign: vi.fn().mockResolvedValue({ id: 'c_1' }),
    searchInterests: vi.fn().mockResolvedValue([{ id: '2', name: 'Yoga', audienceMin: 50, audienceMax: 90 }]),
  };
  tiendanube = { updateVariantPrice: vi.fn().mockResolvedValue({}) };
  createAdFromCreative = vi.fn().mockResolvedValue({ ad_id: 'ad_9', name: 'X' });
  dispatch = createChatToolDispatcher({ meta, tiendanube, stores, createAdFromCreative, pixelId: 'px_1' });
});

describe('chatDispatcher — todo ejecuta directo, nada queda pending', () => {
  it('pause_ad ejecuta y registra executed con source chat', async () => {
    const r = await dispatch('pause_ad', { ad_id: '120', reason: 'me lo pediste en el chat' });
    expect(r.ok).toBe(true);
    expect(meta.pauseAd).toHaveBeenCalledWith('120');
    const [d] = await stores.decisions.listRecent();
    expect(d).toMatchObject({ tool: 'pause_ad', status: 'executed', source: 'chat' });
  });

  it('propose_budget_change EJECUTA directo (a diferencia del dispatcher normal)', async () => {
    const r = await dispatch('propose_budget_change', {
      level: 'adset', object_id: '456', current_budget: 21500, proposed_budget: 25000, reason: 'pedido en chat',
    });
    expect(r.ok).toBe(true);
    expect(meta.updateBudget).toHaveBeenCalledWith('456', 2500000);
    expect(await stores.decisions.listPending()).toHaveLength(0);
  });

  it('propose_price_change ejecuta en Tienda Nube', async () => {
    await dispatch('propose_price_change', { product_id: '10', variant_id: '20', proposed_price: 45990, reason: 'x' });
    expect(tiendanube.updateVariantPrice).toHaveBeenCalledWith('10', '20', 45990);
  });

  it('propose_campaign_structure_change: create_adset ejecuta con el payload y convierte el presupuesto', async () => {
    const payload = { name: 'X', campaign_id: 'c1' };
    meta.createAdset.mockResolvedValue({ id: 'as_nuevo' });
    const r = await dispatch('propose_campaign_structure_change', { action: 'create_adset', payload, daily_budget_ars: 5000, reason: 'x' });
    expect(meta.createAdset).toHaveBeenCalledWith({ ...payload, daily_budget: 500000 });
    expect(r.adset).toEqual({ id: 'as_nuevo' });
  });

  it('propose_campaign_structure_change con creative_id: crea el conjunto Y el ad en un solo pedido', async () => {
    meta.createAdset.mockResolvedValue({ id: 'as_nuevo' });
    const r = await dispatch('propose_campaign_structure_change', {
      action: 'create_adset', payload: { name: 'TEST' }, daily_budget_ars: 3000, creative_id: 'cr_1', reason: 'probar público running',
    });
    expect(createAdFromCreative).toHaveBeenCalledWith({ creative_id: 'cr_1', adset_id: 'as_nuevo' });
    expect(r.ad.ad_id).toBe('ad_9');
  });

  it('propose_campaign_structure_change: create_adset con OFFSITE_CONVERSIONS inyecta promoted_object con el pixel', async () => {
    meta.createAdset.mockResolvedValue({ id: 'as_nuevo' });
    await dispatch('propose_campaign_structure_change', {
      action: 'create_adset', payload: { name: 'TEST', optimization_goal: 'OFFSITE_CONVERSIONS' }, reason: 'x',
    });
    expect(meta.createAdset).toHaveBeenCalledWith({
      name: 'TEST', optimization_goal: 'OFFSITE_CONVERSIONS',
      promoted_object: { pixel_id: 'px_1', custom_event_type: 'PURCHASE' },
    });
  });

  it('propose_campaign_structure_change: create_adset sin targeting_automation usa default advantage_audience=0', async () => {
    meta.createAdset.mockResolvedValue({ id: 'as_nuevo' });
    await dispatch('propose_campaign_structure_change', {
      action: 'create_adset', payload: { name: 'TEST', targeting: { age_min: 20 } }, reason: 'x',
    });
    expect(meta.createAdset).toHaveBeenCalledWith({
      name: 'TEST', targeting: { age_min: 20, targeting_automation: { advantage_audience: 0 } },
    });
  });

  it('create_ad usa createAdFromCreative y marca el creativo usado', async () => {
    const r = await dispatch('create_ad', { creative_id: 'cr1', adset_id: 'as1', reason: 'x' });
    expect(createAdFromCreative).toHaveBeenCalledWith({ creative_id: 'cr1', adset_id: 'as1', reason: 'x' });
    expect(r.ad_id).toBe('ad_9');
  });

  it('error → decisión failed + mensaje de error a Claude', async () => {
    meta.pauseAd.mockRejectedValue(new Error('Meta 100: bad'));
    const r = await dispatch('pause_ad', { ad_id: '1', reason: 'x' });
    expect(r.error).toMatch(/Meta 100/);
    expect((await stores.decisions.listRecent())[0].status).toBe('failed');
  });

  it('search_interest devuelve resultados sin registrar decisión', async () => {
    const r = await dispatch('search_interest', { query: 'yoga' });
    expect(r.results).toEqual([{ id: '2', name: 'Yoga', audienceMin: 50, audienceMax: 90 }]);
    expect(await stores.decisions.listRecent()).toHaveLength(0);
  });

  it('request_creative guarda el pedido', async () => {
    const r = await dispatch('request_creative', { funnel: 'frio', concept: 'X', style_notes: 'Y', reason: 'Z' });
    expect(r.ok).toBe(true);
    expect(await stores.creativeRequests.listOpen()).toHaveLength(1);
  });

  it('log_improvement_proposal y save_learning solo registran, no ejecutan nada', async () => {
    const r1 = await dispatch('log_improvement_proposal', { title: 't', body: 'b' });
    expect(r1.ok).toBe(true);
    expect(await stores.proposals.list()).toHaveLength(1);
    const r2 = await dispatch('save_learning', { text: 't', evidence: 'e' });
    expect(r2.ok).toBe(true);
    expect(await stores.learnings.listActive()).toHaveLength(1);
  });
});
