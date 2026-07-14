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
