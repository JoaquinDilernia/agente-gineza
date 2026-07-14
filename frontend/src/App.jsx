import { useState, useMemo, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { createApi } from './api.js';
import Login from './components/Login.jsx';
import Layout from './components/Layout.jsx';
import Resumen from './pages/Resumen.jsx';
import Ventas from './pages/Ventas.jsx';
import Aprobaciones from './pages/Aprobaciones.jsx';
import Historial from './pages/Historial.jsx';
import Creativos from './pages/Creativos.jsx';
import Propuestas from './pages/Propuestas.jsx';
import Config from './pages/Config.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function App() {
  const [password, setPassword] = useState(() => localStorage.getItem('gineza_pw') || '');

  const logout = useCallback(() => {
    localStorage.removeItem('gineza_pw');
    setPassword('');
  }, []);

  const api = useMemo(() => {
    if (!password) return null;
    return createApi({ baseUrl: API_URL, getToken: async () => password, onAuthError: logout });
  }, [password, logout]);

  if (!api) {
    return (
      <Login
        onLogin={(pw) => {
          localStorage.setItem('gineza_pw', pw);
          setPassword(pw);
        }}
        apiUrl={API_URL}
      />
    );
  }

  return (
    <Layout api={api} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Resumen api={api} />} />
        <Route path="/ventas" element={<Ventas api={api} />} />
        <Route path="/aprobaciones" element={<Aprobaciones api={api} />} />
        <Route path="/historial" element={<Historial api={api} />} />
        <Route path="/creativos" element={<Creativos api={api} />} />
        <Route path="/propuestas" element={<Propuestas api={api} />} />
        <Route path="/config" element={<Config api={api} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
