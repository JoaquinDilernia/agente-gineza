import express from 'express';
import cors from 'cors';

export function createApp({ webhookRouter, apiRouter, corsOrigin } = {}) {
  const app = express();
  if (corsOrigin) app.use(cors({ origin: corsOrigin }));
  // webhooks van ANTES de express.json(): la verificación HMAC necesita el raw body
  if (webhookRouter) app.use('/webhooks', webhookRouter);
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  if (apiRouter) app.use('/api', ...[].concat(apiRouter));
  return app;
}
