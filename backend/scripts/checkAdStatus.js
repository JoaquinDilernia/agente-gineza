// Verificación puntual: ¿los ads pausados por el agente realmente quedaron PAUSED en Meta?
import 'dotenv/config';
import fs from 'fs';
import { createMetaClient } from '../src/services/meta.js';

const ids = process.argv.slice(2);
const meta = createMetaClient({ accessToken: process.env.META_ACCESS_TOKEN, accountId: process.env.META_ACCOUNT_ID });
const { data } = await meta.getAds();
for (const id of ids) {
  const ad = data.find((a) => a.id === id);
  console.log(id, '->', ad ? `${ad.name} | status=${ad.status} effective=${ad.effective_status}` : 'NO ENCONTRADO EN LA CUENTA');
}
