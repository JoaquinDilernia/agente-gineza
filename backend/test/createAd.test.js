import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdBuilder } from '../src/agent/createAd.js';

let meta, storage, stores, configStore, create, creativeDoc;

beforeEach(() => {
  creativeDoc = null;
  meta = {
    uploadImage: vi.fn().mockResolvedValueOnce('hash_feed').mockResolvedValueOnce('hash_story'),
    getVideoStatus: vi.fn().mockResolvedValue('ready'),
    getVideoThumbnail: vi.fn().mockResolvedValueOnce('https://cdn/f.jpg').mockResolvedValueOnce('https://cdn/s.jpg'),
    createCreative: vi.fn().mockResolvedValue({ id: 'metacr_1' }),
    createAd: vi.fn().mockResolvedValue({ id: 'ad_1' }),
  };
  storage = { download: vi.fn().mockResolvedValue(Buffer.from('img')) };
  stores = { creatives: { get: vi.fn(async () => creativeDoc), markUsed: vi.fn() } };
  configStore = { get: vi.fn().mockResolvedValue({ funnelByAdset: {}, adsetTags: {} }) };
  create = createAdBuilder({ meta, storage, stores, configStore, pageId: 'pg1', igActorId: 'ig1', linkUrl: 'https://ginezaonline.com/' });
});

describe('createAdFromCreative — imagen', () => {
  it('sube imágenes y crea creative SINGLE_IMAGE (flujo actual intacto)', async () => {
    creativeDoc = { id: 'cr1', name: 'BORDO', copy: 'c', status: 'unused', feedImagePath: 'p1', storyImagePath: 'p2' };
    const out = await create({ creative_id: 'cr1', adset_id: 'as1' });
    expect(meta.uploadImage).toHaveBeenCalledTimes(2);
    expect(meta.createCreative.mock.calls[0][0].asset_feed_spec.ad_formats).toEqual(['SINGLE_IMAGE']);
    expect(stores.creatives.markUsed).toHaveBeenCalledWith('cr1', 'ad_1');
    expect(out.ad_id).toBe('ad_1');
  });
});

describe('createAdFromCreative — video', () => {
  const videoDoc = { id: 'cr2', name: 'REEL1', copy: 'c', status: 'unused', mediaType: 'video', feedVideoId: 'vf', storyVideoId: 'vs' };
  it('verifica status, usa thumbnails de Meta y crea creative SINGLE_VIDEO', async () => {
    creativeDoc = videoDoc;
    const out = await create({ creative_id: 'cr2', adset_id: 'as1' });
    expect(meta.getVideoStatus).toHaveBeenCalledWith('vf');
    expect(meta.getVideoStatus).toHaveBeenCalledWith('vs');
    const spec = meta.createCreative.mock.calls[0][0];
    expect(spec.asset_feed_spec.ad_formats).toEqual(['SINGLE_VIDEO']);
    expect(spec.asset_feed_spec.videos[0]).toMatchObject({ video_id: 'vf', thumbnail_url: 'https://cdn/f.jpg' });
    expect(storage.download).not.toHaveBeenCalled();
    expect(out.ad_id).toBe('ad_1');
  });
  it('video aún procesándose → error reintentable y NO marca used', async () => {
    creativeDoc = videoDoc;
    meta.getVideoStatus.mockResolvedValue('processing');
    await expect(create({ creative_id: 'cr2', adset_id: 'as1' })).rejects.toThrow('procesándose');
    expect(meta.createCreative).not.toHaveBeenCalled();
    expect(stores.creatives.markUsed).not.toHaveBeenCalled();
  });
});
