import { BASE_CONTEXT } from './baseContext.js';
import { breakEvenRoas } from '../engine/profit.js';

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString();
const day = (iso) => iso.slice(0, 10);

export function createContextBuilder({ meta, tiendanube, stores, configStore }) {
  async function metaSnapshot() {
    const [campaigns, adsets, ads, insights] = await Promise.all([
      meta.getCampaigns(), meta.getAdsets(), meta.getAds(),
      meta.getInsights('ad', day(isoDaysAgo(7)), day(new Date().toISOString())),
    ]);
    return { campaigns: campaigns.data, adsets: adsets.data, ads: ads.data, insightsLast7d: insights.data };
  }

  async function productTable(config) {
    const products = await tiendanube.getProducts();
    return products.flatMap((p) => (p.variants || []).map((v) => ({
      productId: p.id,
      name: typeof p.name === 'object' ? (p.name.es ?? Object.values(p.name)[0]) : p.name,
      variantId: v.id,
      price: Number(v.price),
      cost: v.cost != null ? Number(v.cost) : null,
      breakEvenRoas: v.cost != null ? breakEvenRoas({ price: Number(v.price), cost: Number(v.cost) }, config) : 'SIN COSTO CARGADO',
    })));
  }

  return {
    async build(kind, extra = {}) {
      const config = await configStore.get();
      const sections = {
        kind,
        config,
        ...(await metaSnapshot()),
        activeLearnings: await stores.learnings.listActive(),
        recentDecisions: await stores.decisions.listRecent(30),
        unusedCreatives: await stores.creatives.listUnused(),
        ...extra,
      };
      if (kind === 'deep') {
        sections.products = await productTable(config);
        sections.recentSales = await stores.sales.listRecent(50);
      }
      if (kind === 'retrospective') {
        sections.decisionsToEvaluate = await stores.decisions.listExecutedWithoutOutcome(isoDaysAgo(2));
      }
      const body = Object.entries(sections)
        .map(([k, v]) => `## ${k}\n${JSON.stringify(v, null, 1)}`)
        .join('\n\n');
      return `${BASE_CONTEXT}\n\n---\n\n${body}`;
    },
  };
}
