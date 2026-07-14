export function createCreativeRequestsStore(db) {
  const col = db.collection('creative_requests');
  return {
    async add({ funnel, concept, styleNotes, reason }) {
      const doc = { funnel, concept, styleNotes, reason, status: 'open', createdAt: new Date().toISOString() };
      const ref = await col.add(doc);
      return { id: ref.id, ...doc };
    },
    async listOpen() {
      const s = await col.where('status', '==', 'open').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async dismiss(id) {
      await col.doc(id).set({ status: 'dismissed', dismissedAt: new Date().toISOString() }, { merge: true });
    },
  };
}
