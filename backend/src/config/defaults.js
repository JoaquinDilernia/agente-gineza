// Valores por defecto — TODOS editables desde el dashboard (colección config, doc 'main').
// Los % de comisión e impuestos son estimaciones iniciales: el usuario los ajusta con los reales.
export const DEFAULTS = {
  targetRoasFloor: 7,
  dailyBudgetMinArs: 30000,
  dailyBudgetMaxArs: 50000,
  metaSurcharge: 1.3,          // recargo por pagar Meta en ARS vía MercadoPago
  metaSurchargeEnabled: true,  // apagar cuando el usuario migre a dólar app
  taxPct: 0.08,
  paymentFees: { transfer: 0.01, card_1: 0.049, card_3: 0.089 },
  autonomousMode: true,        // kill switch: en false, TODO va a pending
  minMinutesBetweenSaleRuns: 30,
  // Mapeo para naming convention de anuncios nuevos
  adsetTags: {
    '120240905711110412': 'ATC14D',
    '120240906047320412': 'CATALOGO',
    '120240711724490412': 'BROADIG',
  },
  funnelByAdset: {
    '120240905711110412': 'CALIENTE',
    '120240906047320412': 'CALIENTE',
    '120240711724490412': 'FRIO',
  },
};
