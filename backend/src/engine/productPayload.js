// Payload de creación de producto en Tienda Nube.
// SIEMPRE nace oculto (published: false) — publicar es manual en TN, con fotos cargadas.
export function buildProductPayload({ name, description_html, price_ars, cost_ars, sizes }) {
  if (!Array.isArray(sizes) || sizes.length === 0) {
    throw new Error('faltan talles: pasá sizes con al menos un talle (los indica el usuario)');
  }
  return {
    name: { es: name },
    description: { es: description_html },
    published: false,
    attributes: [{ es: 'Talle' }],
    variants: sizes.map((talle) => ({
      price: String(price_ars),
      cost: String(cost_ars),
      values: [{ es: talle }],
    })),
  };
}
