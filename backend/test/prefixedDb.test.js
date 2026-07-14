import { describe, it, expect } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { prefixedDb } from '../src/store/prefixedDb.js';
import { createDecisionsStore } from '../src/store/decisions.js';

describe('prefixedDb', () => {
  it('todas las colecciones quedan con prefijo gineza_', async () => {
    const raw = createFakeFirestore();
    const store = createDecisionsStore(prefixedDb(raw));
    await store.add({ tool: 'pause_ad', status: 'executed' });
    expect(Object.keys(raw._data)).toEqual(['gineza_decisions']);
  });
});
