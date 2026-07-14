import { useState, useEffect, useRef } from 'react';

export default function Chat({ api }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/chat').then(setMessages).catch((e) => setError(e.message));
  }, [api]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
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

  return (
    <div className="chat-page">
      <h1>Chat con el agente</h1>
      <p className="page-sub">Preguntale lo que quieras de la cuenta, o pedile una acción directo — la ejecuta al toque.</p>
      <div className="chat-window">
        {messages.length === 0 && (
          <p className="empty">
            Empezá la charla — ej. "¿por qué bajó el ROAS esta semana?" o "pausá el anuncio X".
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="chat-bubble assistant chat-thinking">Pensando…</div>}
        <div ref={bottomRef} />
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="chat-input-row" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí tu pregunta o pedido…"
          disabled={sending}
        />
        <button disabled={sending || !input.trim()}>Enviar</button>
      </form>
    </div>
  );
}
