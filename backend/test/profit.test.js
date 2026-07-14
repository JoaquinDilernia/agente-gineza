import { describe, it, expect } from 'vitest';
import { computeSaleProfit, breakEvenRoas, paymentFeePct } from '../src/engine/profit.js';

const config = {
  taxPct: 0.08,
  metaSurcharge: 1.3,
  metaSurchargeEnabled: true,
  paymentFees: { transfer: 0.01, card_1: 0.049, card_3: 0.089 },
};

describe('paymentFeePct', () => {
  it('transferencia usa fee de transfer', () =>
    expect(paymentFeePct({ method: 'transfer' }, config.paymentFees)).toBe(0.01));
  it('tarjeta 3+ cuotas usa card_3', () =>
    expect(paymentFeePct({ method: 'card', installments: 3 }, config.paymentFees)).toBe(0.089));
  it('tarjeta 1 cuota usa card_1', () =>
    expect(paymentFeePct({ method: 'card', installments: 1 }, config.paymentFees)).toBe(0.049));
});

describe('computeSaleProfit', () => {
  it('venta rentable por transferencia: desglose completo', () => {
    const r = computeSaleProfit({
      productsRevenue: 50000, shippingCharged: 5000, productsCost: 20000,
      payment: { method: 'transfer' }, estimatedCpa: 10000,
    }, config);
    // fee = (50000+5000)*0.01 = 550 (la comisión se cobra sobre el total transaccionado, envío incluido)
    // taxes = 50000*0.08 = 4000 ; adCost = 10000*1.3 = 13000
    // profit = 50000 - 20000 - 550 - 4000 - 13000 = 12450 (el envío es pass-through: no suma ni resta)
    expect(r).toEqual({ revenue: 50000, productsCost: 20000, paymentFee: 550, taxes: 4000, adCost: 13000, profit: 12450 });
  });
  it('usa comisión exacta si la orden la trae', () => {
    const r = computeSaleProfit({
      productsRevenue: 50000, shippingCharged: 0, productsCost: 20000,
      payment: { method: 'card', installments: 3, exactFee: 3100 }, estimatedCpa: 0,
    }, config);
    expect(r.paymentFee).toBe(3100);
  });
  it('multiplicador Meta desactivado no infla adCost', () => {
    const r = computeSaleProfit({
      productsRevenue: 50000, shippingCharged: 0, productsCost: 20000,
      payment: { method: 'transfer' }, estimatedCpa: 10000,
    }, { ...config, metaSurchargeEnabled: false });
    expect(r.adCost).toBe(10000);
  });
  it('una venta puede dar pérdida', () => {
    const r = computeSaleProfit({
      productsRevenue: 30000, shippingCharged: 0, productsCost: 25000,
      payment: { method: 'card', installments: 3 }, estimatedCpa: 8000,
    }, config);
    expect(r.profit).toBeLessThan(0);
  });
});

describe('breakEvenRoas', () => {
  it('producto con buen margen → ROAS de equilibrio bajo', () => {
    // margen antes de ads = 50000*(1-0.049-0.08) - 20000 = 23550
    // beROAS = 50000*1.3/23550 ≈ 2.76
    expect(breakEvenRoas({ price: 50000, cost: 20000 }, config)).toBeCloseTo(2.76, 2);
  });
  it('producto que pierde antes de ads → Infinity', () =>
    expect(breakEvenRoas({ price: 20000, cost: 19000 }, config)).toBe(Infinity));
});
