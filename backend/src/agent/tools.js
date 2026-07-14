const s = (desc) => ({ type: 'string', description: desc });
const n = (desc) => ({ type: 'number', description: desc });
const baseReq = ['reason', 'expected_impact'];
const base = {
  reason: s('Por qué tomás esta decisión, con los números que la justifican'),
  expected_impact: s('Qué esperás que pase y en cuánto tiempo se puede medir'),
};

export const TOOL_DEFINITIONS = [
  {
    name: 'pause_ad',
    description: 'Pausa un anuncio de Meta Ads. Se ejecuta inmediatamente sin aprobación. Usar para ads con gasto real y $0 conversión o fatiga clara.',
    input_schema: { type: 'object', properties: { ad_id: s('ID del anuncio'), ...base }, required: ['ad_id', ...baseReq] },
  },
  {
    name: 'create_ad',
    description: 'Crea un anuncio nuevo en un adset usando un creativo subido desde el dashboard (por su creative_id de la lista de creativos sin usar). Se ejecuta inmediatamente sin aprobación.',
    input_schema: { type: 'object', properties: { creative_id: s('ID del creativo en Firestore (de la lista unusedCreatives)'), adset_id: s('ID del adset destino'), ...base }, required: ['creative_id', 'adset_id', ...baseReq] },
  },
  {
    name: 'propose_price_change',
    description: 'Propone cambiar el precio de una variante de producto en Tienda Nube. QUEDA PENDIENTE de aprobación humana. Incluir el cálculo de margen completo en reason.',
    input_schema: { type: 'object', properties: { product_id: s('ID producto TN'), variant_id: s('ID variante TN'), product_name: s('Nombre legible'), current_price: n('Precio actual ARS'), proposed_price: n('Precio propuesto ARS'), ...base }, required: ['product_id', 'variant_id', 'current_price', 'proposed_price', ...baseReq] },
  },
  {
    name: 'propose_budget_change',
    description: 'Propone cambiar el presupuesto diario de una campaña o adset. QUEDA PENDIENTE de aprobación humana.',
    input_schema: { type: 'object', properties: { level: { type: 'string', enum: ['campaign', 'adset'] }, object_id: s('ID del objeto'), object_name: s('Nombre legible'), current_budget: n('Presupuesto diario actual ARS'), proposed_budget: n('Presupuesto diario propuesto ARS'), ...base }, required: ['level', 'object_id', 'current_budget', 'proposed_budget', ...baseReq] },
  },
  {
    name: 'propose_campaign_structure_change',
    description: 'Propone pausar o crear conjuntos/campañas — incluye probar públicos/intereses nuevos, campañas de testeo, o duplicar una estructura que funciona con otro segmento. QUEDA PENDIENTE de aprobación humana (salvo que te lo pidan en el chat). Para crear un conjunto de prueba COMPLETO (público + presupuesto + pieza) en una sola aprobación: usá action=create_adset, payload con el targeting (con los interest_id que confirmaste con search_interest) y demás campos de Graph API EXCEPTO el presupuesto, daily_budget_ars con el presupuesto diario en PESOS (se convierte solo a centavos), y creative_id con el id de un creativo de unusedCreatives para que además cree el anuncio ya armado en ese conjunto nuevo. No hace falta esperar evidencia de que algo "no funciona" para proponer un test — proponelo si ves una oportunidad razonable (audiencia sin explorar, segmento del funnel desatendido, etc.), dejando claro en reason que es exploratorio.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['pause_adset', 'pause_campaign', 'create_adset', 'create_campaign'] },
        object_id: s('ID del objeto a pausar (para pause_*)'),
        object_name: s('Nombre legible'),
        payload: { type: 'object', description: 'Payload Graph API para create_adset/create_campaign (targeting, name, campaign_id, optimization_goal, etc.) SIN el presupuesto' },
        daily_budget_ars: { type: 'number', description: 'Presupuesto diario en PESOS para create_adset/create_campaign (se convierte a centavos solo)' },
        creative_id: s('Solo para create_adset: id de un creativo de unusedCreatives para lanzar el ad ya armado en el conjunto nuevo'),
        ...base,
      },
      required: ['action', ...baseReq],
    },
  },
  {
    name: 'search_interest',
    description: 'Busca intereses/segmentos de audiencia reales en Meta (con tamaño de audiencia) para armar el targeting de una propuesta de conjunto/campaña nueva. Usalo ANTES de proponer un público nuevo — no inventes interest_id.',
    input_schema: { type: 'object', properties: { query: s('Término de búsqueda, ej. "running", "moda femenina"') }, required: ['query'] },
  },
  {
    name: 'request_creative',
    description: 'Pedile al usuario piezas creativas nuevas cuando detectes que hacen falta (fatiga, funnel desatendido, oportunidad de ángulo nuevo). NO genera la imagen — queda como pedido en el dashboard para que el usuario suba la pieza. No requiere aprobación, es solo un pedido.',
    input_schema: {
      type: 'object',
      properties: {
        funnel: { type: 'string', enum: ['caliente', 'frio', 'ambos'] },
        concept: s('Idea corta del concepto, ej. "Uniforme de invierno, foco en abrigo"'),
        style_notes: s('Dirección de estilo: formato, tono, colores, referencias — lo más concreto posible'),
        reason: s('Por qué hace falta esta pieza ahora, con números si aplica'),
      },
      required: ['funnel', 'concept', 'style_notes', 'reason'],
    },
  },
  {
    name: 'log_improvement_proposal',
    description: 'Registra una idea de mejora que no es una acción directa (ej. "probar remarketing 7D"). Solo se guarda para que el usuario la lea.',
    input_schema: { type: 'object', properties: { title: s('Título corto'), body: s('Desarrollo de la idea con evidencia') }, required: ['title', 'body'] },
  },
  {
    name: 'save_learning',
    description: 'Guarda o actualiza una lección aprendida con evidencia repetida (mínimo 2-3 observaciones consistentes — NUNCA de una sola muestra). Se inyecta en todos los análisis futuros. Pasar learning_id para actualizar una existente o marcarla obsolete.',
    input_schema: { type: 'object', properties: { learning_id: s('ID de lección existente (omitir para crear)'), text: s('La lección, corta y accionable'), evidence: s('Evidencia concreta con fechas y números'), status: { type: 'string', enum: ['active', 'obsolete'] } }, required: ['text', 'evidence'] },
  },
  {
    name: 'record_outcome',
    description: 'Registra el resultado medido de una decisión pasada (usado en la retrospectiva diaria). Comparar el snapshot "antes" con el estado actual.',
    input_schema: { type: 'object', properties: { decision_id: s('ID de la decisión'), outcome: s('Qué pasó realmente, con números') }, required: ['decision_id', 'outcome'] },
  },
];
