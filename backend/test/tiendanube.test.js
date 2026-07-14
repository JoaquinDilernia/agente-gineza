import { describe, it, expect, vi } from 'vitest';
import { createTiendanubeClient } from '../src/services/tiendanube.js';
import { extractSaleInputs, buildCostIndex } from '../src/engine/extractSale.js';

describe('cliente tiendanube', () => {
  it('getOrder pega al endpoint correcto con auth', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
    const tn = createTiendanubeClient({ storeId: '111', token: 'tok', fetchFn });
    await tn.getOrder(55);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.tiendanube.com/v1/111/orders/55');
    expect(opts.headers.Authentication).toBe('bearer tok');
  });
  it('updateVariantPrice manda PUT con price string', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const tn = createTiendanubeClient({ storeId: '111', token: 'tok', fetchFn });
    await tn.updateVariantPrice(10, 20, 45990);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.tiendanube.com/v1/111/products/10/variants/20');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ price: '45990' });
  });
  it('listRecentOrders soporta paginación y filtro de estado de pago', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const tn = createTiendanubeClient({ storeId: '111', token: 'tok', fetchFn });
    await tn.listRecentOrders('2026-06-01T00:00:00Z', { page: 2, paymentStatus: 'paid' });
    const [url] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('page=2');
    expect(String(url)).toContain('payment_status=paid');
    expect(String(url)).toContain('created_at_min=2026-06-01');
  });
  it('error HTTP → throw con status', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    const tn = createTiendanubeClient({ storeId: '111', token: 'tok', fetchFn });
    await expect(tn.getOrder(1)).rejects.toThrow(/429/);
  });
});

describe('extractSaleInputs', () => {
  // Basado en un payload real de Tienda Nube (14/07/2026): products suman 65000,
  // pero total=63000 (hubo $2000 de descuento) y envío=5000 → revenue neta = 58000.
  const order = {
    products: [
      { variant_id: 100, price: '25000.00', quantity: 2 },
      { variant_id: 200, price: '15000.00', quantity: 1 },
    ],
    shipping_cost_customer: '5000.00',
    total: '63000.00',
    gateway: 'pago-nube',
    payment_details: { method: 'credit_card', installments: 3 },
  };
  it('revenue sale de order.total neto de envío (NO de sumar products[].price) — así se descuenta cualquier cupón/descuento', () => {
    const r = extractSaleInputs(order, { 100: 9000, 200: 4000 });
    expect(r.productsRevenue).toBe(58000); // 63000 - 5000, no 65000
    expect(r.productsCost).toBe(22000);
    expect(r.shippingCharged).toBe(5000);
    expect(r.payment).toEqual({ method: 'card', installments: 3 });
  });
  it('transferencia real de Tienda Nube es "wire_transfer", no "bank_transfer"', () => {
    const r = extractSaleInputs({ ...order, payment_details: { method: 'wire_transfer', installments: 1 } }, {});
    expect(r.payment.method).toBe('transfer');
  });
  it('acepta también "bank_transfer" por compatibilidad', () => {
    const r = extractSaleInputs({ ...order, payment_details: { method: 'bank_transfer' } }, {});
    expect(r.payment.method).toBe('transfer');
  });
  it('variante sin costo cargado cuenta 0 y queda listada en missingCosts', () => {
    const r = extractSaleInputs(order, {});
    expect(r.productsCost).toBe(0);
    expect(r.missingCosts).toEqual([100, 200]);
  });
});

describe('buildCostIndex', () => {
  it('indexa variant.cost por id', () => {
    const idx = buildCostIndex([
      { id: 1, variants: [{ id: 100, cost: '9000.00' }, { id: 101, cost: null }] },
    ]);
    expect(idx).toEqual({ 100: 9000 });
  });
});
