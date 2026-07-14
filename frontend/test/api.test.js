import { describe, it, expect, vi } from 'vitest';
import { createApi } from '../src/api.js';

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

describe('api client', () => {
  it('manda Authorization Bearer con el token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const api = createApi({ baseUrl: 'http://x', getToken: async () => 'tok123', fetchFn });
    await api.get('/summary');
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('http://x/summary');
    expect(opts.headers.Authorization).toBe('Bearer tok123');
  });
  it('401 dispara onAuthError y lanza', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const onAuthError = vi.fn();
    const api = createApi({ baseUrl: 'http://x', getToken: async () => 't', fetchFn, onAuthError });
    await expect(api.get('/summary')).rejects.toThrow(/expirada/);
    expect(onAuthError).toHaveBeenCalled();
  });
  it('error del backend expone el mensaje', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'Meta 100: bad' }) });
    const api = createApi({ baseUrl: 'http://x', getToken: async () => 't', fetchFn });
    await expect(api.post('/decisions/1/approve')).rejects.toThrow('Meta 100: bad');
  });
  it('postForm NO fija Content-Type manual (el browser pone el boundary)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ id: '1' }));
    const api = createApi({ baseUrl: 'http://x', getToken: async () => 't', fetchFn });
    const form = new FormData();
    form.append('name', 'BORDO');
    await api.postForm('/creatives', form);
    const [, opts] = fetchFn.mock.calls[0];
    expect(opts.headers['Content-Type']).toBeUndefined();
    expect(opts.body).toBe(form);
  });
});
