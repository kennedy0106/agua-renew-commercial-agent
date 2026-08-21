/** Contexto comercial del prospecto (BLOQUE B · FASE 3/7).
 * Capa determinística: enum de etapas, objeciones, siguiente mejor acción,
 * sugerencia de etapa y aplicación de memoria de herramientas. No depende del
 * LLM; el modelo solo redacta lenguaje a partir de estos hechos. */

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

/** Valores estructurados válidos de tipo de compra y recojo (solo se persisten
 * valores validados provenientes de herramientas; nunca texto libre). */
export const PURCHASE_TYPES = Object.freeze(['refill_with_own_container', 'new_bidon_first_refill']);
export const FULFILLMENTS = Object.freeze(['plant_collection', 'authorized_collection_point', 'plant_collection_or_authorized_collection_point']);

/** Readiness mínima para considerar preparación de compra (conservador:
 * una cotización por sí sola no es señal de intención de compra). */
const READY_READINESS = ['qualified', 'ready_for_handoff'];

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

/** Regla de coherencia envase/tipo de compra:
 * hasOwnContainers = true  ↔ purchaseType = refill_with_own_container
 * hasOwnContainers = false ↔ purchaseType = new_bidon_first_refill
 * Una contradicción real se trata como nueva información a resolver, no se
 * persiste como estado válido ni se elige arbitrariamente. */
export function containerCoherence(state = {}) {
  if (state.hasOwnContainers === null || state.hasOwnContainers === undefined || !state.purchaseType) {
    return { valid: true, contradiction: false };
  }
  const expected = state.hasOwnContainers ? 'refill_with_own_container' : 'new_bidon_first_refill';
  const contradiction = state.purchaseType !== expected;
  return { valid: !contradiction, contradiction };
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
  // H (endurecido): preparación de compra solo con señales suficientes:
  // cotización entregada, sin objeción, sin tema pendiente, readiness alta y
  // datos comerciales completos. No es handoff automático.
  if (
    state.quoteRequestCreated
    && !state.currentObjection
    && !state.pendingTopic
    && READY_READINESS.includes(state.purchaseReadiness)
    && state.modality && state.productId && state.quantity
    && (state.productId !== 'maquila_bidon_20l' || state.purchaseType)
  ) {
    return { action: 'prepare_purchase', priority: 30 };
  }
  // G (por defecto): responder la pregunta actual del prospecto.
  return { action: 'answer_current_question', priority: 10 };
}

/** Sugiere la etapa comercial del turno según el estado y la siguiente acción.
 * Nunca regresa la etapa a un estado anterior si ya hay progreso, y una
 * cotización por sí sola no avanza la etapa (depende de la readiness). */
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
  // conservan la etapa actual (quotation si ya se cotizó, sin avanzar sola).
  return state.salesStage ?? 'discovery';
}

/** Aplica la memoria de herramientas del turno sobre el estado (función pura).
 * Solo persiste valores validados; los campos no mencionados se conservan.
 * Mecanismos explícitos de limpieza: clearCurrentObjection / clearPendingTopic.
 * Una cotización entregada resuelve la objeción salvo re-afirmación explícita.
 * La coherencia envase/tipo de compra nunca persiste estados contradictorios. */
export function applyToolMemoryToState(state = {}, tools = []) {
  const next = {
    ...state,
    questionsResolved: [...(state.questionsResolved ?? [])],
  };
  let reassertedObjection = false;
  let successfulQuote = false;

  for (const tool of tools) {
    const args = tool.args ?? {};
    if (args.productId) {
      next.productId = args.productId;
      next.lastReferencedProduct = args.productId;
    }
    if (Number.isInteger(args.quantity)) next.quantity = args.quantity;
    if (args.district) next.district = args.district;
    if (args.modality) next.modality = args.modality;
    if (args.businessType) next.businessType = args.businessType;
    if (args.customerGoal) next.customerGoal = args.customerGoal;
    if (args.useCase) next.useCase = args.useCase;
    if (args.experienceLevel) next.experienceLevel = args.experienceLevel;
    if (args.lastTopic) next.lastTopic = args.lastTopic;
    if (args.commercialIntent) next.commercialIntent = args.commercialIntent;
    if (typeof args.hasBrand === 'boolean') next.hasBrand = args.hasBrand;
    if (args.brandName) next.brandName = args.brandName;
    if (typeof args.hasLogo === 'boolean') next.hasLogo = args.hasLogo;
    if (typeof args.needsDesign === 'boolean') next.needsDesign = args.needsDesign;
    if (typeof args.hasOwnContainers === 'boolean') next.hasOwnContainers = args.hasOwnContainers;
    if (args.labelRequirements) next.labelRequirements = args.labelRequirements;
    if (args.paymentStatus) next.paymentStatus = args.paymentStatus;
    if (args.currentObjection) {
      next.currentObjection = args.currentObjection;
      reassertedObjection = true;
    }
    if (args.clearCurrentObjection === true) {
      next.currentObjection = null;
      reassertedObjection = false;
    }
    if (typeof args.sampleInterest === 'boolean') next.sampleInterest = args.sampleInterest;
    if (args.purchaseReadiness) next.purchaseReadiness = args.purchaseReadiness;
    if (args.salesStage) next.salesStage = args.salesStage;
    if (Array.isArray(args.questionsResolved)) {
      next.questionsResolved = [...new Set([...next.questionsResolved, ...args.questionsResolved])];
    }
    if (args.pendingTopic) next.pendingTopic = args.pendingTopic;
    if (args.clearPendingTopic === true) next.pendingTopic = null;
    // purchaseType/fulfillment: solo valores estructurados válidos.
    if (PURCHASE_TYPES.includes(args.purchaseType)) next.purchaseType = args.purchaseType;
    if (FULFILLMENTS.includes(args.fulfillment)) next.fulfillment = args.fulfillment;
    if (['get_quote', 'get_purchase_price'].includes(tool.name) && tool.resultStatus === 'ok') successfulQuote = true;
  }

  // Cotización entregada → la objeción activa dejó de bloquear (salvo que el
  // modelo la haya re-afirmado explícitamente en este mismo turno).
  if (successfulQuote && !reassertedObjection) next.currentObjection = null;

  // Coherencia envase/tipo de compra: nunca persistir contradicción.
  if (next.hasOwnContainers !== null && next.hasOwnContainers !== undefined && next.purchaseType) {
    const coherence = containerCoherence(next);
    if (!coherence.valid) {
      // Nueva información a resolver: no se elige arbitrariamente; se deja
      // pendiente de aclaración.
      next.hasOwnContainers = null;
      next.purchaseType = null;
      if (!next.pendingTopic) next.pendingTopic = 'container_status_confirmation';
    } else if (next.pendingTopic === 'container_status_confirmation') {
      // La pareja volvió a ser coherente: el tema de aclaración se resuelve.
      next.pendingTopic = null;
    }
  }

  return next;
}
