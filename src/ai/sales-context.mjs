/** Contexto comercial del prospecto (BLOQUE B · FASE 3/7).
 * Capa determinística: enum de etapas, objeciones, siguiente mejor acción y
 * sugerencia de etapa. No depende del LLM; el modelo solo redacta lenguaje a
 * partir de estos hechos. */

export const SALES_STAGES = Object.freeze([
  'discovery',
  'solution_presentation',
  'qualification',
  'quotation',
  'objection_handling',
  'purchase_preparation',
  'handoff',
]);

export const OBJECTIONS = Object.freeze([
  'price',
  'minimum_quantity',
  'storage',
  'payment',
  'delivery',
  'branding',
  'uncertainty',
  'other',
]);

export const NEXT_BEST_ACTIONS = Object.freeze([
  'ask_modality',
  'ask_product',
  'explain_modality',
  'ask_quantity',
  'ask_logo',
  'ask_container_status',
  'resolve_objection',
  'quote',
  'ask_location',
  'prepare_purchase',
  'handoff',
  'answer_current_question',
  'resume_pending_topic',
  'wait_for_confirmation',
]);

/** Productos cuya cotización requiere cantidad (escalas/paquetes). */
const TIERED_PRODUCTS = new Set([
  'maquila_botella_625ml_rosca', 'maquila_botella_1l_fliptop', 'maquila_galonera_10_5l',
  'distribution_botella_625ml_rosca', 'distribution_botella_1l_fliptop',
]);

/** Maquila de botellas donde la etiqueta personalizada está incluida y el
 * logo propio es un paso de calificación comercial natural. */
const MAQUILA_BOTELLA = new Set(['maquila_botella_625ml_rosca', 'maquila_botella_1l_fliptop']);

function needsQuantity(productId) {
  if (productId === 'maquila_bidon_20l') return true;
  return TIERED_PRODUCTS.has(productId);
}

/** Decide el siguiente mejor paso comercial a partir del estado estructurado.
 * Es una guía, no una máquina de estados inflexible: el mensaje actual del
 * prospecto (pregunta directa, cambio de tema) tiene prioridad en el turno. */
export function getNextBestAction(state = {}) {
  // F: objeción activa → resolver antes de cerrar.
  if (state.currentObjection) return { action: 'resolve_objection', priority: 100 };
  // Tema interrumpido o que requiere confirmación humana → retomarlo.
  if (state.pendingTopic) return { action: 'resume_pending_topic', priority: 90 };
  // A: modalidad desconocida → orientar entre maquila y distribución.
  if (!state.modality) return { action: 'ask_modality', priority: 80 };
  // B: modalidad conocida sin presentación → preguntar presentación.
  if (!state.productId) return { action: 'ask_product', priority: 70 };
  // C: presentación conocida sin cantidad (se necesita para cotizar) → cantidad.
  if (needsQuantity(state.productId) && !state.quantity) return { action: 'ask_quantity', priority: 65 };
  // E: bidón 20 L con cantidad pero sin tipo de compra → envases propios o nuevos.
  if (state.productId === 'maquila_bidon_20l' && state.quantity && !state.purchaseType) {
    return { action: 'ask_container_status', priority: 60 };
  }
  // D: maquila de botellas con cantidad y logo desconocido → preguntar logo.
  if (MAQUILA_BOTELLA.has(state.productId) && state.quantity && state.hasLogo === null) {
    return { action: 'ask_logo', priority: 50 };
  }
  // H: cotización entregada y sin objeciones → preparación de compra.
  if (state.quoteRequestCreated && !state.currentObjection) {
    return { action: 'prepare_purchase', priority: 30 };
  }
  // G (por defecto): responder la pregunta actual del prospecto.
  return { action: 'answer_current_question', priority: 10 };
}

/** Sugiere la etapa comercial del turno según el estado y la siguiente acción.
 * Nunca regresa la etapa a un estado anterior si ya hay progreso. */
export function suggestSalesStage(state = {}, nextBestAction = null) {
  const action = nextBestAction?.action ?? getNextBestAction(state).action;
  if (action === 'resolve_objection') return 'objection_handling';
  if (action === 'handoff') return 'handoff';
  if (action === 'prepare_purchase') return 'purchase_preparation';
  if (action === 'ask_quantity' || action === 'quote') return 'quotation';
  if (action === 'ask_logo' || action === 'ask_container_status') return 'qualification';
  if (action === 'ask_product' || action === 'explain_modality') return 'solution_presentation';
  if (action === 'ask_modality') return 'discovery';
  // answer_current_question / resume_pending_topic / wait_for_confirmation:
  // conservan la etapa actual; si ya hubo cotización, avanza a preparación.
  if (state.quoteRequestCreated) return 'purchase_preparation';
  return state.salesStage ?? 'discovery';
}
