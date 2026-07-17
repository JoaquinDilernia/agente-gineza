import { useState, useEffect, useRef } from 'react';

// Crea productos en Tienda Nube conversando con el agente por el MISMO pipeline
// del chat: el form arma el pedido estructurado, la recomendación de precio y
// descripción llega como respuesta, y la confirmación sigue en la conversación.
export default function Productos({ api }) {
  const [form, setForm] = useState({ name: '', cost: '', sizes: '', info: '' });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text) {
    setError('');
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: text }]);
    setSending(true);
    try {
      const { reply } = await api.post('/chat', { message: text });
      setMessages((m) => [...m, { id: `tmp-r-${Date.now()}`, role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function submitForm(e) {
    e.preventDefault();
    if (sending) return;
    const text = [
      'Quiero crear un producto nuevo en Tienda Nube (oculto):',
      `- Nombre: ${form.name}`,
      `- Costo: $${form.cost}`,
      `- Talles: ${form.sizes}`,
      `- Info: ${form.info || '(sin info extra)'}`,
      'Recomendame precio (teniendo en cuenta el 15% de descuento por transferencia) y una descripción calcando el estilo de nuestros productos existentes (ej. Magna). Mostrame la cuenta y esperá mi confirmación antes de crearlo.',
    ].join('\n');
    send(text);
  }

  function submitFollowUp(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    send(text);
  }

  return (
    <div className="chat-page">
      <h1>Productos</h1>
      <p className="page-sub">Pasale nombre, costo y talles: el agente te recomienda precio (con el descuento por transferencia ya contemplado) y escribe la descripción. Lo crea oculto — las fotos y publicarlo quedan de tu lado en TN.</p>

      <form className="card" onSubmit={submitForm}>
        <div className="form-row">
          <div>
            <label className="field">
              Nombre del producto
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ej: Calza Lumen" />
            </label>
          </div>
          <div>
            <label className="field">
              Costo (ARS)
              <input required type="number" min="1" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="ej: 18000" />
            </label>
          </div>
          <div>
            <label className="field">
              Talles
              <input required value={form.sizes} onChange={(e) => setForm({ ...form, sizes: e.target.value })} placeholder="ej: S, M, L, XL" />
            </label>
          </div>
        </div>
        <label className="field">
          Info para la descripción (telas, calce, detalles)
          <textarea rows={2} value={form.info} onChange={(e) => setForm({ ...form, info: e.target.value })} placeholder="ej: calza tiro alto, tela suplex, no se transparenta" />
        </label>
        <button disabled={sending}>{sending && messages.length === 0 ? 'Consultando…' : 'Pedir recomendación'}</button>
      </form>

      {(messages.length > 0 || sending) && (
        <div className="chat-window">
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {sending && <div className="chat-bubble assistant chat-thinking">Pensando…</div>}
          <div ref={bottomRef} />
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
      {messages.length > 0 && (
        <form className="chat-input-row" onSubmit={submitFollowUp}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Respondé acá — ej. "dale, crealo" o pedí ajustes'
            disabled={sending}
          />
          <button disabled={sending || !input.trim()}>Enviar</button>
        </form>
      )}
    </div>
  );
}
