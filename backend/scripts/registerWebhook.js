// Registra los webhooks de órdenes de Tienda Nube apuntando al backend.
// Uso: BACKEND_URL=https://xxx.up.railway.app node scripts/registerWebhook.js
import 'dotenv/config';

const { TIENDANUBE_STORE_ID, TIENDANUBE_TOKEN, BACKEND_URL } = process.env;
if (!BACKEND_URL) throw new Error('Falta BACKEND_URL');

const headers = {
  Authentication: `bearer ${TIENDANUBE_TOKEN}`,
  'User-Agent': 'gineza-agent (jdilernia99@gmail.com)',
  'Content-Type': 'application/json',
};

for (const event of ['order/created', 'order/paid']) {
  const res = await fetch(`https://api.tiendanube.com/v1/${TIENDANUBE_STORE_ID}/webhooks`, {
    method: 'POST', headers,
    body: JSON.stringify({ event, url: `${BACKEND_URL}/webhooks/tiendanube` }),
  });
  console.log(event, res.status, await res.text());
}
