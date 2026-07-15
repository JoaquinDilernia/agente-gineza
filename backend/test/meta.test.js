import { describe, it, expect, vi } from 'vitest';
import { createMetaClient } from '../src/services/meta.js';
import { buildAdName } from '../src/engine/naming.js';
import { buildPlacementCreativeSpec } from '../src/engine/creativeSpec.js';

const okJson = (data) => ({ ok: true, status: 200, json: async () => data });

describe('cliente meta', () => {
  it('pauseAd hace POST al ad con status PAUSED', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ success: true }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    await meta.pauseAd('120001');
    const [url, opts] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/v23.0/120001');
    expect(String(url)).toContain('access_token=tok');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ status: 'PAUSED' });
  });
  it('error de Graph API → throw con código y mensaje', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ error: { code: 100, message: 'Invalid parameter' } }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    await expect(meta.getCampaigns()).rejects.toThrow('Meta 100: Invalid parameter');
  });
  it('error con error_user_msg de Meta → se incluye en el mensaje (antes se perdía)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({
      error: { code: 100, message: 'Invalid parameter', error_subcode: 1885183, error_user_msg: 'Falta seleccionar un píxel para este conjunto de anuncios.' },
    }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    await expect(meta.getCampaigns()).rejects.toThrow('Falta seleccionar un píxel');
  });
  it('rate limit (code 17) reintenta una vez', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(okJson({ error: { code: 17, message: 'rate limit' } }))
      .mockResolvedValueOnce(okJson({ data: [] }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn, retryDelayMs: 1 });
    expect(await meta.getCampaigns()).toEqual({ data: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('searchInterests', () => {
  it('pega a /search?type=adinterest sin accountId en el path', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ data: [
      { id: '6003107902433', name: 'Running', audience_size_lower_bound: 1000000, audience_size_upper_bound: 2000000 },
    ] }));
    const meta = createMetaClient({ accessToken: 'tok', accountId: 'act_1', fetchFn });
    const results = await meta.searchInterests('running');
    const [url] = fetchFn.mock.calls[0];
    expect(String(url)).toContain('/v23.0/search');
    expect(String(url)).toContain('type=adinterest');
    expect(String(url)).not.toContain('act_1');
    expect(results).toEqual([
      { id: '6003107902433', name: 'Running', audienceMin: 1000000, audienceMax: 2000000 },
    ]);
  });
});

describe('buildAdName', () => {
  it('formato FUNNEL_TAG_CREATIVO_FECHA, sin acentos', () => {
    expect(buildAdName({ funnel: 'caliente', adsetTag: 'ATC14D', creativeName: 'Bordó', date: new Date('2026-07-14T12:00:00Z') }))
      .toBe('CALIENTE_ATC14D_BORDO_20260714');
  });
});

describe('buildPlacementCreativeSpec', () => {
  const spec = buildPlacementCreativeSpec({
    name: 'X', pageId: 'p1', igActorId: 'ig1', link: 'https://ginezaonline.com/',
    message: 'Tu uniforme', feedImageHash: 'h_feed', storyImageHash: 'h_story',
  });
  it('image_label es objeto {name}, NUNCA string (error #100 de Meta)', () => {
    for (const rule of spec.asset_feed_spec.asset_customization_rules) {
      expect(typeof rule.image_label).toBe('object');
      expect(typeof rule.image_label.name).toBe('string');
    }
  });
  it('enhancements de IA desactivados y optimization PLACEMENT', () => {
    expect(spec.degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status).toBe('OPT_OUT');
    expect(spec.asset_feed_spec.optimization_type).toBe('PLACEMENT');
  });
});
