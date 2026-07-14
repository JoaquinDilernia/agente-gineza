// Cliente de la API del backend. Inyectable para tests (fetchFn, getToken).
export function createApi({ baseUrl, getToken, fetchFn = fetch, onAuthError = () => {} }) {
  async function req(path, { method = 'GET', body, form } = {}) {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (form) {
      payload = form; // FormData: el browser pone el content-type con boundary
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetchFn(`${baseUrl}${path}`, { method, headers, ...(payload ? { body: payload } : {}) });
    if (res.status === 401) {
      onAuthError();
      throw new Error('Sesión expirada');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }
    return res.json();
  }
  return {
    get: (path) => req(path),
    post: (path, body) => req(path, { method: 'POST', body }),
    postForm: (path, form) => req(path, { method: 'POST', form }),
    put: (path, body) => req(path, { method: 'PUT', body }),
    del: (path) => req(path, { method: 'DELETE' }),
  };
}
