// Inspección puntual: trae 1 orden real reciente y la imprime cruda,
// para validar el mapeo de extractSaleInputs contra el payload real.
import 'dotenv/config';
import { createTiendanubeClient } from '../src/services/tiendanube.js';

const tiendanube = createTiendanubeClient({ storeId: process.env.TIENDANUBE_STORE_ID, token: process.env.TIENDANUBE_TOKEN });
const since = new Date(Date.now() - 30 * 86400_000).toISOString();
const orders = await tiendanube.listRecentOrders(since);
console.log(`${orders.length} órdenes encontradas en los últimos 30 días`);
if (orders.length) console.log(JSON.stringify(orders[0], null, 2));
