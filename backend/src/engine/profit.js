// Matemática de rentabilidad. Toda la plata en ARS. Funciones puras.
const round2 = (n) => Math.round(n * 100) / 100;

export function paymentFeePct(payment, feeTable) {
  if (payment.method === 'transfer') return feeTable.transfer;
  return (payment.installments || 1) >= 3 ? feeTable.card_3 : feeTable.card_1;
}

export function computeSaleProfit(sale, config) {
  const { productsRevenue, productsCost, payment, estimatedCpa } = sale;
  const fee = payment.exactFee ??
    (productsRevenue + (sale.shippingCharged || 0)) * paymentFeePct(payment, config.paymentFees);
  const taxes = productsRevenue * config.taxPct;
  const mult = config.metaSurchargeEnabled ? config.metaSurcharge : 1;
  const adCost = (estimatedCpa || 0) * mult;
  return {
    revenue: round2(productsRevenue),
    productsCost: round2(productsCost),
    paymentFee: round2(fee),
    taxes: round2(taxes),
    adCost: round2(adCost),
    profit: round2(productsRevenue - productsCost - fee - taxes - adCost),
  };
}

// ROAS mínimo para que UNA venta de este producto no pierda plata.
// Conservador: asume el fee de tarjeta 1 cuota (peor caso habitual).
export function breakEvenRoas(product, config) {
  const marginBeforeAds = product.price * (1 - config.paymentFees.card_1 - config.taxPct) - product.cost;
  if (marginBeforeAds <= 0) return Infinity;
  const mult = config.metaSurchargeEnabled ? config.metaSurcharge : 1;
  return round2((product.price * mult) / marginBeforeAds);
}
