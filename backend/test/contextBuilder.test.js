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
