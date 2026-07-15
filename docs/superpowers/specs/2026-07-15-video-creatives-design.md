# Soporte de videos en creativos — Diseño

**Fecha:** 2026-07-15
**Estado:** aprobado por el usuario

## Problema

El flujo de creativos solo acepta imágenes (feed 4:5 + story 9:16). El agente pidió
un creativo de video (`request_creative`) y no hay forma de subirlo. Los ads de video
son además el formato dominante en prospecting frío.

## Decisiones tomadas con el usuario

1. **Dos videos por creativo** (feed 4:5 + story 9:16), espejando el flujo de imágenes,
   con customización por placement. No un único 9:16.
2. **Thumbnail automático de Meta**: no se pide portada; se usa el thumbnail preferido
   que Meta genera al procesar el video.
3. **Subida a Meta al momento del submit** del formulario (no al crear el ad): Meta
   procesa el video en background y cuando el agente crea el ad ya está listo.

## Modelo de datos

Colección `creatives` (prefijo `gineza_`), campo nuevo:

- `mediaType: 'image' | 'video'` — docs existentes sin el campo ≡ `'image'`.
- Para video: `feedVideoId`, `storyVideoId` (IDs de Meta). **No** se guarda copia del
  archivo en Firebase Storage: el video queda en la biblioteca de la cuenta de Meta y
  el ID alcanza para crear ads. Los campos `feedImagePath`/`storyImagePath` no existen
  en creativos de video.

## Backend

### `services/meta.js`

- `uploadVideo(buffer, filename)` → POST `{accountId}/advideos` multipart (`source`).
  Devuelve `{ id }`.
- `getVideoStatus(videoId)` → GET `{videoId}?fields=status`. Devuelve el
  `status.video_status` (`ready` / `processing` / `error`).
- `getVideoThumbnail(videoId)` → GET `{videoId}/thumbnails`, devuelve la URI del
  thumbnail con `is_preferred: true` (o el primero si ninguno está marcado).

### `routes/api.js` — `POST /creatives`

- Multer acepta además `feedVideo` y `storyVideo` (maxCount 1 c/u).
- Límite de tamaño: 10MB para imágenes (como hoy), **200MB** para videos.
- Validación: (feedImage + storyImage) XOR (feedVideo + storyVideo). Mezclas o pares
  incompletos → 400 con mensaje claro.
- Rama video: sube ambos a Meta (`uploadVideo`), guarda el doc con
  `mediaType: 'video'` + los dos IDs. Si falla la subida de uno, el request falla
  entero (el video huérfano en Meta es inofensivo) y no se crea el doc.
- Rama imagen: intacta (`mediaType: 'image'` explícito en docs nuevos).

### `agent/createAd.js`

Ramifica por `mediaType`:

- **image**: flujo actual sin cambios.
- **video**:
  1. Verifica `getVideoStatus` de ambos videos. Si alguno no está `ready`, lanza
     error claro: `"video <id> aún procesándose en Meta, reintentá en unos minutos"`
     — reintentable vía cola de aprobación o `scripts/retryDecision.mjs`.
  2. Obtiene el thumbnail preferido de cada video.
  3. Arma el spec con `buildPlacementVideoCreativeSpec` y sigue igual que hoy
     (createCreative → createAd → markUsed).

### `engine/creativeSpec.js`

Nueva función `buildPlacementVideoCreativeSpec({ name, pageId, igActorId, link,
message, feedVideoId, storyVideoId, feedThumbnailUrl, storyThumbnailUrl })`:

- `asset_feed_spec.videos: [{ video_id, thumbnail_url, adlabels: [{name}] }]`
- `ad_formats: ['SINGLE_VIDEO']`
- `asset_customization_rules` con `video_label` (objeto `{name}`, no string — misma
  regla ganada con sangre que `image_label`).
- Mismo `degrees_of_freedom_spec` con `standard_enhancements: OPT_OUT`
  (**no negociable**, el usuario no quiere mejoras de IA de Meta).

## Agente

- `contextBuilder.js`: `unusedCreatives` incluye `mediaType` para que el agente sepa
  qué tipo de pieza tiene disponible.
- `systemPrompt.js`: una línea aclarando que los creativos pueden ser imagen o video
  y que `create_ad` funciona igual con ambos.
- `tools.js` / `create_ad`: interfaz sin cambios (recibe `creative_id`, el branching
  es interno).

## Frontend (`pages/Creativos.jsx`)

- Selector "Imagen / Video" en el form; cambia los dos inputs de archivo
  (`accept="image/*"` ↔ `accept="video/*"`, labels "Video feed (4:5)" / "Video story
  (9:16)").
- Aviso al elegir video: el submit tarda más porque se sube a Meta en el momento.
- La tabla de subidos muestra el tipo (chip o columna).
- Deploy: rebuild de `frontend/dist/` + resubir a Hostinger, verificando el hash del
  JS con `curl -s https://agente.techdi.com.ar/ | grep -o 'assets/index-[A-Za-z0-9]*\.js'`.

## Manejo de errores

- Subida a Meta falla en el submit → 400/502 con el detalle real de Meta
  (`error_user_msg` ya viene enriquecido desde el fix del 15/07); no queda doc a medias.
- Video no listo al crear el ad → error reintentable, el creativo NO se marca `used`.
- Timeout del request de submit: subir 2×~100MB puede tardar; verificar que Railway
  no corte antes (timeout por defecto alcanza para varios minutos).

## Tests

Siguiendo los patrones existentes (96 tests backend / 10 frontend):

- `creativeSpec`: spec de video correcto (video_label objeto, SINGLE_VIDEO, OPT_OUT).
- `api.js`: validación XOR (imágenes, videos, mezcla → 400, par incompleto → 400).
- `createAd`: rama video feliz, video no-ready lanza y no marca used, rama imagen
  intacta.
- `meta.js`: uploadVideo/getVideoStatus/getVideoThumbnail con fetch mockeado.

## Fuera de alcance

- Video único 9:16 para todos los placements.
- Portada custom subida por el usuario.
- Carousels o mezcla imagen+video en un mismo creativo.
- Subida chunked/resumable a Meta (200MB entra en el upload simple).
