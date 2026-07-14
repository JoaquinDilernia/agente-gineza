import { buildAdName } from '../engine/naming.js';
import { buildPlacementCreativeSpec } from '../engine/creativeSpec.js';

export function createAdBuilder({ meta, storage, stores, configStore, pageId, igActorId, linkUrl }) {
  return async function createAdFromCreative({ creative_id, adset_id }) {
    const creative = await stores.creatives.get(creative_id);
    if (!creative) throw new Error(`creativo ${creative_id} no existe`);
    if (creative.status === 'used') throw new Error(`creativo ${creative_id} ya fue usado en el ad ${creative.adId}`);
    const config = await configStore.get();
    const [feedBuf, storyBuf] = await Promise.all([
      storage.download(creative.feedImagePath),
      storage.download(creative.storyImagePath),
    ]);
    const feedHash = await meta.uploadImage(feedBuf);
    const storyHash = await meta.uploadImage(storyBuf);
    const adName = buildAdName({
      funnel: config.funnelByAdset[adset_id] || 'GEN',
      adsetTag: config.adsetTags[adset_id] || 'SINTAG',
      creativeName: creative.name,
    });
    const spec = buildPlacementCreativeSpec({
      name: adName, pageId, igActorId, link: linkUrl,
      message: creative.copy, feedImageHash: feedHash, storyImageHash: storyHash,
    });
    const { id: metaCreativeId } = await meta.createCreative(spec);
    const ad = await meta.createAd({ name: adName, adsetId: adset_id, creativeId: metaCreativeId });
    await stores.creatives.markUsed(creative_id, ad.id);
    return { ad_id: ad.id, name: adName };
  };
}
