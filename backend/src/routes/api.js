import express from 'express';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function createApiRouter({ stores, configStore, executor, storage, runner, metrics }) {
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

  r.post('/creatives', upload.fields([{ name: 'feedImage', maxCount: 1 }, { name: 'storyImage', maxCount: 1 }]), async (req, res) => {
    const feed = req.files?.feedImage?.[0];
    const story = req.files?.storyImage?.[0];
    const { name, copy, funnel, notes } = req.body;
    if (!feed || !story || !name || !copy || !funnel) {
      return res.status(400).json({ error: 'faltan campos: feedImage, storyImage, name, copy, funnel' });
    }
    const ts = Date.now();
    const feedPath = await storage.save(`gineza/creatives/${ts}_feed.jpg`, feed.buffer, feed.mimetype);
    const storyPath = await storage.save(`gineza/creatives/${ts}_story.jpg`, story.buffer, story.mimetype);
    const id = await stores.creatives.add({ name, copy, funnel, notes: notes || '', feedImagePath: feedPath, storyImagePath: storyPath });
    res.status(201).json({ id });
  });
  r.get('/creatives', async (_req, res) => res.json(await stores.creatives.list()));

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
