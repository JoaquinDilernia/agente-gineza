import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Resumen', icon: '◎' },
  { to: '/ventas', label: 'Ventas', icon: '⬡' },
  { to: '/aprobaciones', label: 'Aprobaciones', icon: '✓', badge: true },
  { to: '/historial', label: 'Historial', icon: '≡' },
  { to: '/creativos', label: 'Creativos', icon: '▣' },
  { to: '/propuestas', label: 'Propuestas', icon: '✦' },
  { to: '/config', label: 'Config', icon: '⚙' },
];

export default function Layout({ api, onLogout, children }) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.get('/decisions?status=pending').then((d) => alive && setPending(d.length)).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    window.addEventListener('focus', load);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', load);
    };
  }, [api]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">GINEZA<span>agent</span></div>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.badge && pending > 0 && <span className="badge">{pending}</span>}
            </NavLink>
          ))}
        </nav>
        <button className="logout" onClick={onLogout}>Salir</button>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
