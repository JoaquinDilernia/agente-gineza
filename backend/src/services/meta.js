const V = 'v23.0';
const RETRYABLE = new Set([17, 32, 613]); // rate limits de Graph API

export function createMetaClient({ accessToken, accountId, fetchFn = fetch, retryDelayMs = 2000 }) {
  const BASE = `https://graph.facebook.com/${V}`;

  async function reqOnce(path, { method = 'GET', params = {}, body, form } = {}) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('access_token', accessToken);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    const res = await fetchFn(url, {
      method,
      // form: multipart (fetch arma el boundary solo, NO setear Content-Type)
      ...(form ? { body: form } : body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const json = await res.json();
    if (json.error) {
      const detail = json.error.error_user_msg || (json.error.error_subcode ? `subcode ${json.error.error_subcode}` : null);
      const err = new Error(`Meta ${json.error.code}: ${json.error.message}${detail ? ` (${detail})` : ''}`);
      err.code = json.error.code;
      err.subcode = json.error.error_subcode;
      throw err;
    }
    return json;
  }

  async function req(path, opts) {
    try {
      return await reqOnce(path, opts);
    } catch (err) {
      if (RETRYABLE.has(err.code)) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        return reqOnce(path, opts);
      }
      throw err;
    }
  }

  const FIELDS = {
    campaign: 'id,name,status,effective_status,daily_budget',
    adset: 'id,name,status,effective_status,daily_budget,campaign_id',
    ad: 'id,name,status,effective_status,adset_id',
    insights: 'campaign_id,adset_id,ad_id,ad_name,spend,purchase_roas,actions,action_values',
  };

  return {
    getCampaigns: () => req(`${accountId}/campaigns`, { params: { fields: FIELDS.campaign, limit: '100' } }),
    getAdsets: () => req(`${accountId}/adsets`, { params: { fields: FIELDS.adset, limit: '200' } }),
    getAds: () => req(`${accountId}/ads`, { params: { fields: FIELDS.ad, limit: '500' } }),
    getInsights: (level, since, until) => req(`${accountId}/insights`, {
      params: { level, fields: FIELDS.insights, time_range: { since, until }, limit: '500' },
    }),
    pauseAd: (adId) => req(adId, { method: 'POST', body: { status: 'PAUSED' } }),
    pauseCampaign: (id) => req(id, { method: 'POST', body: { status: 'PAUSED' } }),
    updateBudget: (objectId, dailyBudgetCents) => req(objectId, { method: 'POST', body: { daily_budget: dailyBudgetCents } }),
    updateAdsetStatus: (id, status) => req(id, { method: 'POST', body: { status } }),
    createAdset: (payload) => req(`${accountId}/adsets`, { method: 'POST', body: payload }),
    createCampaign: (payload) => req(`${accountId}/campaigns`, { method: 'POST', body: payload }),
    async uploadImage(buffer) {
      const json = await req(`${accountId}/adimages`, { method: 'POST', body: { bytes: buffer.toString('base64') } });
      return Object.values(json.images)[0].hash;
    },
    async uploadVideo(buffer, filename = 'video.mp4') {
      const form = new FormData();
      form.append('source', new Blob([buffer], { type: 'video/mp4' }), filename);
      const json = await req(`${accountId}/advideos`, { method: 'POST', form });
      return json.id;
    },
    async getVideoStatus(videoId) {
      const json = await req(videoId, { params: { fields: 'status' } });
      return json.status?.video_status || 'unknown';
    },
    async getVideoThumbnail(videoId) {
      const json = await req(`${videoId}/thumbnails`);
      const thumbs = json.data || [];
      if (thumbs.length === 0) throw new Error(`el video ${videoId} no tiene thumbnails todavía`);
      return (thumbs.find((t) => t.is_preferred) || thumbs[0]).uri;
    },
    createCreative: (spec) => req(`${accountId}/adcreatives`, { method: 'POST', body: spec }),
    async searchInterests(query) {
      // endpoint de búsqueda de segmentación: NO va bajo la cuenta publicitaria
      const json = await req('search', { params: { type: 'adinterest', q: query, limit: '20' } });
      return (json.data || []).map((d) => ({
        id: d.id, name: d.name,
        audienceMin: d.audience_size_lower_bound, audienceMax: d.audience_size_upper_bound,
      }));
    },
    createAd: ({ name, adsetId, creativeId, status = 'ACTIVE' }) =>
      req(`${accountId}/ads`, { method: 'POST', body: { name, adset_id: adsetId, creative: { creative_id: creativeId }, status } }),
  };
}
