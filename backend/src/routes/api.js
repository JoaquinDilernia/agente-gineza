import express from 'express';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function createApiRouter({ stores, configStore, executor, storage, runner, metrics, meta }) {
  const r = express.Router();

  r.get('/summary', async (_req, res) => {
    const [sales, pending] = await Promise.all([stores.sales.listRecent(100), stores.decisions.listPending()]);
    res.json({ sales, pendingCount: pending.length });
  });
  r.get('/metrics', async (_req, res) => {
    try {
      res.json(await metrics.last7d());
    } catch (err) {
      res.status(502).json({ error: String(err.message || err) });
    }
  });
  r.get('/sales', async (_req, res) => res.json(await stores.sales.listRecent(100)));
  r.get('/decisions', async (req, res) => {
    if (req.query.status === 'pending') return res.json(await stores.decisions.listPending());
    res.json(await stores.decisions.listRecent(100));
  });
  r.get('/proposals', async (_req, res) => res.json(await stores.proposals.list()));
  r.get('/learnings', async (_req, res) => res.json(await stores.learnings.listActive()));
  r.delete('/learnings/:id', async (req, res) => { await stores.learnings.remove(req.params.id); res.json({ ok: true }); });

  r.post('/decisions/:id/approve', async (req, res) => {
    const d = await stores.decisions.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'no existe' });
    if (d.status !== 'pending') return res.status(409).json({ error: `estado ${d.status}, no pending` });
    try {
      const result = await executor(d);
      await stores.decisions.setStatus(d.id, 'approved', { executedAt: new Date().toISOString(), result: result ?? null });
      res.json({ ok: true });
    } catch (err) {
      await stores.decisions.setStatus(d.id, 'failed', { error: String(err.message || err) });
      res.status(502).json({ error: String(err.message || err) });
    }
  });
  r.post('/decisions/:id/reject', async (req, res) => {
    const d = await stores.decisions.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'no existe' });
    await stores.decisions.setStatus(d.id, 'rejected', { rejectedAt: new Date().toISOString() });
    res.json({ ok: true });
  });

  r.get('/config', async (_req, res) => res.json(await configStore.get()));
  r.put('/config', async (req, res) => res.json(await configStore.update(req.body)));

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
        // corrida en background: que el agente evalúe el creativo nuevo sin esperar al cron
        Promise.resolve(runner.runDeep()).catch((err) => console.error('[creatives→run] falló:', err));
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
    Promise.resolve(runner.runDeep()).catch((err) => console.error('[creatives→run] falló:', err));
    res.status(201).json({ id });
  });
  r.get('/creatives', async (_req, res) => res.json(await stores.creatives.list()));

  r.get('/creative-requests', async (_req, res) => res.json(await stores.creativeRequests.listOpen()));
  r.post('/creative-requests/:id/dismiss', async (req, res) => {
    await stores.creativeRequests.dismiss(req.params.id);
    res.json({ ok: true });
  });

  r.post('/agent/run', async (_req, res) => {
    Promise.resolve(runner.runDeep()).catch((err) => console.error('[agent/run] falló:', err));
    res.json({ started: true });
  });

  r.get('/chat', async (_req, res) => res.json(await stores.chatMessages.listRecent(60)));
  r.post('/chat', async (req, res) => {
    const message = (req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'falta message' });
    try {
      const result = await runner.chat(message);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  return r;
}
