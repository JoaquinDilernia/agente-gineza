# Crear productos de Tienda Nube desde el agente — Diseño

**Fecha:** 2026-07-15
**Estado:** aprobado por el usuario

## Problema

Cargar un producto nuevo en Tienda Nube es manual: precio a ojo y descripción desde
cero. El usuario quiere pasarle al agente nombre + costo + info y que: (a) recomiende
precio considerando el descuento del 15% por transferencia, (b) escriba la descripción
calcando el estilo de las existentes (referencia: producto Magna), y (c) cree el
producto **oculto** (`published: false`).

## Decisiones tomadas con el usuario

1. **Ambas entradas**: módulo nuevo "Productos" en el panel Y chat. Un solo pipeline
   de backend (el del chat) para los dos.
2. **Talles**: el usuario los especifica en cada creación (sin curva default).
3. **Fotos**: fuera de alcance — las carga el usuario en TN antes de publicar.
4. El producto SIEMPRE nace oculto. Publicarlo es manual en TN.

## Backend

### `services/tiendanube.js`

- `getProduct(productId)` → GET `/products/{id}` (nombre, descripción, variantes con
  precio/costo).
- `createProduct(payload)` → POST `/products`. El builder del payload arma:
  `{ name: { es }, description: { es }, published: false, variants: [{ price, cost,
  values: [{ es: talle }] }] }` — una variante por talle, mismo precio/costo.

### Tools nuevas del agente (`agent/tools.js` + `chatDispatcher.js`)

- `get_product`: `{ product_id }` → devuelve nombre, descripción HTML y variantes.
  Para leer el producto de referencia (ej. Magna) antes de escribir una descripción,
  y para chequear precios de productos comparables. Solo lectura, sin aprobación.
- `create_product`: `{ name, description_html, price_ars, cost_ars, sizes: string[] }`
  → crea el producto oculto vía `createProduct`. En el chat ejecuta directo (regla 10:
  el usuario lo está autorizando ahí mismo). En el análisis autónomo NO está permitido
  crear productos — la tool se expone solo en el dispatcher del chat.
- El agente ya tiene la tabla de productos (con id) en el contexto deep; en chat puede
  pedir el id con `get_product` si el usuario nombra el producto de referencia.

### System prompt (`agent/systemPrompt.js`)

Bloque nuevo "creación de productos":
- Precio recomendado: el margen tiene que quedar sano **incluso con el 15% de
  descuento por transferencia** + comisión de pago + `taxPct`. Mostrar la cuenta
  (costo → precio → margen con y sin descuento) ANTES de crear.
- Descripción: SIEMPRE leer primero con `get_product` la descripción de un producto
  existente comparable (el usuario suele citar Magna) y calcar estructura, tono y
  formato HTML. No inventar un formato nuevo.
- Confirmación conversacional: recomendar → esperar el "dale" del usuario → crear.
  Nunca crear sin que el usuario haya visto precio y descripción.
- Recordar al usuario que el producto quedó oculto y le faltan fotos.

## Frontend — página "Productos"

Formulario: nombre, costo, talles (texto libre, ej. "S, M, L, XL"), info/notas.
Al enviar, arma un mensaje estructurado y lo manda por el MISMO endpoint del chat
(`POST /chat`): "Quiero crear un producto: nombre …, costo $…, talles …, info: ….
Recomendame precio y descripción (estilo Magna) y esperá mi confirmación."
La conversación sigue en la misma página (vista tipo chat embebida) — la
recomendación llega como respuesta, el usuario confirma ahí y el agente lo crea.
Nav inferior mobile incluye la página (uso 90% celular).

## Manejo de errores

- Error de TN al crear (validación, token) → el mensaje va al chat tal cual
  (`Tienda Nube {status}: {body}`), el agente lo explica y no reintenta solo.
- `sizes` vacío → la tool falla con error claro pidiendo talles.

## Tests

- `tiendanube.test.js`: `getProduct` y `createProduct` (payload correcto:
  `published: false`, variantes por talle con precio/costo string, name/description
  como `{ es }`).
- `chatDispatcher.test.js`: `create_product` llama a `tiendanube.createProduct` con
  el payload armado; `get_product` devuelve los campos; `sizes` vacío → error.
- Frontend: página Productos manda el mensaje estructurado a `/chat` y muestra la
  respuesta.

## Fuera de alcance

- Subida de fotos.
- Publicar el producto (siempre queda oculto).
- Stock (queda 0 / a cargo del usuario en TN).
- Categorías, SEO, atributos extra de TN.
- `create_product` en el análisis autónomo de background.
