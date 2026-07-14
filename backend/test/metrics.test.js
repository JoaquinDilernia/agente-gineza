import { describe, it, expect, vi } from 'vitest';
import { createMetricsService } from '../src/services/metrics.js';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createConfigStore } from '../src/config/configStore.js';

function make() {
  const meta = {
    getInsights: vi.fn().mockResolvedValue({ data: [
      // spend 100000, 10 compras, revenue 700000
      { spend: '60000', actions: [{ action_type: 'purchase', value: '6' }], action_values: [{ action_type: 'purchase', value: '420000' }] },
      { spend: '40000', actions: [{ action_type: 'purchase', value: '4' }], action_values: [{ action_type: 'purchase', value: '280000' }] },
    ] });
  const configStore = createConfigStore(createFakeFirestore());
  return { svc: createMetricsService({ meta, configStore }), meta };
}

describe('metrics', () => {
  it('agrega spend, compras, revenue y calcula ROAS crudo y real', async () => {
    const { svc } = make();
    const m = await svc.last7d();
    expect(m.spend).toBe(100000);
    expect(m.purchases).toBe(10);
    expect(m.revenue).toBe(700000);
    expect(m.roas).toBe(7);            // 700000/100000
    expect(m.realSpend).toBe(130000);  // x1.3
    expect(m.realRoas).toBeCloseTo(5.38, 2); // 700000/130000
    expect(m.cpa).toBe(10000);
  });
  it('cachea 15 min: segunda llamada no pega a Meta', async () => {
    const { svc, meta } = make();
    await svc.last7d();
    await svc.last7d();
    expect(meta.getInsights).toHaveBeenCalledTimes(1);
  });
  it('sin compras no divide por cero', async () => {
    const { svc, meta } = make();
    meta.getInsights.mockResolvedValue({ data: [{ spend: '5000', actions: [], action_values: [] }] });
    const m = await svc.last7d();
    expect(m.roas).toBe(0);
    expect(m.cpa).toBe(0);
  });
});
