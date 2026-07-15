# Soporte de videos en creativos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir creativos de video (feed 4:5 + story 9:16) desde el dashboard; el agente crea ads de video con `create_ad` sin cambios de interfaz.

**Architecture:** Los videos se suben a Meta (`/advideos`) en el momento del submit del form y se guardan solo los `video_id` en Firestore (`mediaType: 'video'`). `createAd.js` ramifica por `mediaType`: para video verifica que Meta terminó de procesar, obtiene el thumbnail automático y arma un creative `SINGLE_VIDEO` con customización por placement.

**Tech Stack:** Node 20 ESM, Express + multer, Firestore, Graph API v23, vitest + supertest (backend), React + vitest + testing-library (frontend).

**Spec:** `docs/superpowers/specs/2026-07-15-video-creatives-design.md`

## Global Constraints

- `standard_enhancements: { enroll_status: 'OPT_OUT' }` en TODO creative — no negociable.
- `image_label` / `video_label` en `asset_customization_rules` DEBEN ser objeto `{ name }`, no string (error #100 de Meta).
- Docs de `creatives` existentes NO tienen `mediaType` → tratar ausencia como `'image'`.
- Límites: imágenes 10MB (como hoy), videos 200MB.
- No guardar videos en Firebase Storage — solo los IDs de Meta.
- Tests: `cd backend && npx vitest run` / `cd frontend && npx vitest run`. Commits frecuentes, mensajes en español como el historial (`feat:`/`fix:`), con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Helpers de video en el cliente Meta

**Files:**
- Modify: `backend/src/services/meta.js`
- Test: `backend/test/meta.test.js`

**Interfaces:**
- Produces: `meta.uploadVideo(buffer, filename) → Promise<string /* videoId */>`, `meta.getVideoStatus(videoId) → Promise<string /* 'ready'|'processing'|... */>`, `meta.getVideoThumbnail(videoId) → Promise<string /* uri */>`. Además `reqOnce` acepta opción `form` (FormData) para multipart.

- [ ] **Step 1: Escribir los tests que fallan** — agregar al final de `backend/test/meta.test.js`:

```js
describe('videos', () => {
  it('uploadVideo hace POST multipart a /advideos y devuelve el id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ id: 'vid_123' }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    const id = await meta.uploadVideo(Buffer.from('fake-video'), 'story.mp4');
    expect(id).toBe('vid_123');
    const [url, opts] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/v23.0/act_1/advideos');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get('source')).toBeInstanceOf(Blob);
    expect(opts.headers).toBeUndefined(); // fetch pone el boundary solo
  });
  it('getVideoStatus devuelve status.video_status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ status: { video_status: 'ready' }, id: 'vid_1' }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    expect(await meta.getVideoStatus('vid_1')).toBe('ready');
    expect(String(fetchFn.mock.calls[0][0])).toContain('fields=status');
  });
  it('getVideoThumbnail devuelve la uri preferida (o la primera si ninguna es preferred)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ data: [
      { uri: 'https://cdn/thumb1.jpg', is_preferred: false },
      { uri: 'https://cdn/thumb2.jpg', is_preferred: true },
    ] }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    expect(await meta.getVideoThumbnail('vid_1')).toBe('https://cdn/thumb2.jpg');
    expect(String(fetchFn.mock.calls[0][0])).toContain('/vid_1/thumbnails');
  });
  it('getVideoThumbnail sin thumbnails → error claro', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ data: [] }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    await expect(meta.getVideoThumbnail('vid_1')).rejects.toThrow('no tiene thumbnails');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && npx vitest run test/meta.test.js`
Expected: FAIL — `meta.uploadVideo is not a function` (y los otros 3).

- [ ] **Step 3: Implementar** — en `backend/src/services/meta.js`:

Cambiar la firma y el fetch de `reqOnce` para soportar multipart:

```js
  async function reqOnce(path, { method = 'GET', params = {}, body, form } = {}) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('access_token', accessToken);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    const res = await fetchFn(url, {
      method,
      // form: multipart (fetch arma el boundary solo, NO setear Content-Type)
      ...(form ? { body: form } : body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
```

Agregar al objeto retornado, después de `uploadImage`:

```js
    async uploadVideo(buffer, filename = 'video.mp4') {
      const form = new FormData();
      form.append('source', new Blob([buffer], { type: 'video/mp4' }), filename);
      const json = await req(`${accountId}/advideos`, { method: 'POST', form });
      return json.id;
    },
    async getVideoStatus(videoId) {
      const json = await req(videoId, { params: { fields: 'status' } });
      return json.status?.video_status || 'unknown';
    },
    async getVideoThumbnail(videoId) {
      const json = await req(`${videoId}/thumbnails`);
      const thumbs = json.data || [];
      if (thumbs.length === 0) throw new Error(`el video ${videoId} no tiene thumbnails todavía`);
      return (thumbs.find((t) => t.is_preferred) || thumbs[0]).uri;
    },
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && npx vitest run test/meta.test.js`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/meta.js backend/test/meta.test.js
git commit -m "feat: uploadVideo/getVideoStatus/getVideoThumbnail en cliente Meta"
```

---

### Task 2: Spec de creative de video por placement

**Files:**
- Modify: `backend/src/engine/creativeSpec.js`
- Test: `backend/test/meta.test.js` (ahí viven los tests de creativeSpec)

**Interfaces:**
- Produces: `buildPlacementVideoCreativeSpec({ name, pageId, igActorId, link, message, feedVideoId, storyVideoId, feedThumbnailUrl, storyThumbnailUrl }) → object` (spec para `meta.createCreative`).

- [ ] **Step 1: Escribir el test que falla** — en `backend/test/meta.test.js`, importar `buildPlacementVideoCreativeSpec` junto al import existente de `buildPlacementCreativeSpec` y agregar:

```js
describe('buildPlacementVideoCreativeSpec', () => {
  const spec = buildPlacementVideoCreativeSpec({
    name: 'AD_X', pageId: 'pg1', igActorId: 'ig1', link: 'https://gineza.com.ar',
    message: 'copy', feedVideoId: 'vf1', storyVideoId: 'vs1',
    feedThumbnailUrl: 'https://cdn/f.jpg', storyThumbnailUrl: 'https://cdn/s.jpg',
  });
  it('usa SINGLE_VIDEO con los dos videos etiquetados', () => {
    expect(spec.asset_feed_spec.ad_formats).toEqual(['SINGLE_VIDEO']);
    expect(spec.asset_feed_spec.videos).toEqual([
      { video_id: 'vf1', thumbnail_url: 'https://cdn/f.jpg', adlabels: [{ name: 'feed' }] },
      { video_id: 'vs1', thumbnail_url: 'https://cdn/s.jpg', adlabels: [{ name: 'story' }] },
    ]);
  });
  it('video_label es objeto {name}, no string (regla #100 de Meta)', () => {
    for (const rule of spec.asset_feed_spec.asset_customization_rules) {
      expect(rule.video_label).toEqual({ name: expect.any(String) });
    }
  });
  it('mantiene OPT_OUT de mejoras de IA (no negociable)', () => {
    expect(spec.degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status).toBe('OPT_OUT');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && npx vitest run test/meta.test.js`
Expected: FAIL — `buildPlacementVideoCreativeSpec` no exportada.

- [ ] **Step 3: Implementar** — agregar en `backend/src/engine/creativeSpec.js` (misma regla de labels-objeto que la versión de imagen):

```js
// Versión video: mismos placements, video_label en vez de image_label, SINGLE_VIDEO.
// El thumbnail es el que Meta genera solo (el usuario eligió no subir portada).
export function buildPlacementVideoCreativeSpec({ name, pageId, igActorId, link, message, feedVideoId, storyVideoId, feedThumbnailUrl, storyThumbnailUrl }) {
  return {
    name,
    object_story_spec: { page_id: pageId, instagram_actor_id: igActorId },
    asset_feed_spec: {
      videos: [
        { video_id: feedVideoId, thumbnail_url: feedThumbnailUrl, adlabels: [{ name: 'feed' }] },
        { video_id: storyVideoId, thumbnail_url: storyThumbnailUrl, adlabels: [{ name: 'story' }] },
      ],
      bodies: [{ text: message }],
      titles: [{ text: name }],
      link_urls: [{ website_url: link }],
      ad_formats: ['SINGLE_VIDEO'],
      call_to_action_types: ['SHOP_NOW'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] },
          video_label: { name: 'feed' },
        },
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story'], instagram_positions: ['story'] },
          video_label: { name: 'story' },
        },
      ],
    },
    degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
  };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd backend && npx vitest run test/meta.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/creativeSpec.js backend/test/meta.test.js
git commit -m "feat: buildPlacementVideoCreativeSpec (SINGLE_VIDEO por placement)"
```

---

### Task 3: POST /creatives acepta videos y los sube a Meta

**Files:**
- Modify: `backend/src/routes/api.js`
- Modify: `backend/src/index.js` (línea ~81: pasar `meta` al router)
- Test: `backend/test/api.test.js`

**Interfaces:**
- Consumes: `meta.uploadVideo(buffer, filename)` (Task 1).
- Produces: `createApiRouter({ stores, configStore, executor, storage, runner, metrics, meta })` — dependencia nueva `meta`. Docs de video en Firestore: `{ mediaType: 'video', feedVideoId, storyVideoId, name, copy, funnel, notes, status: 'unused' }`.

- [ ] **Step 1: Escribir los tests que fallan** — en `backend/test/api.test.js`: agregar `uploadVideo: vi.fn().mockResolvedValue('vid_1').mockResolvedValueOnce('vid_feed').mockResolvedValueOnce('vid_story')` al mock `meta` (línea ~29) y pasar `meta` a `createApiRouter` (línea ~35). Agregar al describe de creativos:

```js
  it('POST /creatives con videos → sube a Meta y guarda mediaType video', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'REEL1').field('copy', 'Mirá esto').field('funnel', 'frio')
      .attach('feedVideo', Buffer.from('fake-feed-video'), 'feed.mp4')
      .attach('storyVideo', Buffer.from('fake-story-video'), 'story.mp4');
    expect(res.status).toBe(201);
    expect(meta.uploadVideo).toHaveBeenCalledTimes(2);
    expect(storage.save).not.toHaveBeenCalled();
    const [c] = await stores.creatives.listUnused();
    expect(c).toMatchObject({ mediaType: 'video', feedVideoId: 'vid_feed', storyVideoId: 'vid_story' });
  });
  it('POST /creatives mezcla imagen + video → 400', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedImage', Buffer.from('img'), 'feed.jpg')
      .attach('storyVideo', Buffer.from('vid'), 'story.mp4');
    expect(res.status).toBe(400);
  });
  it('POST /creatives con un solo video → 400', async () => {
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedVideo', Buffer.from('vid'), 'feed.mp4');
    expect(res.status).toBe(400);
  });
  it('POST /creatives: si Meta falla la subida, 502 y NO queda doc', async () => {
    meta.uploadVideo.mockReset().mockRejectedValue(new Error('Meta 100: bad video'));
    const res = await auth(request(app).post('/api/creatives'))
      .field('name', 'X').field('copy', 'c').field('funnel', 'frio')
      .attach('feedVideo', Buffer.from('v1'), 'f.mp4')
      .attach('storyVideo', Buffer.from('v2'), 's.mp4');
    expect(res.status).toBe(502);
    expect(await stores.creatives.listUnused()).toHaveLength(0);
  });
  it('POST /creatives de imágenes guarda mediaType image', async () => {
    await auth(request(app).post('/api/creatives'))
      .field('name', 'BORDO2').field('copy', 'c').field('funnel', 'caliente')
      .attach('feedImage', Buffer.from('f'), 'feed.jpg')
      .attach('storyImage', Buffer.from('s'), 'story.jpg');
    const [c] = await stores.creatives.listUnused();
    expect(c.mediaType).toBe('image');
  });
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && npx vitest run test/api.test.js`
Expected: FAIL — los campos `feedVideo`/`storyVideo` son "Unexpected field" de multer (LIMIT_UNEXPECTED_FILE) o 400.

- [ ] **Step 3: Implementar** — en `backend/src/routes/api.js`:

Línea 4, subir el límite (el chequeo de 10MB de imagen pasa a hacerse en el handler):

```js
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
```

Firma: `export function createApiRouter({ stores, configStore, executor, storage, runner, metrics, meta }) {`

Reemplazar el handler de `POST /creatives` completo:

```js
  r.post('/creatives', upload.fields([
    { name: 'feedImage', maxCount: 1 }, { name: 'storyImage', maxCount: 1 },
    { name: 'feedVideo', maxCount: 1 }, { name: 'storyVideo', maxCount: 1 },
  ]), async (req, res) => {
    const feedImage = req.files?.feedImage?.[0];
    const storyImage = req.files?.storyImage?.[0];
    const feedVideo = req.files?.feedVideo?.[0];
    const storyVideo = req.files?.storyVideo?.[0];
    const { name, copy, funnel, notes } = req.body;
    if (!name || !copy || !funnel) return res.status(400).json({ error: 'faltan campos: name, copy, funnel' });
    const hasImages = Boolean(feedImage || storyImage);
    const hasVideos = Boolean(feedVideo || storyVideo);
    if (hasImages && hasVideos) return res.status(400).json({ error: 'no se puede mezclar imágenes y videos en el mismo creativo' });

    if (hasVideos) {
      if (!feedVideo || !storyVideo) return res.status(400).json({ error: 'faltan videos: feedVideo (4:5) y storyVideo (9:16)' });
      try {
        // se suben a Meta YA (los procesa en background) — al crear el ad tienen que estar ready
        const feedVideoId = await meta.uploadVideo(feedVideo.buffer, feedVideo.originalname);
        const storyVideoId = await meta.uploadVideo(storyVideo.buffer, storyVideo.originalname);
        const id = await stores.creatives.add({ name, copy, funnel, notes: notes || '', mediaType: 'video', feedVideoId, storyVideoId });
        return res.status(201).json({ id });
      } catch (err) {
        return res.status(502).json({ error: String(err.message || err) });
      }
    }

    if (!feedImage || !storyImage) return res.status(400).json({ error: 'faltan campos: feedImage, storyImage' });
    if (feedImage.size > MAX_IMAGE_BYTES || storyImage.size > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'imagen demasiado grande (máx 10MB)' });
    const ts = Date.now();
    const feedPath = await storage.save(`gineza/creatives/${ts}_feed.jpg`, feedImage.buffer, feedImage.mimetype);
    const storyPath = await storage.save(`gineza/creatives/${ts}_story.jpg`, storyImage.buffer, storyImage.mimetype);
    const id = await stores.creatives.add({ name, copy, funnel, notes: notes || '', mediaType: 'image', feedImagePath: feedPath, storyImagePath: storyPath });
    res.status(201).json({ id });
  });
