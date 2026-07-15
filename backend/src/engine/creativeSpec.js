// Spec de creative con customización por placement (feed 4:5 / story 9:16).
// Reglas ganadas con sangre en sesiones previas:
//  - image_label DEBE ser objeto {name}, no string (error #100 de Meta si no).
//  - standard_enhancements OPT_OUT: el usuario no quiere mejoras de IA. No negociable.
export function buildPlacementCreativeSpec({ name, pageId, igActorId, link, message, feedImageHash, storyImageHash }) {
  return {
    name,
    object_story_spec: { page_id: pageId, instagram_actor_id: igActorId },
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
    degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
  };
}

// Versión video: mismos placements, video_label en vez de image_label, SINGLE_VIDEO.
// El thumbnail es el que Meta genera solo (el usuario eligió no subir portada).
export function buildPlacementVideoCreativeSpec({ name, pageId, igActorId, link, message, feedVideoId, storyVideoId, feedThumbnailUrl, storyThumbnailUrl }) {
  return {
    name,
    object_story_spec: { page_id: pageId, instagram_actor_id: igActorId },
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
    degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
  };
}
