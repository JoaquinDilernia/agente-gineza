import { usePolling } from '../hooks/usePolling.js';

const ars = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

export default function Resumen({ api }) {
  const metrics = usePolling(() => api.get('/metrics'), [api]);
  const summary = usePolling(() => api.get('/summary'), [api]);

  const m = metrics.data;
  const sales = summary.data?.sales || [];
  const profit7d = sales
    .filter((s) => Date.now() - new Date(s.createdAt).getTime() < 7 * 86400_000)
    .reduce((acc, s) => acc + (s.profit?.profit || 0), 0);
  const losing = sales.filter((s) => (s.profit?.profit ?? 0) < 0).length;

  return (
    <>
      <h1>Resumen</h1>
      <p className="page-sub">Últimos 7 días — con costo real de Meta (recargo incluido).</p>
      {metrics.error && <div className="error-banner">Meta: {metrics.error}</div>}
      <div className="grid cols-4">
        <div className="card">
          <div className="stat-label">ROAS real</div>
          <div className={`stat-value ${m ? (m.realRoas >= m.targetRoasFloor ? 'ok' : 'warn') : ''}`}>
            {m ? `${m.realRoas}x` : '—'}
          </div>
          <div className="stat-note">{m ? `crudo ${m.roas}x · piso ${m.targetRoasFloor}x` : ''}</div>
        </div>
        <div className="card">
          <div className="stat-label">Gasto real</div>
          <div className="stat-value">{m ? ars(m.realSpend) : '—'}</div>
          <div className="stat-note">{m ? `Meta reporta ${ars(m.spend)}` : ''}</div>
        </div>
        <div className="card">
          <div className="stat-label">Compras (Meta)</div>
          <div className="stat-value">{m ? m.purchases : '—'}</div>
          <div className="stat-note">{m ? `CPA ${ars(m.cpa)}` : ''}</div>
        </div>
        <div className="card">
          <div className="stat-label">Ganancia neta 7d</div>
          <div className={`stat-value ${profit7d >= 0 ? 'ok' : 'bad'}`}>{ars(profit7d)}</div>
          <div className="stat-note">de {sales.length} ventas registradas</div>
        </div>
      </div>
      {losing > 0 && (
        <div className="error-banner" style={{ marginTop: 14 }}>
          ⚠ {losing} venta{losing > 1 ? 's' : ''} con pérdida neta — revisá el detalle en Ventas.
        </div>
      )}
      {summary.data?.pendingCount > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <strong>{summary.data.pendingCount} decisiones esperan tu aprobación</strong>
          <p className="stat-note">Entrá a Aprobaciones para revisarlas.</p>
        </div>
      )}
    </>
  );
}
