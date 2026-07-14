import { useState } from 'react';
import { usePolling } from '../hooks/usePolling.js';

const TOOL_LABELS = {
  pause_ad: 'Pausar anuncio',
  create_ad: 'Crear anuncio',
  propose_price_change: 'Cambio de precio',
  propose_budget_change: 'Cambio de presupuesto',
  propose_campaign_structure_change: 'Cambio de estructura',
};

function DecisionCard({ d, api, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/decisions/${d.id}/${action}`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const input = d.input || {};
  const interests = input.payload?.targeting?.flexible_spec?.flatMap((f) => f.interests || []) || [];
  return (
    <div className="card">
      <span className="decision-tool">{TOOL_LABELS[d.tool] || d.tool}</span>
      {input.object_name && <strong> — {input.object_name}</strong>}
      {input.product_name && <strong> — {input.product_name}</strong>}
      {input.current_budget != null && (
        <div className="stat-note">
          ${Number(input.current_budget).toLocaleString('es-AR')} → ${Number(input.proposed_budget).toLocaleString('es-AR')} /día
        </div>
      )}
      {input.current_price != null && (
        <div className="stat-note">
          ${Number(input.current_price).toLocaleString('es-AR')} → ${Number(input.proposed_price).toLocaleString('es-AR')}
        </div>
      )}
      {d.tool === 'propose_campaign_structure_change' && (
        <div className="campaign-test-detail">
          {input.action && <span className="chip pending">{input.action.replace('_', ' ')}</span>}
          {input.payload?.name && <div className="stat-note">Nombre: {input.payload.name}</div>}
          {input.daily_budget_ars != null && (
            <div className="stat-note">Presupuesto: ${Number(input.daily_budget_ars).toLocaleString('es-AR')}/día</div>
          )}
          {interests.length > 0 && (
            <div className="stat-note">Público: {interests.map((i) => i.name).join(', ')}</div>
          )}
          {input.creative_id && <div className="stat-note">✓ Incluye pieza creativa lista para lanzar</div>}
        </div>
      )}
      <p className="decision-reason">{d.reason}</p>
      {d.expectedImpact && <p className="decision-impact">Impacto esperado: {d.expectedImpact}</p>}
      {error && <div className="error-banner">{error}</div>}
      <div className="decision-actions">
        <button disabled={busy} onClick={() => act('approve')}>
          {busy ? '…' : 'Aprobar'}
        </button>
        <button className="danger" disabled={busy} onClick={() => act('reject')}>
          Rechazar
        </button>
      </div>
    </div>
  );
}

export default function Aprobaciones({ api }) {
  const { data, error, loading, reload } = usePolling(() => api.get('/decisions?status=pending'), [api]);

  return (
    <>
      <h1>Aprobaciones</h1>
      <p className="page-sub">Decisiones del agente que esperan tu OK antes de ejecutarse.</p>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty">Cargando…</p>}
      {!loading && data?.length === 0 && <p className="empty">No hay nada pendiente. El agente está al día. ✓</p>}
      {data?.map((d) => (
        <DecisionCard key={d.id} d={d} api={api} onDone={reload} />
      ))}
    </>
  );
}
