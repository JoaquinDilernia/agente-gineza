import { useState } from 'react';
import { usePolling } from '../hooks/usePolling.js';

const ars = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
const fecha = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function SaleRow({ s }) {
  const [open, setOpen] = useState(false);
  const p = s.profit || {};
  return (
    <>
      <tr className="sale-row" onClick={() => setOpen(!open)}>
        <td>{fecha(s.createdAt)}</td>
        <td className="num">#{s.orderId}</td>
        <td className="num">{ars(p.revenue)}</td>
        <td className={`num ${p.profit >= 0 ? 'pos' : 'neg'}`}>{ars(p.profit)}</td>
        <td>{s.missingCosts?.length ? <span className="chip failed">sin costo</span> : ''}</td>
      </tr>
      {open && (
        <tr className="sale-detail">
          <td colSpan={5}>
            <div className="sale-detail-grid">
              <div><span className="lbl">Productos</span>{ars(p.revenue)}</div>
              <div><span className="lbl">Costo prod.</span>−{ars(p.productsCost)}</div>
              <div><span className="lbl">Comisión</span>−{ars(p.paymentFee)}</div>
              <div><span className="lbl">Impuestos</span>−{ars(p.taxes)}</div>
              <div><span className="lbl">Pauta est. (×1.3)</span>−{ars(p.adCost)}</div>
              <div><span className="lbl">Ganancia</span><span className={p.profit >= 0 ? 'pos' : 'neg'}>{ars(p.profit)}</span></div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Ventas({ api }) {
  const { data, error, loading } = usePolling(() => api.get('/sales'), [api]);

  return (
    <>
      <h1>Ventas</h1>
      <p className="page-sub">Cada venta con su ganancia neta real. Click en una fila para el desglose.</p>
      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="empty">Cargando…</p>}
      {!loading && data?.length === 0 && (
        <p className="empty">Todavía no entraron ventas por el webhook. Cuando entre la primera, aparece acá sola.</p>
      )}
      {data?.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th className="num">Orden</th><th className="num">Venta</th><th className="num">Ganancia</th><th></th></tr>
              </thead>
              <tbody>
                {data.map((s) => <SaleRow key={s.id} s={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
