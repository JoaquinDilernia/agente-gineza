# Gineza Agent — Agente autónomo de optimización e-commerce

Backend Node/Express (Railway) + Dashboard React (Hostinger) + Firebase.
Spec completa: `docs/superpowers/specs/2026-07-14-gineza-autonomous-agent-design.md`.

## Setup de credenciales (una sola vez)

### 1. Meta — System User token
En business.facebook.com > Configuración del negocio > Usuarios > Usuarios del sistema:
1. Usar el system user existente o crear uno nuevo "gineza-agent" (NO tocar el token del bot de WhatsApp).
2. Asignar activos: cuenta publicitaria act_33890648080578737, página Gineza (104448066033431), píxel 659564062266866 y el catálogo de Tiendanube.
3. Generar token con scopes: ads_read, ads_management, business_management, pages_read_engagement, pages_show_list, catalog_management.
4. Guardarlo como META_ACCESS_TOKEN.

### 2. Tienda Nube — app interna
Panel de la tienda > Configuración > API: crear app interna, darle permisos de
lectura de órdenes/productos y escritura de productos y webhooks.
Guardar TIENDANUBE_STORE_ID, TIENDANUBE_TOKEN y el client secret como TIENDANUBE_WEBHOOK_SECRET.

### 3. Firebase
1. Crear proyecto en console.firebase.google.com con Firestore + Storage + Authentication (Email/Password).
2. Crear el usuario del dashboard (jdilernia99@gmail.com) en Authentication.
3. Descargar service account (Configuración > Cuentas de servicio) y pegar el JSON
   en una línea como FIREBASE_SERVICE_ACCOUNT. Bucket en FIREBASE_STORAGE_BUCKET.

### 4. Anthropic
API key de console.anthropic.com como ANTHROPIC_API_KEY.

## Deploy backend (Railway)
1. Conectar este repo en Railway; railway.json ya define build y start.
2. Cargar TODAS las env vars de backend/.env.example.
3. Verificar https://<railway-url>/health → {"ok":true}.
4. Registrar webhooks: `cd backend && BACKEND_URL=https://<railway-url> node scripts/registerWebhook.js`.

## Verificación end-to-end
1. `POST /api/agent/run` con un ID token de Firebase → revisar en Firestore la
   colección decisions (el agente corrió y decidió).
2. Hacer una orden de prueba en la tienda → aparece en la colección sales con el
   desglose de rentabilidad, y en los logs queda la orden cruda para validar el
   mapeo de payment_details (ajustar extractSale.js si difiere).
3. Primer análisis real: revisar los logs de Railway y el historial de decisiones.

## Correr local
```
cd backend && cp .env.example .env  # completar credenciales
npm install && npm start            # http://localhost:3000
npx vitest run                      # tests
```

## Frontend (dashboard)
React + Vite en `frontend/`. Login con contraseña simple (la misma DASHBOARD_PASSWORD
del backend). Páginas: Resumen, Ventas, Aprobaciones, Historial, Creativos,
Propuestas/Aprendizajes y Config (incluye el kill switch del modo autónomo).

### Deploy en Hostinger
1. `cd frontend && cp .env.example .env` → poner la URL real del backend en VITE_API_URL.
2. `npm install && npm run build`.
3. Subir el CONTENIDO de `frontend/dist/` (incluye el `.htaccess` para el fallback
   de rutas SPA) a la carpeta del dominio en Hostinger (public_html o subdominio).
4. En Railway, FRONTEND_ORIGIN debe ser exactamente el dominio del dashboard
   (para CORS), y DASHBOARD_PASSWORD la contraseña elegida.

### Correr local
cd frontend && npm install && npm run dev   # http://localhost:5173 (backend en :3000)
npx vitest run                              # tests
