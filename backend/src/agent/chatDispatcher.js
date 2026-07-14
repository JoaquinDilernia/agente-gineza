// Dispatcher para el chat interactivo: TODO ejecuta directo, nada queda pending.
// El usuario está pidiendo la acción en vivo — eso ES la aprobación, a diferencia
// del dispatcher del análisis autónomo (dispatcher.js) donde propose_* siempre encola.
export function createChatToolDispatcher({ meta, tiendanube, stores, createAdFromCreative }) {
  return async function dispatch(name, input) {
    const base = { tool: name, input, reason: input.reason ?? null, source: 'chat' };
    try {
      let result;
      switch (name) {
        case 'pause_ad':
          await meta.pauseAd(input.ad_id);
          result = { ok: true, paused: input.ad_id };
          break;
        case 'create_ad': {
          const ad = await createAdFromCreative(input);
          result = { ok: true, ...ad };
          break;
        }
        case 'propose_price_change':
          await tiendanube.updateVariantPrice(input.product_id, input.variant_id, input.proposed_price);
          result = { ok: true };
          break;
        case 'propose_budget_change':
          await meta.updateBudget(input.object_id, Math.round(input.proposed_budget * 100));
          result = { ok: true };
          break;
        case 'propose_campaign_structure_change':
          if (input.action === 'pause_adset') await meta.updateAdsetStatus(input.object_id, 'PAUSED');
          else if (input.action === 'pause_campaign') await meta.pauseCampaign(input.object_id);
          else if (input.action === 'create_adset') await meta.createAdset(input.payload);
          else if (input.action === 'create_campaign') await meta.createCampaign(input.payload);
          else return { error: `acción desconocida: ${input.action}` };
          result = { ok: true };
          break;
        case 'log_improvement_proposal':
          await stores.proposals.add({ title: input.title, body: input.body });
          return { ok: true };
        case 'save_learning': {
          const id = await stores.learnings.upsert(input);
          return { ok: true, learning_id: id };
        }
        case 'record_outcome':
          await stores.decisions.setStatus(input.decision_id, 'executed', { outcome: input.outcome, outcomeAt: new Date().toISOString() });
          return { ok: true };
        default:
          return { error: `tool desconocida: ${name}` };
      }
      await stores.decisions.add({ ...base, status: 'executed', result });
      return result;
    } catch (err) {
      await stores.decisions.add({ ...base, status: 'failed', error: String(err.message || err) });
      return { error: String(err.message || err) };
    }
  };
}
