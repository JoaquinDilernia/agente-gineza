export function createAgentStateStore(db) {
  const ref = db.collection('agent_state').doc('main');
  return {
    async get() {
      const s = await ref.get();
      return { pendingOrderIds: [], lastSaleRunAt: null, ...(s.exists ? s.data() : {}) };
    },
    async set(patch) { await ref.set(patch, { merge: true }); },
  };
}
