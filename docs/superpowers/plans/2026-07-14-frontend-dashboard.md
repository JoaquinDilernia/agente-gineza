# Frontend Dashboard Gineza — Implementation Plan

> Ejecución inline en la misma sesión que escribió el plan (contexto completo disponible).

**Goal:** Dashboard React (Vite + JSX + CSS puro) en Hostinger para operar el agente: aprobar/rechazar decisiones, ver ventas con rentabilidad, historial, subir creativos, propuestas/aprendizajes y configuración (incl. kill switch del modo autónomo).

**Stack:** React 18 + Vite, react-router-dom, Firebase JS SDK (solo Auth). Sin framework CSS — CSS propio, tema oscuro. Tests: vitest + @testing-library/react (jsdom) para el cliente de API y el flujo de aprobación (el camino crítico); páginas presentacionales se verifican con build + revisión manual.

## Global Constraints
- Todo en `frontend/`. ESM, JSX, sin TypeScript.
- API backend vía `VITE_API_URL` (Railway). Auth: header `Authorization: Bearer <firebase-id-token>`.
- Un solo usuario (login email/password de Firebase Auth).
- Datos "en vivo": polling cada 30s + refetch al volver el foco (simplificación aceptada de la spec §4 — el realtime por suscripción Firestore directa exigiría security rules en el proyecto compartido; upgrade futuro).
- Deploy: `npm run build` → subir `dist/` a Hostinger. SPA fallback con `.htaccess`.

## Estructura
```
frontend/
  package.json / vite.config.js / index.html / .env.example
  src/
    main.jsx          — bootstrap + router
    App.jsx           — auth gate (login vs layout)
    firebase.js       — init Firebase Auth (config por env vars VITE_FB_*)
    api.js            — createApi(getToken, baseUrl) → get/post/postForm/put/del
    styles.css        — tema completo
    components/Layout.jsx  — sidebar de navegación + badge de pendientes
    components/Login.jsx
    hooks/usePolling.js    — useEffect con intervalo 30s + focus refetch
    pages/Resumen.jsx      — GET /metrics + GET /summary: ROAS real, gasto, ganancia neta, alertas
    pages/Ventas.jsx       — GET /sales: feed, fila expandible con desglose profit
    pages/Aprobaciones.jsx — GET /decisions?status=pending + POST approve/reject
    pages/Historial.jsx    — GET /decisions: filtro por status, razón + outcome
    pages/Creativos.jsx    — POST /creatives (multipart) + GET /creatives
    pages/Propuestas.jsx   — GET /proposals + GET /learnings (+ DELETE learning)
    pages/Config.jsx       — GET/PUT /config: números editables + kill switch destacado
  test/
    api.test.js            — header auth, 401 → onAuthError, postForm sin content-type manual
    aprobaciones.test.jsx  — render pendientes, click aprobar → POST correcto + refresco
```

## Tasks
1. **Backend `GET /api/metrics`** — insights blended últimos 7d a nivel account (spend, compras, revenue, ROAS crudo y ROAS real ×multiplicador) con cache 15 min en memoria. Test con meta mock. Es lo único que falta del lado backend para el Resumen.
2. **Scaffold frontend + api.js con tests** — Vite manual (package.json + vite.config), `api.js` inyectable (`fetchFn`, `getToken`) para testear sin red.
3. **Auth + Layout + estilos** — firebase.js, Login, App con `onAuthStateChanged`, sidebar, styles.css completo.
4. **Aprobaciones con tests** — camino crítico: lista de tarjetas (tool, razón, impacto, números), Aceptar → `POST /decisions/:id/approve`, Rechazar → reject, estados de carga/error, refresco tras acción.
5. **Resumen + Ventas** — métricas y feed con desglose (revenue, costo, comisión, impuestos, pauta est., ganancia; rojo si pérdida).
6. **Historial + Propuestas/Aprendizajes** — tablas con filtros simples; learnings con botón borrar.
7. **Creativos** — form (nombre, copy, funnel select, notas, file feed 4:5, file story 9:16) + lista con estado usado/sin usar.
8. **Config** — inputs numéricos (fees, taxPct, multiplicador+toggle, ROAS piso, presupuestos min/max) + kill switch `autonomousMode` bien visible arriba.
9. **Build + deploy docs** — `.env.example`, `.htaccess`, sección Hostinger en README, `npm run build` verde.

Commit al final de cada task. Suite completa (backend + frontend) verde antes del cierre.
