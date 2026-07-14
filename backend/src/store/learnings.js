export function createLearningsStore(db) {
  const col = db.collection('learnings');
  return {
    async upsert({ learning_id, text, evidence, status = 'active' }) {
      if (learning_id) {
        await col.doc(learning_id).set({ text, evidence, status, updatedAt: new Date().toISOString() }, { merge: true });
        return learning_id;
      }
      const ref = await col.add({ text, evidence, status, createdAt: new Date().toISOString() });
      return ref.id;
    },
    async listActive() {
      const s = await col.where('status', '==', 'active').get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async remove(id) { await col.doc(id).delete(); },
  };
}
