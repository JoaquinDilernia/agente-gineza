// Arma el payload final de un conjunto/campaña nuevo: el agente da el presupuesto
// en pesos (daily_budget_ars) para que sea legible en el dashboard; acá se convierte
// a centavos (formato que espera Graph API) y se mergea con el resto del payload.
function withBudget(payload, dailyBudgetArs) {
  if (dailyBudgetArs == null) return payload;
  return { ...payload, daily_budget: Math.round(dailyBudgetArs * 100) };
}

export function createDecisionExecutor({ meta, tiendanube, createAdFromCreative }) {
  return async function execute(decision) {
    const { tool, input } = decision;
    switch (tool) {
      case 'pause_ad':
        return meta.pauseAd(input.ad_id);
      case 'create_ad':
        return createAdFromCreative(input);
      case 'propose_price_change':
        return tiendanube.updateVariantPrice(input.product_id, input.variant_id, input.proposed_price);
      case 'propose_budget_change':
        return meta.updateBudget(input.object_id, Math.round(input.proposed_budget * 100));
      case 'propose_campaign_structure_change':
        if (input.action === 'pause_adset') return meta.updateAdsetStatus(input.object_id, 'PAUSED');
        if (input.action === 'pause_campaign') return meta.pauseCampaign(input.object_id);
        if (input.action === 'create_campaign') return meta.createCampaign(withBudget(input.payload, input.daily_budget_ars));
        if (input.action === 'create_adset') {
          const adset = await meta.createAdset(withBudget(input.payload, input.daily_budget_ars));
          // Campaña de prueba completa: público + presupuesto + pieza en UNA sola aprobación.
          if (input.creative_id) {
            const ad = await createAdFromCreative({ creative_id: input.creative_id, adset_id: adset.id });
            return { adset, ad };
          }
          return { adset };
        }
        throw new Error(`acción desconocida: ${input.action}`);
      default:
        throw new Error(`decisión no ejecutable: ${tool}`);
    }
  };
}
