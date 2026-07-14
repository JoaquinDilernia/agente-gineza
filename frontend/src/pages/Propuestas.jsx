import { usePolling } from '../hooks/usePolling.js';

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '');

export default function Propuestas({ api }) {
  const proposals = usePolling(() => api.get('/proposals'), [api]);
  const learnings = usePolling(() => api.get('/learnings'), [api]);

  async function removeLearning(id) {
    await api.del(`/learnings/${id}`);
    learnings.reload();
  }

  return (
    <>
      <h1>Propuestas y aprendizajes</h1>
      <p className="page-sub">Ideas del agente y lecciones que aprendió con evidencia.</p>

      <div className="section-title">💡 Propuestas de mejora</div>
      {proposals.data?.length === 0 && <p className="empty">Sin propuestas por ahora.</p>}
      {proposals.data?.map((p) => (
        <div className="card" key={p.id}>
          <strong>{p.title}</strong> <span className="stat-note">{fecha(p.createdAt)}</span>
          <p style={{ marginTop: 6 }}>{p.body}</p>
        </div>
      ))}

      <div className="section-title">📚 Aprendizajes activos</div>
      <p className="hint" style={{ marginBottom: 10 }}>
        Se inyectan en todos los análisis futuros. Si alguno es erróneo, borralo.
      </p>
      {learnings.data?.length === 0 && <p className="empty">Todavía no consolidó lecciones (necesita evidencia repetida).</p>}
      {learnings.data?.map((l) => (
        <div className="card" key={l.id}>
          <p><strong>{l.text}</strong></p>
          <p className="stat-note" style={{ margin: '6px 0 10px' }}>Evidencia: {l.evidence}</p>
          <button className="danger" onClick={() => removeLearning(l.id)}>Borrar lección</button>
        </div>
      ))}
    </>
  );
}
