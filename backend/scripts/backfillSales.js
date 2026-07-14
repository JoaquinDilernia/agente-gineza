// Reconstruye el historial de ventas con rentabilidad real, para el período ANTERIOR
// a que existiera el webhook de Tienda Nube (o para completar huecos).
// El CPA de pauta se calcula por DÍA real de cada venta (insights de Meta de ese día
// puntual), no con el blended de 48h que usa el trigger en vivo — más preciso para histórico.
// Uso: node scripts/backfillSales.js [dias=30]
import 'dotenv/config';
import { initFirebase } from '../src/firebase.js';
import { prefixedDb } from '../src/store/prefixedDb.js';
import { createConfigStore } from '../src/config/configStore.js';
import { createSalesStore } from '../src/store/sales.js';
import { createMetaClient } from '../src/services/meta.js';
import { createTiendanubeClient } from '../src/services/tiendanube.js';
import { extractSaleInputs, buildCostIndex } from '../src/engine/extractSale.js';
import { computeSaleProfit } from '../src/engine/profit.js';

const days = Number(process.argv[2]) || 30;

const { db: rawDb } = initFirebase();
const db = prefixedDb(rawDb);
const configStore = createConfigStore(db);
const salesStore = createSalesStore(db);
const meta = createMetaClient({ accessToken: process.env.META_ACCESS_TOKEN, accountId: process.env.META_ACCOUNT_ID });
const tiendanube = createTiendanubeClient({ storeId: process.env.TIENDANUBE_STORE_ID, token: process.env.TIENDANUBE_TOKEN });

const config = await configStore.get();
console.log('Costo de productos...');
const costIndex = buildCostIndex(await tiendanube.getProducts());

const since = new Date(Date.now() - days * 86400_000).toISOString();
console.log(`Buscando órdenes pagas desde ${since.slice(0, 10)}...`);

let orders = [];
for (let page = 1; ; page++) {
  const batch = await tiendanube.listRecentOrders(since, { page, paymentStatus: 'paid' });
  if (!batch.length) break;
  orders.push(...batch);
  if (batch.length < 200) break;
}
console.log(`${orders.length} órdenes pagas encontradas.`);

// CPA blended por día real (cacheado, 1 sola llamada a Meta por día distinto).
const cpaCache = new Map();
async function cpaForDay(dayStr) {
  if (cpaCache.has(dayStr)) return cpaCache.get(dayStr);
  const { data } = await meta.getInsights('account', dayStr, dayStr);
  let spend = 0, purchases = 0;
  for (const row of data || []) {
    spend += Number(row.spend || 0);
    purchases += Number((row.actions || []).find((a) => a.action_type === 'purchase')?.value || 0);
  }
  const cpa = purchases > 0 ? spend / purchases : 0;
  cpaCache.set(dayStr, cpa);
  return cpa;
}

let inserted = 0, skipped = 0, totalProfit = 0, missingCostOrders = 0;
for (const order of orders) {
  const day = (order.paid_at || order.created_at).slice(0, 10);
  const estimatedCpa = await cpaForDay(day);
  const inputs = extractSaleInputs(order, costIndex);
  const profit = computeSaleProfit({ ...inputs, estimatedCpa }, config);
  const createdAt = order.paid_at || order.created_at;
  const isNew = await salesStore.addIfNew(order.id, {
    inputs, profit, estimatedCpa, source: 'backfill',
    ...(inputs.missingCosts ? { missingCosts: inputs.missingCosts } : {}),
  }, createdAt);
  if (isNew) {
    inserted++;
    totalProfit += profit.profit;
    if (inputs.missingCosts) missingCostOrders++;
  } else {
    skipped++;
  }
}

console.log(`\nInsertadas: ${inserted} | ya existían (webhook en vivo): ${skipped}`);
console.log(`Ganancia neta total del período backfillado: $${Math.round(totalProfit).toLocaleString('es-AR')}`);
if (missingCostOrders) console.log(`⚠ ${missingCostOrders} órdenes tenían algún producto sin costo cargado en Tienda Nube (se computó $0 de costo en esa línea).`);
process.exit(0);
