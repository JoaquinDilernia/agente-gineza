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
