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
