const BASE = 'https://api.tiendanube.com/v1';

export function createTiendanubeClient({ storeId, token, fetchFn = fetch }) {
  const headers = {
    Authentication: `bearer ${token}`, // sí: "Authentication", no "Authorization" — quirk de TN
    'User-Agent': 'gineza-agent (jdilernia99@gmail.com)',
    'Content-Type': 'application/json',
  };
  async function req(path, opts = {}) {
    const res = await fetchFn(`${BASE}/${storeId}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
    if (!res.ok) throw new Error(`Tienda Nube ${res.status}: ${await res.text()}`);
    return res.json();
  }
  return {
    getOrder: (id) => req(`/orders/${id}`),
    getProducts: (page = 1) => req(`/products?per_page=200&page=${page}`),
    listRecentOrders: (sinceIso) => req(`/orders?created_at_min=${encodeURIComponent(sinceIso)}&per_page=200`),
    updateVariantPrice: (productId, variantId, price) =>
      req(`/products/${productId}/variants/${variantId}`, { method: 'PUT', body: JSON.stringify({ price: String(price) }) }),
  };
}
