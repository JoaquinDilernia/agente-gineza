// Smoke test de credenciales: valida Firebase, Tienda Nube y (si hay token) Meta.
// Uso: node scripts/smokeTest.js
import 'dotenv/config';
import { initFirebase } from '../src/firebase.js';
import { createTiendanubeClient } from '../src/services/tiendanube.js';
import { createMetaClient } from '../src/services/meta.js';

const ok = (m) => console.log('  ✅', m);
const fail = (m, e) => console.log('  ❌', m, '—', e.message?.slice(0, 200));

console.log('1. Firebase (Firestore + Storage)');
let db;
try {
  const fb = initFirebase();
  db = fb.db;
  const ref = db.collection('_smoke').doc('test');
  await ref.set({ at: new Date().toISOString() });
  const snap = await ref.get();
  await ref.delete();
  ok(`Firestore lee y escribe (proyecto ${process.env.FIREBASE_PROJECT_ID || 'via JSON'})`);
  if (process.env.FIREBASE_STORAGE_BUCKET) {
    const [exists] = await fb.bucket.exists();
    exists ? ok(`Storage bucket "${process.env.FIREBASE_STORAGE_BUCKET}" existe`) : fail('Storage', new Error('el bucket no existe con ese nombre'));
  } else {
    console.log('  ⚠️  FIREBASE_STORAGE_BUCKET vacío — necesario para subir creativos');
  }
} catch (e) { fail('Firebase', e); }

console.log('2. Tienda Nube');
try {
  const tn = createTiendanubeClient({ storeId: process.env.TIENDANUBE_STORE_ID, token: process.env.TIENDANUBE_TOKEN });
  const products = await tn.getProducts();
  const withCost = products.flatMap((p) => p.variants || []).filter((v) => Number(v.cost) > 0).length;
  const total = products.flatMap((p) => p.variants || []).length;
  ok(`API responde: ${products.length} productos, ${withCost}/${total} variantes con costo cargado`);
} catch (e) { fail('Tienda Nube', e); }

console.log('3. Meta');
if (!process.env.META_ACCESS_TOKEN) {
  console.log('  ⚠️  META_ACCESS_TOKEN vacío — pendiente');
} else {
  try {
    const meta = createMetaClient({ accessToken: process.env.META_ACCESS_TOKEN, accountId: process.env.META_ACCOUNT_ID });
    const { data } = await meta.getCampaigns();
    ok(`Graph API responde: ${data.length} campañas visibles`);
  } catch (e) { fail('Meta', e); }
}

process.exit(0);
