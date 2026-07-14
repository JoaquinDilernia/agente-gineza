// Fake mínimo de Firestore para tests. Solo la sub-API que usa el backend.
export function createFakeFirestore() {
  const data = {}; // { colName: { docId: {...} } }
  function collection(name) {
    data[name] ||= {};
    let autoInc = 0;
    return {
      doc(id = `auto_${++autoInc}_${Date.now()}`) {
        return {
          id,
          async get() { const d = data[name][id]; return { exists: !!d, id, data: () => d }; },
          async set(v, opts) { data[name][id] = opts?.merge ? { ...data[name][id], ...v } : { ...v }; },
          async create(v) {
            if (data[name][id]) { const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; }
            data[name][id] = { ...v };
          },
          async update(v) { data[name][id] = { ...data[name][id], ...v }; },
          async delete() { delete data[name][id]; },
        };
      },
      async add(v) { const id = `auto_${Object.keys(data[name]).length + 1}`; data[name][id] = { ...v }; return { id }; },
      where(f, _op, v) {
        const filters = [[f, v]];
        const q = {
          where(f2, _o2, v2) { filters.push([f2, v2]); return q; },
          async get() {
            const docs = Object.entries(data[name])
              .filter(([, d]) => filters.every(([ff, vv]) => d[ff] === vv))
              .map(([id, d]) => ({ id, data: () => d }));
            return { docs };
          },
        };
        return q;
      },
      orderBy(field, dir = 'asc') {
        return {
          limit(n) {
            return {
              async get() {
                const docs = Object.entries(data[name]).map(([id, d]) => ({ id, data: () => d }))
                  .sort((a, b) => {
                    const cmp = a.data()[field] < b.data()[field] ? -1 : 1;
                    return dir === 'desc' ? -cmp : cmp;
                  })
                  .slice(0, n);
                return { docs };
              },
            };
          },
        };
      },
    };
  }
  return { collection, _data: data };
}
