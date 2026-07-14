export function createDecisionsStore(db) {
  const col = db.collection('decisions');
  return {
    async add(d) {
      const doc = { createdAt: new Date().toISOString(), ...d };
      const ref = await col.add(doc);
      return { id: ref.id, ...doc };
    },
    async setStatus(id, status, extra = {}) { await col.doc(id).set({ status, ...extra }, { merge: true }); },
    async get(id) { const s = await col.doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null; },
    async listPending() {
      const s = await col.where('status', '==', 'pending').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async listRecent(limit = 50) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async listExecutedWithoutOutcome(olderThanIso) {
      const s = await col.where('status', '==', 'executed').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => !x.outcome && x.createdAt < olderThanIso);
    },
  };
}
