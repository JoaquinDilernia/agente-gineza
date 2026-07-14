// Prefija todas las colecciones de Firestore (el proyecto Firebase es compartido
// con otras apps del usuario — ej. "decisions" pasa a ser "gineza_decisions").
export function prefixedDb(db, prefix = 'gineza_') {
  return { collection: (name) => db.collection(`${prefix}${name}`) };
}
