export function createStorage(bucket) {
  return {
    async save(path, buffer, contentType) {
      await bucket.file(path).save(buffer, { contentType });
      return path;
    },
    async download(path) {
      const [buf] = await bucket.file(path).download();
      return buf;
    },
  };
}
