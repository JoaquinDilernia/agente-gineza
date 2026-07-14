export function createStorage(bucket) {
  const ensure = () => {
    if (!bucket) throw new Error('FIREBASE_STORAGE_BUCKET no configurado — no se pueden guardar/leer creativos');
    return bucket;
  };
  return {
    async save(path, buffer, contentType) {
      await ensure().file(path).save(buffer, { contentType });
      return path;
    },
    async download(path) {
      const [buf] = await ensure().file(path).download();
      return buf;
    },
  };
}
