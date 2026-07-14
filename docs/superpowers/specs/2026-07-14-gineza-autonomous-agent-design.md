# Gineza — Agente Autónomo de Optimización E-commerce

**Fecha:** 2026-07-14
**Estado:** Diseño aprobado en conversación, pendiente de revisión final del spec.

## 1. Objetivo

Agente autónomo que optimiza las campañas de Meta Ads de Gineza y resuelve el problema central de rentabilidad: hoy el ROAS no refleja la ganancia real, y el usuario siente que "no queda plata". El agente cruza datos de Meta Ads con Tienda Nube (precios, costos, ventas) para tomar decisiones basadas en **margen neto real por producto**, no solo ROAS.

**Cuenta Meta:** GinezaOficial (`act_33890648080578737`), ARS.
**Tienda:** https://ginezaonline.com/ (Tienda Nube). Page ID 104448066033431, Pixel 659564062266866, IG actor 17841444761910024.

## 2. Stack y deploy

| Capa | Tecnología | Deploy |
|---|---|---|
| Frontend | React + Vite + JSX + CSS | Build estático en Hostinger (dominio propio), consume API del backend por CORS |
| Backend | Node + Express | Railway (servicio único; cron diario con `node-cron` dentro del mismo proceso) |
| Base de datos | Firebase Firestore + Firebase Storage (archivos de creativos) | Firebase |
| Cerebro | Claude API — modelo `claude-sonnet-5`, tool-use | API de Anthropic desde el backend |
| Meta Ads | Graph API directa (SDK Node de Meta) con System User token | — |
| Tienda Nube | API REST con token de app interna (ya generado por el usuario) | — |

**Estructura del repo:** monorepo con `/frontend` y `/backend`.

**Credenciales (variables de entorno en Railway):**
- `META_ACCESS_TOKEN` — System User token. El usuario ya tiene uno (lo usa el chatbot de WhatsApp); **hay que verificar que tenga scopes `ads_management` y `ads_read`**, y agregárselos si no.
- `TIENDANUBE_TOKEN` + `TIENDANUBE_STORE_ID` — de la app interna creada desde el panel de Tienda Nube.
- `ANTHROPIC_API_KEY`.
- Credenciales de Firebase Admin SDK.

Nota: el MCP de Pipeboard usado en sesiones de chat NO forma parte de este sistema — el backend habla directo con Graph API.

## 3. Loop del agente

### Disparadores
1. **Por venta** — webhook `order/created` de Tienda Nube → análisis liviano (métricas últimas 24-48h) → acciones de bajo impacto (bucket sin permiso).
2. **Diario (cron)** — 1 vez por día → análisis profundo con contexto completo: estado de campañas/conjuntos/anuncios + métricas Meta, ventas y márgenes de Tienda Nube, historial de decisiones reciente, creativos disponibles sin usar.

### Control de ritmo
- Si entran varias ventas juntas, los análisis por venta se agrupan: mínimo 30 minutos entre corridas (las ventas dentro de la ventana se acumulan y se analizan juntas).
- Deduplicación por ID de orden (Tienda Nube reintenta webhooks).

### El cerebro como tool-use
Claude recibe el contexto y un set de tools que el backend ejecuta. Nunca texto libre interpretado.

| Tool | Bucket | Comportamiento |
|---|---|---|
| `pause_ad` | Autónomo | Ejecuta al toque vía Graph API |
| `create_ad` | Autónomo | Crea anuncio usando creativos subidos desde la interfaz (feed 4:5 + story 9:16, `optimization_type=PLACEMENT`, `disable_all_enhancements=true` — criterio "sin IA" de siempre) |
| `propose_price_change` | Requiere aprobación | Registro `pending` en Firestore; al aprobarse, actualiza precio vía API de Tienda Nube |
| `propose_budget_change` | Requiere aprobación | Ídem; al aprobarse, actualiza presupuesto vía Graph API |
| `propose_campaign_structure_change` | Requiere aprobación | Pausar/crear conjuntos o campañas; ídem |
| `log_improvement_proposal` | Solo registro | Va a la sección "Propuestas" del dashboard |

**Toda invocación** (ejecutada, pendiente, aprobada, rechazada o fallida) se registra en `decisions` con: tipo, objetivo, razonamiento completo de Claude, impacto esperado con números, estado, y resultado posterior cuando sea medible.

### Interruptor de emergencia
Toggle en Config que desactiva el modo autónomo: el agente deja de ejecutar acciones solo (todo pasa a `pending` o se detiene), el dashboard sigue funcionando.

## 4. Motor de rentabilidad real (núcleo del proyecto)

### Fórmula de margen neto por venta
```
Margen neto = Precio de venta (SIN envío — el envío es pass-through: se cobra y se gasta igual)
            − Costo del producto (campo costo de Tienda Nube, ya cargado)
            − Comisión de pago (Pago Nube: % según método — transferencia ~1%, tarjeta 1 cuota, tarjeta 3 cuotas; configurable)
            − Impuestos (% IVA / IIBB, configurable)
            − Costo publicitario estimado × 1.30
```

- **×1.30:** recargo por pagar Meta en pesos vía MercadoPago (impuesto PAIS/percepción). El gasto que reporta Meta NO es el costo real. Multiplicador configurable con toggle — se desactiva el día que el usuario migre a "dólar app".
- **Costo publicitario estimado:** no hay atribución exacta venta↔ad; se usa CPA blended reciente (gasto Meta últimas 24-48h ÷ compras en esa ventana) × 1.30, etiquetado como *estimado*.
- **Comisiones:** al implementar, inspeccionar el payload real de una orden de Pago Nube — si trae el monto exacto de comisión, usarlo directo; si no, aplicar la tabla de % configurable por método de pago.

