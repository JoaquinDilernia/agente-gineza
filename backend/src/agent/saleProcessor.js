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
