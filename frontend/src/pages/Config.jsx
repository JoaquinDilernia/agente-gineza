import { useState, useEffect } from 'react';

export default function Config({ api }) {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/config').then(setCfg).catch((e) => setMsg(`Error: ${e.message}`));
  }, [api]);

  async function save(patch) {
    setBusy(true);
    setMsg('');
    try {
      const updated = await api.put('/config', patch);
      setCfg(updated);
      setMsg('✓ Guardado');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <><h1>Config</h1><p className="empty">{msg || 'Cargando…'}</p></>;

  const num = (key, label, step = 'any') => (
    <label className="field" key={key}>
      {label}
      <input
        type="number"
        step={step}
        value={cfg[key]}
        onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <>
      <h1>Config</h1>
      <p className="page-sub">Parámetros del agente. Los cambios aplican en el próximo análisis.</p>

      <div className="card">
        <div className="switch-row">
          <div>
            <strong>Modo autónomo</strong>
            <p>Encendido: el agente pausa y crea anuncios solo. Apagado: TODO queda pendiente de tu aprobación (kill switch).</p>
          </div>
          <div
            className={`switch ${cfg.autonomousMode ? 'on' : ''}`}
            role="switch"
            aria-checked={cfg.autonomousMode}
            onClick={() => save({ autonomousMode: !cfg.autonomousMode })}
          />
        </div>
      </div>

      <div className="card">
        <div className="switch-row" style={{ marginBottom: 16 }}>
          <div>
            <strong>Recargo Meta ×{cfg.metaSurcharge}</strong>
            <p>Impuesto por pagar en pesos. Apagalo el día que migres a dólar app.</p>
          </div>
          <div
            className={`switch ${cfg.metaSurchargeEnabled ? 'on' : ''}`}
            role="switch"
            aria-checked={cfg.metaSurchargeEnabled}
            onClick={() => save({ metaSurchargeEnabled: !cfg.metaSurchargeEnabled })}
          />
        </div>
        <div className="grid cols-2">
          {num('metaSurcharge', 'Multiplicador de recargo', '0.01')}
          {num('taxPct', 'Impuestos (fracción, ej 0.08 = 8%)', '0.01')}
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Comisiones Pago Nube (fracción)</div>
        <div className="grid cols-2">
          <label className="field">
            Transferencia
            <input type="number" step="0.001" value={cfg.paymentFees?.transfer ?? ''} onChange={(e) => setCfg({ ...cfg, paymentFees: { ...cfg.paymentFees, transfer: Number(e.target.value) } })} />
          </label>
          <label className="field">
            Tarjeta 1 cuota
            <input type="number" step="0.001" value={cfg.paymentFees?.card_1 ?? ''} onChange={(e) => setCfg({ ...cfg, paymentFees: { ...cfg.paymentFees, card_1: Number(e.target.value) } })} />
          </label>
          <label className="field">
            Tarjeta 3+ cuotas
            <input type="number" step="0.001" value={cfg.paymentFees?.card_3 ?? ''} onChange={(e) => setCfg({ ...cfg, paymentFees: { ...cfg.paymentFees, card_3: Number(e.target.value) } })} />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Objetivos y límites</div>
        <div className="grid cols-2">
          {num('targetRoasFloor', 'ROAS piso (alerta)')}
          {num('minMinutesBetweenSaleRuns', 'Min. minutos entre análisis por venta')}
          {num('dailyBudgetMinArs', 'Presupuesto diario mínimo (ARS)')}
          {num('dailyBudgetMaxArs', 'Presupuesto diario máximo (ARS)')}
        </div>
      </div>

      {msg && <p className={msg.startsWith('Error') ? 'error-banner' : 'hint'}>{msg}</p>}
      <button disabled={busy} onClick={() => save(cfg)}>
        {busy ? 'Guardando…' : 'Guardar todo'}
      </button>
    </>
  );
}
