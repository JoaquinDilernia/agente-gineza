export function createChatMessagesStore(db) {
  const col = db.collection('chat_messages');
  return {
    async add({ role, content }) {
      const doc = { role, content, createdAt: new Date().toISOString() };
      const ref = await col.add(doc);
      return { id: ref.id, ...doc };
    },
    async listRecent(limit = 40) {
      const s = await col.orderBy('createdAt', 'desc').limit(limit).get();
      return s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
    },
  };
}