```

En `backend/src/index.js` línea ~81, agregar `meta` a las deps del router:

```js
    createApiRouter({ stores, configStore, executor, storage, runner, metrics, meta }),
```

- [ ] **Step 4: Verificar que pasan**

Run: `cd backend && npx vitest run test/api.test.js`
Expected: PASS (incluidos los 2 tests preexistentes de creativos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/api.js backend/src/index.js backend/test/api.test.js
git commit -m "feat: POST /creatives acepta videos (sube a Meta al toque, guarda video_ids)"
```

---

### Task 4: createAd ramifica por mediaType

**Files:**
- Modify: `backend/src/agent/createAd.js`
- Create: `backend/test/createAd.test.js` (no existía — cubre también la rama imagen)

**Interfaces:**
- Consumes: `meta.getVideoStatus`, `meta.getVideoThumbnail` (Task 1), `buildPlacementVideoCreativeSpec` (Task 2), docs de video de Task 3.
- Produces: `createAdFromCreative({ creative_id, adset_id })` sin cambio de firma — los consumidores (`decisionExecutor`, `chatDispatcher`, `tools.js`) no se tocan.

- [ ] **Step 1: Escribir los tests que fallan** — crear `backend/test/createAd.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdBuilder } from '../src/agent/createAd.js';

let meta, storage, stores, configStore, create, creativeDoc;

beforeEach(() => {
  creativeDoc = null;
  meta = {
    uploadImage: vi.fn().mockResolvedValueOnce('hash_feed').mockResolvedValueOnce('hash_story'),
    getVideoStatus: vi.fn().mockResolvedValue('ready'),
    getVideoThumbnail: vi.fn().mockResolvedValueOnce('https://cdn/f.jpg').mockResolvedValueOnce('https://cdn/s.jpg'),
    createCreative: vi.fn().mockResolvedValue({ id: 'metacr_1' }),
    createAd: vi.fn().mockResolvedValue({ id: 'ad_1' }),
  };
  storage = { download: vi.fn().mockResolvedValue(Buffer.from('img')) };
  stores = { creatives: { get: vi.fn(async () => creativeDoc), markUsed: vi.fn() } };
  configStore = { get: vi.fn().mockResolvedValue({ funnelByAdset: {}, adsetTags: {} }) };
  create = createAdBuilder({ meta, storage, stores, configStore, pageId: 'pg1', igActorId: 'ig1', linkUrl: 'https://gineza.com.ar' });
});

describe('createAdFromCreative — imagen', () => {
  it('sube imágenes y crea creative SINGLE_IMAGE (flujo actual intacto)', async () => {
    creativeDoc = { id: 'cr1', name: 'BORDO', copy: 'c', status: 'unused', feedImagePath: 'p1', storyImagePath: 'p2' };
    const out = await create({ creative_id: 'cr1', adset_id: 'as1' });
    expect(meta.uploadImage).toHaveBeenCalledTimes(2);
    expect(meta.createCreative.mock.calls[0][0].asset_feed_spec.ad_formats).toEqual(['SINGLE_IMAGE']);
    expect(stores.creatives.markUsed).toHaveBeenCalledWith('cr1', 'ad_1');
    expect(out.ad_id).toBe('ad_1');
  });
});

describe('createAdFromCreative — video', () => {
  const videoDoc = { id: 'cr2', name: 'REEL1', copy: 'c', status: 'unused', mediaType: 'video', feedVideoId: 'vf', storyVideoId: 'vs' };
  it('verifica status, usa thumbnails de Meta y crea creative SINGLE_VIDEO', async () => {
    creativeDoc = videoDoc;
    const out = await create({ creative_id: 'cr2', adset_id: 'as1' });
    expect(meta.getVideoStatus).toHaveBeenCalledWith('vf');
    expect(meta.getVideoStatus).toHaveBeenCalledWith('vs');
    const spec = meta.createCreative.mock.calls[0][0];
    expect(spec.asset_feed_spec.ad_formats).toEqual(['SINGLE_VIDEO']);
    expect(spec.asset_feed_spec.videos[0]).toMatchObject({ video_id: 'vf', thumbnail_url: 'https://cdn/f.jpg' });
    expect(storage.download).not.toHaveBeenCalled();
    expect(out.ad_id).toBe('ad_1');
  });
  it('video aún procesándose → error reintentable y NO marca used', async () => {
    creativeDoc = videoDoc;
    meta.getVideoStatus.mockResolvedValue('processing');
    await expect(create({ creative_id: 'cr2', adset_id: 'as1' })).rejects.toThrow('procesándose');
    expect(meta.createCreative).not.toHaveBeenCalled();
    expect(stores.creatives.markUsed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && npx vitest run test/createAd.test.js`
