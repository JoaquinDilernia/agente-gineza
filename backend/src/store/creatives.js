export function createCreativesStore(db) {
  const col = db.collection('creatives');
  return {
    async add(c) {
      const ref = await col.add({ status: 'unused', createdAt: new Date().toISOString(), ...c });
      return ref.id;
    },
    async get(id) { const s = await col.doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null; },
    async listUnused() {
      const s = await col.where('status', '==', 'unused').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async list(limit = 100) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async markUsed(id, adId) {
      await col.doc(id).set({ status: 'used', adId, usedAt: new Date().toISOString() }, { merge: true });
    },
  };
}
