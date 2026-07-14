const PROPOSALS = new Set(['propose_price_change', 'propose_budget_change', 'propose_campaign_structure_change']);

export function createToolDispatcher({ meta, stores, configStore, createAdFromCreative }) {
  return async function dispatch(name, input) {
    const base = { tool: name, input, reason: input.reason ?? null, expectedImpact: input.expected_impact ?? null };
    try {
      if (name === 'pause_ad' || name === 'create_ad') {
        const config = await configStore.get();
        if (!config.autonomousMode) {
          const d = await stores.decisions.add({ ...base, status: 'pending', note: 'modo autónomo apagado' });
          return { queued: true, decision_id: d.id, note: 'modo autónomo apagado: quedó pendiente de aprobación' };
        }
        if (name === 'pause_ad') {
          await meta.pauseAd(input.ad_id);
          await stores.decisions.add({ ...base, status: 'executed' });
          return { ok: true, paused: input.ad_id };
        }
        const ad = await createAdFromCreative(input);
        await stores.decisions.add({ ...base, status: 'executed', result: ad });
        return { ok: true, ...ad };
      }
      if (PROPOSALS.has(name)) {
        const d = await stores.decisions.add({ ...base, status: 'pending' });
        return { queued: true, decision_id: d.id };
      }
      if (name === 'log_improvement_proposal') {
        await stores.proposals.add({ title: input.title, body: input.body });
        return { ok: true };
      }
      if (name === 'save_learning') {
        const id = await stores.learnings.upsert(input);
        return { ok: true, learning_id: id };
      }
      if (name === 'record_outcome') {
        await stores.decisions.setStatus(input.decision_id, 'executed', { outcome: input.outcome, outcomeAt: new Date().toISOString() });
        return { ok: true };
      }
      return { error: `tool desconocida: ${name}` };
    } catch (err) {
      await stores.decisions.add({ ...base, status: 'failed', error: String(err.message || err) });
      return { error: String(err.message || err) };
    }
  };
}