Expected: los de imagen PASAN (comportamiento actual), los 2 de video FALLAN (hoy intenta `storage.download(undefined)`).

- [ ] **Step 3: Implementar** — reemplazar `backend/src/agent/createAd.js` completo:

```js
import { buildAdName } from '../engine/naming.js';
import { buildPlacementCreativeSpec, buildPlacementVideoCreativeSpec } from '../engine/creativeSpec.js';

export function createAdBuilder({ meta, storage, stores, configStore, pageId, igActorId, linkUrl }) {
  return async function createAdFromCreative({ creative_id, adset_id }) {
    const creative = await stores.creatives.get(creative_id);
    if (!creative) throw new Error(`creativo ${creative_id} no existe`);
    if (creative.status === 'used') throw new Error(`creativo ${creative_id} ya fue usado en el ad ${creative.adId}`);
    const config = await configStore.get();
    const adName = buildAdName({
      funnel: config.funnelByAdset[adset_id] || 'GEN',
      adsetTag: config.adsetTags[adset_id] || 'SINTAG',
      creativeName: creative.name,
    });

    let spec;
    if (creative.mediaType === 'video') {
      // Meta procesa los videos en background después del upload: si todavía no están
      // ready acá, el error es reintentable (cola de aprobación o retryDecision.mjs).
      for (const videoId of [creative.feedVideoId, creative.storyVideoId]) {
        const status = await meta.getVideoStatus(videoId);
        if (status !== 'ready') throw new Error(`video ${videoId} aún procesándose en Meta (status: ${status}), reintentá en unos minutos`);
      }
      const [feedThumbnailUrl, storyThumbnailUrl] = await Promise.all([
        meta.getVideoThumbnail(creative.feedVideoId),
        meta.getVideoThumbnail(creative.storyVideoId),
      ]);
      spec = buildPlacementVideoCreativeSpec({
        name: adName, pageId, igActorId, link: linkUrl, message: creative.copy,
        feedVideoId: creative.feedVideoId, storyVideoId: creative.storyVideoId,
        feedThumbnailUrl, storyThumbnailUrl,
      });
    } else {
      const [feedBuf, storyBuf] = await Promise.all([
        storage.download(creative.feedImagePath),
        storage.download(creative.storyImagePath),
      ]);
      const feedHash = await meta.uploadImage(feedBuf);
      const storyHash = await meta.uploadImage(storyBuf);
      spec = buildPlacementCreativeSpec({
        name: adName, pageId, igActorId, link: linkUrl,
        message: creative.copy, feedImageHash: feedHash, storyImageHash: storyHash,
      });
    }

    const { id: metaCreativeId } = await meta.createCreative(spec);
    const ad = await meta.createAd({ name: adName, adsetId: adset_id, creativeId: metaCreativeId });
    await stores.creatives.markUsed(creative_id, ad.id);
    return { ad_id: ad.id, name: adName };
  };
}
```