### ROAS de equilibrio por producto
De la fórmula sale el ROAS mínimo para no perder plata en CADA producto según su margen. El "ROAS 7" del usuario queda como **piso blended configurable** (alerta si el blended cae debajo), no como techo ni como criterio único: las decisiones reales (precio, presupuesto, qué producto empujar o dejar de publicitar) se basan en margen real por producto.

### Salidas del motor
- **Feed de ventas en vivo** en el dashboard: cada venta entrante genera un registro con desglose completo (precio, costo producto, comisión, impuestos, publicidad estimada, **ganancia neta o $0/pérdida**), actualizado en tiempo real vía Firestore.
- Alertas de productos "ROAS alto pero rentabilidad negativa" (prioridad máxima).
- Propuestas de cambio de precio (bucket con aprobación) cuando un producto está sistemáticamente bajo su ROAS de equilibrio, con el razonamiento numérico completo en la tarjeta de aprobación.

## 5. Modelo de datos (Firestore)

| Colección | Contenido |
|---|---|
| `decisions` | Acciones del agente: tipo, objetivo (ids Meta/TN), razonamiento, impacto esperado, estado (`executed`/`pending`/`approved`/`rejected`/`failed` + motivo), resultado posterior |
| `proposals` | Ideas de mejora sin acción directa |
| `sales` | Feed de ventas con desglose de rentabilidad; dedupe por ID de orden |
| `creatives` | Imagen feed 4:5 + story 9:16 (Storage), copy, funnel recomendado (frío/caliente/ambos), notas de contexto, estado (`unused`/`used`), referencia al ad creado |
| `config` | % comisión Pago Nube por método, % impuestos, multiplicador Meta (1.30, toggle), ROAS piso, presupuesto diario min/max (hoy 30k–50k ARS), mapeo adset_id→tag para naming, kill switch autónomo |
| `meta_state_cache` / `tn_state_cache` | Snapshots TTL ~15 min para no pegarle a las APIs en cada carga del dashboard |

## 6. Dashboard (React)

1. **Resumen** — ROAS blended, gasto, ventas, **ganancia neta real** día/semana, alertas de rentabilidad.
2. **Ventas** — feed en vivo, filas expandibles con desglose.
3. **Aprobaciones** — tarjetas con contexto completo + botones Aceptar/Rechazar. Al aceptar, el backend ejecuta la acción real.
4. **Historial** — todas las decisiones, filtrable, con resultado.
5. **Creativos** — formulario: imagen feed 4:5, imagen story 9:16, copy, funnel recomendado, notas de contexto libre; lista con estado de uso.
6. **Propuestas** — ideas del agente.
7. **Config** — parámetros de `config` editables + kill switch.

**Auth:** un solo usuario. Firebase Auth (email/password, una cuenta). El backend valida el token de Firebase en cada request.

## 7. Naming convention Meta Ads

- Las 2 campañas existentes (FRIO CBO `120240711724470412`, CALIENTE ABO `120240905711130412`) **no se renombran**.
- Objetos nuevos que crea el agente: `{FUNNEL}_{TAG-CONJUNTO}_{NOMBRE-CREATIVO}_{YYYYMMDD}` — ej. `CALIENTE_ATC14D_BORDO_20260714`. Tags por conjunto en `config` (ej. ATC14D, CATALOGO, BROADIG).
- El agente solo renombra lo que crea o modifica — nada de barridos masivos sobre anuncios históricos que funcionan. La prolijidad converge con el tiempo.

## 8. Seguridad y confiabilidad

- Webhook de Tienda Nube: validación de firma HMAC con el client secret — sin firma válida, se descarta.
- CORS restringido al dominio del frontend en Hostinger.
- Reintentos con backoff exponencial para Graph API (rate limits) y Tienda Nube.
- Si una acción autónoma falla, queda en `decisions` con estado `failed` y motivo — nunca falla en silencio.
- Kill switch (sección 3).
- Tokens solo en variables de entorno de Railway, nunca en el repo ni en Firestore.

## 9. Contexto operativo heredado (estado al 08/07/2026)

Para que el agente arranque bien alimentado, se le inyecta como contexto base:
- ADD TO CART 14D es el mejor motor histórico (~7-8x ROAS) pero con 92% del gasto concentrado en 1 ad (riesgo fatiga).
- CATALOGO CALIENTE AW: en observación — 0 ventas en 5.5 días tras un 10x inicial de muestra chica; checkpoint ~15/07 para decidir pausa/reducción.
- IG ENGAGERS 30D: pausado definitivo tras 3 ciclos de $0 ventas — no reactivar sin cambiar la definición de audiencia (probar 7D si se retoma).
- FRIO CBO: sólido (6.7–7.7x) pero el más variable semana a semana.
- Diagnóstico post-cambio: aislar la ventana de fechas al período posterior al último cambio de estructura, no usar "last 7d" a secas.

## 10. Fuera de alcance (por ahora)

- Notificaciones activas (WhatsApp/email) — todo se revisa desde el dashboard.
- Stock como variable de decisión (el usuario indicó stock infinito).
- Multi-usuario / roles.
- Atribución exacta venta↔anuncio (se usa CPA blended estimado).
