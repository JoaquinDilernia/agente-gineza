// Métricas blended de la cuenta para el dashboard, con cache en memoria (15 min).
const round2 = (n) => Math.round(n * 100) / 100;
const day = (d) => d.toISOString().slice(0, 10);

export function createMetricsService({ meta, configStore, ttlMs = 15 * 60_000 }) {
  let cache = null, cacheAt = 0;
  return {
    async last7d() {
      if (cache && Date.now() - cacheAt < ttlMs) return cache;
      const until = new Date();
      const since = new Date(until.getTime() - 7 * 86400_000);
      const [{ data }, config] = await Promise.all([
        meta.getInsights('account', day(since), day(until)),
        configStore.get(),
      ]);
      let spend = 0, purchases = 0, revenue = 0;
      for (const row of data || []) {
        spend += Number(row.spend || 0);
        purchases += Number((row.actions || []).find((a) => a.action_type === 'purchase')?.value || 0);
        revenue += Number((row.action_values || []).find((a) => a.action_type === 'purchase')?.value || 0);
      }
      const mult = config.metaSurchargeEnabled ? config.metaSurcharge : 1;
      const realSpend = spend * mult;
      cache = {
        windowDays: 7,
        spend: round2(spend),
        realSpend: round2(realSpend),
        purchases,
        revenue: round2(revenue),
        roas: spend > 0 && purchases > 0 ? round2(revenue / spend) : 0,
        realRoas: realSpend > 0 && purchases > 0 ? round2(revenue / realSpend) : 0,
        cpa: purchases > 0 ? round2(spend / purchases) : 0,
        targetRoasFloor: config.targetRoasFloor,
      };
      cacheAt = Date.now();
      return cache;
    },
  };
}