- [ ] **Step 4: Verificar que pasan + suite completa**

Run: `cd backend && npx vitest run`
Expected: PASS todo (96 preexistentes + nuevos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/createAd.js backend/test/createAd.test.js
git commit -m "feat: create_ad soporta creativos de video (thumbnail auto, chequeo de procesamiento)"
```

---

### Task 5: El agente sabe que hay creativos de video

**Files:**
- Modify: `backend/src/agent/systemPrompt.js` (regla 3, línea ~40)

**Interfaces:**
- Consumes: nada nuevo — `unusedCreatives` ya incluye el doc completo (con `mediaType`) porque `listUnused()` esparce `d.data()`.

- [ ] **Step 1: Editar la regla 3** — en `backend/src/agent/systemPrompt.js` línea ~40, extender:

De:
```
3. Podés ejecutar SIN permiso: pause_ad (ads con gasto y $0 conversión, o fatiga clara) y create_ad (solo con creativos de la lista unusedCreatives, respetando su funnel recomendado).
```

A:
```
3. Podés ejecutar SIN permiso: pause_ad (ads con gasto y $0 conversión, o fatiga clara) y create_ad (solo con creativos de la lista unusedCreatives, respetando su funnel recomendado). Los creativos pueden ser imagen o video (campo mediaType) — create_ad funciona igual con ambos; si un creativo de video falla porque Meta sigue procesándolo, reintentá más tarde, no lo descartes.
```

- [ ] **Step 2: Verificar que nada se rompió**

Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/agent/systemPrompt.js
git commit -m "feat: system prompt menciona creativos de video en create_ad"
```

---

### Task 6: Formulario de video en el dashboard

**Files:**
- Modify: `frontend/src/pages/Creativos.jsx`
- Test: `frontend/test/creativos.test.jsx` (nuevo)

**Interfaces:**
- Consumes: `POST /creatives` con `feedVideo`/`storyVideo` (Task 3) vía `api.postForm`.

- [ ] **Step 1: Escribir los tests que fallan** — crear `frontend/test/creativos.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Creativos from '../src/pages/Creativos.jsx';

function makeApi() {
  return { get: vi.fn().mockResolvedValue([]), post: vi.fn(), postForm: vi.fn().mockResolvedValue({ id: 'cr1' }) };
}

describe('Creativos — tipo de pieza', () => {
  it('al elegir Video cambian los inputs de archivo', async () => {
    render(<Creativos api={makeApi()} />);
    await screen.findByText('Subir creativo');
    await userEvent.selectOptions(screen.getByLabelText(/Tipo de pieza/), 'video');
    expect(screen.getByLabelText(/Video feed/)).toHaveAttribute('accept', 'video/*');
    expect(screen.getByLabelText(/Video story/)).toHaveAttribute('accept', 'video/*');
    expect(screen.getByText(/tarda/i)).toBeInTheDocument();
  });
  it('submit de video manda feedVideo y storyVideo en el FormData', async () => {
    const api = makeApi();
    render(<Creativos api={api} />);
    await screen.findByText('Subir creativo');
    await userEvent.selectOptions(screen.getByLabelText(/Tipo de pieza/), 'video');
    await userEvent.type(screen.getByPlaceholderText(/BORDO/), 'REEL1');
    await userEvent.type(screen.getByPlaceholderText(/Tu nuevo uniforme/), 'copy');
    await userEvent.upload(screen.getByLabelText(/Video feed/), new File(['v'], 'f.mp4', { type: 'video/mp4' }));
    await userEvent.upload(screen.getByLabelText(/Video story/), new File(['v'], 's.mp4', { type: 'video/mp4' }));
    await userEvent.click(screen.getByRole('button', { name: /Subir creativo/ }));
    await waitFor(() => expect(api.postForm).toHaveBeenCalled());
    const fd = api.postForm.mock.calls[0][1];
    expect(fd.get('feedVideo')).toBeInstanceOf(File);
    expect(fd.get('storyVideo')).toBeInstanceOf(File);
    expect(fd.get('feedImage')).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd frontend && npx vitest run test/creativos.test.jsx`
Expected: FAIL — no existe el select "Tipo de pieza".

- [ ] **Step 3: Implementar** — en `frontend/src/pages/Creativos.jsx`:

Estado nuevo junto a los existentes (`feed`/`story` pasan a ser el archivo del tipo elegido):

```jsx
const [mediaType, setMediaType] = useState('image');
```

En `submit`, reemplazar los dos `fd.append` de archivos por:

```jsx
      fd.append(mediaType === 'video' ? 'feedVideo' : 'feedImage', feed);
      fd.append(mediaType === 'video' ? 'storyVideo' : 'storyImage', story);
```

En el primer `form-row` (junto a Nombre y Funnel) agregar el selector — y al cambiarlo, limpiar los archivos elegidos:

```jsx
          <div>
            <label className="field">
              Tipo de pieza
              <select value={mediaType} onChange={(e) => { setMediaType(e.target.value); setFeed(null); setStory(null); }}>
                <option value="image">Imagen</option>
                <option value="video">Video</option>
              </select>
            </label>
          </div>
```

Reemplazar el `form-row` de los inputs de archivo:

```jsx
        <div className="form-row">
          <div>
            <label className="field">
              {mediaType === 'video' ? 'Video feed (4:5)' : 'Imagen feed (4:5)'}
              <input required type="file" accept={mediaType === 'video' ? 'video/*' : 'image/*'} onChange={(e) => setFeed(e.target.files[0])} />
            </label>
          </div>
          <div>
            <label className="field">
              {mediaType === 'video' ? 'Video story (9:16)' : 'Imagen story (9:16)'}
              <input required type="file" accept={mediaType === 'video' ? 'video/*' : 'image/*'} onChange={(e) => setStory(e.target.files[0])} />
            </label>
          </div>
        </div>
        {mediaType === 'video' && <p className="hint">Los videos se suben a Meta en este momento: el envío puede tardar un rato según el peso (máx 200MB por video).</p>}
```

En la tabla de subidos, agregar columna Tipo después de Nombre:

```jsx
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Copy</th><th>Funnel</th><th>Estado</th></tr></thead>
```
y en cada fila:
```jsx
                  <td>{c.mediaType === 'video' ? '🎬 video' : '🖼️ imagen'}</td>
```

Nota: si `<input required type="file">` da problemas con el reset al cambiar de tipo, agregar `key={mediaType}` a cada input para que React los re-monte.

- [ ] **Step 4: Verificar que pasan + suite frontend completa**

Run: `cd frontend && npx vitest run`
Expected: PASS (10 preexistentes + 2 nuevos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Creativos.jsx frontend/test/creativos.test.jsx
git commit -m "feat: formulario de creativos soporta video (feed+story) en el dashboard"
```

---

### Task 7: Build + deploy

- [ ] **Step 1: Suites completas**

Run: `cd backend && npx vitest run` y `cd frontend && npx vitest run`
Expected: PASS todo.

- [ ] **Step 2: Build del frontend**

Run: `cd frontend && npm run build`
Expected: `dist/` regenerado; anotar el hash nuevo de `dist/assets/index-*.js`.

- [ ] **Step 3: Push (dispara auto-deploy de Railway para el backend)**

```bash
git push origin main
```

- [ ] **Step 4: Pasos manuales del usuario (avisarle):**
  - Subir `frontend/dist/` completo a Hostinger (reemplazando `assets/`, no solo `index.html`).
  - Verificar: `curl -s https://agente.techdi.com.ar/ | grep -o 'assets/index-[A-Za-z0-9]*\.js'` debe coincidir con el hash local.
  - Probar subiendo el video que pidió el agente (pedido `af5WOrcULyDgqxiPMyRs`).

**Riesgo conocido (verificar en la primera subida real):** el token de Meta podría no tener permisos de página para `/advideos` (mismo riesgo ya anotado para `create_ad`); si falla con error de permisos, regenerar el token con `pages_read_engagement`/`pages_show_list`.
