import { DEFAULTS } from './defaults.js';

export function createConfigStore(db) {
  const ref = db.collection('config').doc('main');
  let cache = null, cacheAt = 0;
  return {
    async get() {
      if (cache && Date.now() - cacheAt < 60_000) return cache;
      const snap = await ref.get();
      cache = { ...DEFAULTS, ...(snap.exists ? snap.data() : {}) };
      cacheAt = Date.now();
      return cache;
    },
    async update(patch) {
      await ref.set(patch, { merge: true });
      cache = null;
      return this.get();
    },
  };
}
