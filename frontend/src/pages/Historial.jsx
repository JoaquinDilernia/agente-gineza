import { useState } from 'react';
import { usePolling } from '../hooks/usePolling.js';

const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function Historial({ api }) {
  const [filter, setFilter] = useState('todas');
  const { data, error, loading } = usePolling(() => api.get('/decisions'), [api]);

  const rows = (data || []).filter((d) => filter === 'todas' || d.status === filter);

  return (
    <>
      <h1>Historial</h1>
      <p className="page-sub">Todo lo que el agente hizo o propuso — con y sin permiso.</p>
      <div style={{ maxWidth: 220, marginBottom: 14 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="todas">Todas</option>
          <option value="executed">Ejecutadas</option>
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobadas</option>
          <option value="rejected">Rechazadas</option>
          <option value="failed">Fallidas</option>
        </select>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty">Cargando…</p>}
      {!loading && rows.length === 0 && <p className="empty">Sin decisiones {filter !== 'todas' ? `en estado "${filter}"` : 'todavía'}.</p>}
      {rows.length > 0 && (
        <div className="card">
          <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Acción</th><th>Razón</th><th>Estado</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fecha(d.createdAt)}</td>
                  <td><span className="decision-tool">{d.tool}</span></td>
                  <td style={{ maxWidth: 420 }}>{d.reason || '—'}</td>
                  <td><span className={`chip ${d.status}`}>{d.status}</span></td>
                  <td style={{ maxWidth: 260, color: 'var(--muted)' }}>{d.outcome || d.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </>
  );
}
