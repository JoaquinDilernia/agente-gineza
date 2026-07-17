// Spec de creative con customización por placement (feed 4:5 / story 9:16).
// Reglas ganadas con sangre en sesiones previas:
//  - image_label DEBE ser objeto {name}, no string (error #100 de Meta si no).
//  - SIN mejoras de IA de Meta: no negociable. standard_enhancements quedó deprecado
//    (17/07/2026) — ahora hay que optar por NO en cada función individual.

// Opt-out explícito de TODAS las funciones de "mejora" de Advantage+ creative.
// Lista verificada contra la API real (act de Gineza, v23.0, 17/07/2026).
const NO_AI_ENHANCEMENTS = {
  creative_features_spec: Object.fromEntries(
    [
      'image_brightness_and_contrast', 'enhance_cta', 'text_optimizations',
      'image_touchups', 'image_uncrop', 'inline_comment', 'adapt_to_placement',
      'media_type_automation', 'product_extensions', 'description_automation',
      'add_text_overlay', 'site_extensions', 'image_animation', 'text_generation',
    ].map((f) => [f, { enroll_status: 'OPT_OUT' }]),
  ),
};
export function buildPlacementCreativeSpec({ name, pageId, igActorId, link, message, feedImageHash, storyImageHash }) {
  return {
    name,
    // instagram_user_id, NO instagram_actor_id: deprecado en Graph API v22+ — Meta lo
    // rechaza con "#100 must be a valid Instagram account id" aunque el ID sea correcto
    // (diagnosticado 17/07/2026 contra la API real).
    object_story_spec: { page_id: pageId, instagram_user_id: igActorId },
    asset_feed_spec: {
      images: [
        { hash: feedImageHash, adlabels: [{ name: 'feed' }] },
        { hash: storyImageHash, adlabels: [{ name: 'story' }] },
      ],
      bodies: [{ text: message }],
      titles: [{ text: name }],
      link_urls: [{ website_url: link }],
      ad_formats: ['SINGLE_IMAGE'],
      call_to_action_types: ['SHOP_NOW'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] },
          image_label: { name: 'feed' },
        },
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story'], instagram_positions: ['story'] },
          image_label: { name: 'story' },
        },
      ],
    },
    degrees_of_freedom_spec: NO_AI_ENHANCEMENTS,
  };
}

// Versión video: mismos placements, video_label en vez de image_label, SINGLE_VIDEO.
// El thumbnail es el que Meta genera solo (el usuario eligió no subir portada).
export function buildPlacementVideoCreativeSpec({ name, pageId, igActorId, link, message, feedVideoId, storyVideoId, feedThumbnailUrl, storyThumbnailUrl }) {
  return {
    name,
    // instagram_user_id, NO instagram_actor_id: deprecado en Graph API v22+ — Meta lo
    // rechaza con "#100 must be a valid Instagram account id" aunque el ID sea correcto
    // (diagnosticado 17/07/2026 contra la API real).
    object_story_spec: { page_id: pageId, instagram_user_id: igActorId },
    asset_feed_spec: {
      videos: [
        { video_id: feedVideoId, thumbnail_url: feedThumbnailUrl, adlabels: [{ name: 'feed' }] },
        { video_id: storyVideoId, thumbnail_url: storyThumbnailUrl, adlabels: [{ name: 'story' }] },
      ],
      bodies: [{ text: message }],
      titles: [{ text: name }],
      link_urls: [{ website_url: link }],
      ad_formats: ['SINGLE_VIDEO'],
      call_to_action_types: ['SHOP_NOW'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] },
          video_label: { name: 'feed' },
        },
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story'], instagram_positions: ['story'] },
          video_label: { name: 'story' },
        },
      ],
    },
    degrees_of_freedom_spec: NO_AI_ENHANCEMENTS,
  };
}
