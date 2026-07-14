// Mapea una orden de Tienda Nube a los inputs de computeSaleProfit.
// OJO: al primer webhook real, loguear la orden cruda y validar este mapeo contra el payload real (spec §4).
export function extractSaleInputs(order, costIndex) {
  let productsRevenue = 0, productsCost = 0;
  const missingCosts = [];
  for (const p of order.products || []) {
    productsRevenue += Number(p.price) * p.quantity;
    const cost = costIndex[String(p.variant_id)] ?? costIndex[p.variant_id];
    if (cost == null) missingCosts.push(p.variant_id);
    else productsCost += cost * p.quantity;
  }
  const method = order.payment_details?.method === 'bank_transfer' ? 'transfer' : 'card';
  return {
    productsRevenue,
    productsCost,
    shippingCharged: Number(order.shipping_cost_customer || 0),
    payment: { method, installments: Number(order.payment_details?.installments || 1) },
    ...(missingCosts.length ? { missingCosts } : {}),
  };
}

export function buildCostIndex(products) {
  const idx = {};
  for (const prod of products) {
    for (const v of prod.variants || []) {
      const cost = Number(v.cost);
      if (v.cost != null && !Number.isNaN(cost) && cost > 0) idx[v.id] = cost;
    }
  }
  return idx;
}
