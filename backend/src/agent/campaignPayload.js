// Ayudantes compartidos por decisionExecutor.js y chatDispatcher.js para armar el
// payload de Graph API al crear un conjunto/campaña desde una decisión del agente.

// El agente da el presupuesto en pesos (daily_budget_ars) para que sea legible en el
// dashboard; acá se convierte a centavos (formato que espera Graph API).
export function withBudget(payload, dailyBudgetArs) {
  if (dailyBudgetArs == null) return payload;
  return { ...payload, daily_budget: Math.round(dailyBudgetArs * 100) };
}

// optimization_goal=OFFSITE_CONVERSIONS exige promoted_object.pixel_id en Graph API
// (error "100: Invalid parameter" si falta) — el agente no tiene forma de conocer el
// pixel_id de la cuenta, así que se inyecta acá en vez de pedírselo en cada propuesta.
export function withPromotedObject(payload, pixelId) {
  if (!payload || payload.optimization_goal !== 'OFFSITE_CONVERSIONS' || payload.promoted_object) return payload;
  return { ...payload, promoted_object: { pixel_id: pixelId, custom_event_type: 'PURCHASE' } };
}
