// Mapea una orden de Tienda Nube a los inputs de computeSaleProfit.
// Validado contra un payload real (14/07/2026): payment_details.method viene como
// "wire_transfer" (no "bank_transfer"), y order.total ya es neto de descuentos/cupones
// (ej. descuento por pagar transferencia) — sumar products[].price ignora ese descuento
// y sobrestima la revenue. order.total - envío es la forma correcta de calcularla.
const TRANSFER_METHODS = new Set(['wire_transfer', 'bank_transfer']);

export function extractSaleInputs(order, costIndex) {
  let productsCost = 0;
  const missingCosts = [];
  for (const p of order.products || []) {
    const cost = costIndex[String(p.variant_id)] ?? costIndex[p.variant_id];
    if (cost == null) missingCosts.push(p.variant_id);
    else productsCost += cost * p.quantity;
  }
  const shippingCharged = Number(order.shipping_cost_customer || 0);
  const productsRevenue = Number(order.total) - shippingCharged;
  const method = TRANSFER_METHODS.has(order.payment_details?.method) ? 'transfer' : 'card';
  return {
    productsRevenue,
    productsCost,
    shippingCharged,
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
