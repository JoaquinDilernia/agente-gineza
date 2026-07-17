import { useState } from 'react';
import { usePolling } from '../hooks/usePolling.js';

function CreativeRequests({ api }) {
  const { data, error, loading, reload } = usePolling(() => api.get('/creative-requests'), [api]);
  const [busyId, setBusyId] = useState(null);

  async function dismiss(id) {
    setBusyId(id);
    try {
      await api.post(`/creative-requests/${id}/dismiss`);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;
  if (error) return <div className="error-banner">{error}</div>;
  if (!data || data.length === 0) return null;

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}>🎯 Pedidos del agente</div>
      {data.map((r) => (
        <div className="card" key={r.id}>
          <span className={`chip ${r.funnel === 'frio' ? 'pending' : 'unused'}`}>{r.funnel}</span>
          <strong style={{ marginLeft: 8 }}>{r.concept}</strong>
          <p style={{ margin: '8px 0' }}>{r.styleNotes}</p>
          <p className="stat-note" style={{ marginBottom: 10 }}>Por qué: {r.reason}</p>
          <button className="ghost" disabled={busyId === r.id} onClick={() => dismiss(r.id)}>
            {busyId === r.id ? '…' : 'Ya lo subí / descartar'}
          </button>
        </div>
      ))}
    </>
  );
}

export default function Creativos({ api }) {
  const { data, error, loading, reload } = usePolling(() => api.get('/creatives'), [api]);
  const [form, setForm] = useState({ name: '', copy: '', funnel: 'caliente', notes: '' });
  const [mediaType, setMediaType] = useState('image');
  const [feed, setFeed] = useState(null);
  const [story, setStory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append(mediaType === 'video' ? 'feedVideo' : 'feedImage', feed);
      fd.append(mediaType === 'video' ? 'storyVideo' : 'storyImage', story);
      await api.postForm('/creatives', fd);
      setMsg('✓ Creativo subido. El agente lo va a usar cuando detecte una oportunidad.');
      setForm({ name: '', copy: '', funnel: 'caliente', notes: '' });
      setFeed(null);
      setStory(null);
      e.target.reset();
      reload();
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Creativos</h1>
      <p className="page-sub">Subí las piezas y el agente crea los anuncios solo (sin mejoras de IA de Meta, como siempre).</p>

      <CreativeRequests api={api} />

      <form className="card" onSubmit={submit}>
        <div className="form-row">
          <div>
            <label className="field">
              Nombre (para el naming del ad)
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ej: BORDO" />
            </label>
          </div>
          <div>
            <label className="field">
              Funnel recomendado
              <select value={form.funnel} onChange={(e) => setForm({ ...form, funnel: e.target.value })}>
                <option value="caliente">Caliente (remarketing)</option>
                <option value="frio">Frío (prospecting)</option>
                <option value="ambos">Ambos</option>
              </select>
            </label>
          </div>
          <div>
            <label className="field">
              Tipo de pieza
              <select value={mediaType} onChange={(e) => { setMediaType(e.target.value); setFeed(null); setStory(null); }}>
                <option value="image">Imagen</option>
                <option value="video">Video</option>
              </select>
            </label>
          </div>
        </div>
        <label className="field">
          Copy del anuncio
          <textarea required rows={2} value={form.copy} onChange={(e) => setForm({ ...form, copy: e.target.value })} placeholder="ej: Tu nuevo uniforme." />
        </label>
        <label className="field">
          Notas para el agente (contexto, intención)
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ej: campera Magna con 20% OFF, empujar en caliente" />
        </label>
        <div className="form-row">
          <div>
            <label className="field">
              {mediaType === 'video' ? 'Video feed (4:5)' : 'Imagen feed (4:5)'}
              <input key={`feed-${mediaType}`} required type="file" accept={mediaType === 'video' ? 'video/*' : 'image/*'} onChange={(e) => setFeed(e.target.files[0])} />
            </label>
          </div>
          <div>
            <label className="field">
              {mediaType === 'video' ? 'Video story (9:16)' : 'Imagen story (9:16)'}
              <input key={`story-${mediaType}`} required type="file" accept={mediaType === 'video' ? 'video/*' : 'image/*'} onChange={(e) => setStory(e.target.files[0])} />
            </label>
          </div>
        </div>
        {mediaType === 'video' && <p className="hint">Los videos se suben a Meta en este momento: el envío puede tardar un rato según el peso (máx 200MB por video).</p>}
        {msg && <p className={msg.startsWith('Error') ? 'error-banner' : 'hint'}>{msg}</p>}
        <button disabled={busy}>{busy ? 'Subiendo…' : 'Subir creativo'}</button>
      </form>

      <div className="section-title">Subidos</div>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty">Cargando…</p>}
      {!loading && data?.length === 0 && <p className="empty">Nada subido todavía.</p>}
      {data?.length > 0 && (
        <div className="card">
          <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Copy</th><th>Funnel</th><th>Estado</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.mediaType === 'video' ? '🎬 video' : '🖼️ imagen'}</td>
                  <td style={{ maxWidth: 320, color: 'var(--muted)' }}>{c.copy}</td>
                  <td>{c.funnel}</td>
                  <td><span className={`chip ${c.status}`}>{c.status === 'unused' ? 'sin usar' : `usado → ${c.adId}`}</span></td>
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
