import { describe, it, expect, vi } from 'vitest';
import { createDecisionExecutor } from '../src/agent/decisionExecutor.js';

function make() {
  const meta = {
    pauseAd: vi.fn().mockResolvedValue({ success: true }),
    updateBudget: vi.fn().mockResolvedValue({}),
    updateAdsetStatus: vi.fn().mockResolvedValue({}),
    pauseCampaign: vi.fn().mockResolvedValue({}),
    createAdset: vi.fn().mockResolvedValue({ id: 'as_nuevo' }),
    createCampaign: vi.fn().mockResolvedValue({ id: 'c_nuevo' }),
  };
  const tiendanube = { updateVariantPrice: vi.fn().mockResolvedValue({}) };
  const createAdFromCreative = vi.fn().mockResolvedValue({ ad_id: 'ad_1', name: 'TEST_AD' });
  return { executor: createDecisionExecutor({ meta, tiendanube, createAdFromCreative }), meta, tiendanube, createAdFromCreative };
}

describe('decisionExecutor — propose_campaign_structure_change', () => {
  it('create_adset: convierte daily_budget_ars a centavos en el payload', async () => {
    const { executor, meta } = make();
    await executor({
      tool: 'propose_campaign_structure_change',
      input: { action: 'create_adset', daily_budget_ars: 5000, payload: { name: 'TEST', targeting: { interests: [1] } } },
    });
    expect(meta.createAdset).toHaveBeenCalledWith({ name: 'TEST', targeting: { interests: [1] }, daily_budget: 500000 });
  });

  it('create_adset + creative_id: crea el conjunto Y lanza el ad con el creativo en una sola aprobación', async () => {
    const { executor, meta, createAdFromCreative } = make();
    const r = await executor({
      tool: 'propose_campaign_structure_change',
      input: { action: 'create_adset', daily_budget_ars: 3000, creative_id: 'cr_1', payload: { name: 'TEST' } },
    });
    expect(createAdFromCreative).toHaveBeenCalledWith({ creative_id: 'cr_1', adset_id: 'as_nuevo' });
    expect(r).toEqual({ adset: { id: 'as_nuevo' }, ad: { ad_id: 'ad_1', name: 'TEST_AD' } });
  });

  it('create_adset sin creative_id: solo crea el conjunto', async () => {
    const { executor, createAdFromCreative } = make();
    const r = await executor({
      tool: 'propose_campaign_structure_change',
      input: { action: 'create_adset', payload: { name: 'TEST' } },
    });
    expect(createAdFromCreative).not.toHaveBeenCalled();
    expect(r).toEqual({ adset: { id: 'as_nuevo' } });
  });

  it('create_campaign también convierte el presupuesto', async () => {
    const { executor, meta } = make();
    await executor({
      tool: 'propose_campaign_structure_change',
      input: { action: 'create_campaign', daily_budget_ars: 10000, payload: { name: 'CAMP TEST' } },
    });
    expect(meta.createCampaign).toHaveBeenCalledWith({ name: 'CAMP TEST', daily_budget: 1000000 });
  });

  it('pause_adset y pause_campaign siguen andando igual', async () => {
    const { executor, meta } = make();
    await executor({ tool: 'propose_campaign_structure_change', input: { action: 'pause_adset', object_id: 'as1' } });
    expect(meta.updateAdsetStatus).toHaveBeenCalledWith('as1', 'PAUSED');
    await executor({ tool: 'propose_campaign_structure_change', input: { action: 'pause_campaign', object_id: 'c1' } });
    expect(meta.pauseCampaign).toHaveBeenCalledWith('c1');
  });
});
