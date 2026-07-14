export function createProposalsStore(db) {
  const col = db.collection('proposals');
  return {
    async add({ title, body }) {
      const ref = await col.add({ title, body, createdAt: new Date().toISOString() });
      return ref.id;
    },
    async list(limit = 50) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}
