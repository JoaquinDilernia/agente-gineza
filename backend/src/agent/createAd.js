import { buildAdName } from '../engine/naming.js';
import { buildPlacementCreativeSpec, buildPlacementVideoCreativeSpec } from '../engine/creativeSpec.js';

export function createAdBuilder({ meta, storage, stores, configStore, pageId, igActorId, linkUrl }) {
  return async function createAdFromCreative({ creative_id, adset_id }) {
    const creative = await stores.creatives.get(creative_id);
    if (!creative) throw new Error(`creativo ${creative_id} no existe`);
    if (creative.status === 'used') throw new Error(`creativo ${creative_id} ya fue usado en el ad ${creative.adId}`);
    const config = await configStore.get();
    const adName = buildAdName({
      funnel: config.funnelByAdset[adset_id] || 'GEN',
      adsetTag: config.adsetTags[adset_id] || 'SINTAG',
      creativeName: creative.name,
    });

    let spec;
    if (creative.mediaType === 'video') {
      // Meta procesa los videos en background después del upload: si todavía no están
      // ready acá, el error es reintentable (cola de aprobación o retryDecision.mjs).
      for (const videoId of [creative.feedVideoId, creative.storyVideoId]) {
        const status = await meta.getVideoStatus(videoId);
        if (status !== 'ready') throw new Error(`video ${videoId} aún procesándose en Meta (status: ${status}), reintentá en unos minutos`);
      }
      const [feedThumbnailUrl, storyThumbnailUrl] = await Promise.all([
        meta.getVideoThumbnail(creative.feedVideoId),
        meta.getVideoThumbnail(creative.storyVideoId),
      ]);
      spec = buildPlacementVideoCreativeSpec({
        name: adName, pageId, igActorId, link: linkUrl, message: creative.copy,
        feedVideoId: creative.feedVideoId, storyVideoId: creative.storyVideoId,
        feedThumbnailUrl, storyThumbnailUrl,
      });
    } else {
      const [feedBuf, storyBuf] = await Promise.all([
        storage.download(creative.feedImagePath),
        storage.download(creative.storyImagePath),
      ]);
      const feedHash = await meta.uploadImage(feedBuf);
      const storyHash = await meta.uploadImage(storyBuf);
      spec = buildPlacementCreativeSpec({
        name: adName, pageId, igActorId, link: linkUrl,
        message: creative.copy, feedImageHash: feedHash, storyImageHash: storyHash,
      });
    }

    const { id: metaCreativeId } = await meta.createCreative(spec);
    const ad = await meta.createAd({ name: adName, adsetId: adset_id, creativeId: metaCreativeId });
    await stores.creatives.markUsed(creative_id, ad.id);
    return { ad_id: ad.id, name: adName };
  };
}
