export function createSalesStore(db) {
  const col = db.collection('sales');
  return {
    async addIfNew(orderId, sale) {
      try {
        await col.doc(String(orderId)).create({ ...sale, orderId: String(orderId), createdAt: new Date().toISOString() });
        return true;
      } catch (e) {
        if (e.code === 6 || /ALREADY_EXISTS/i.test(String(e.message))) return false;
        throw e;
      }
    },
    async listRecent(limit = 100) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}
