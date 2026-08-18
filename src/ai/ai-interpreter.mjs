const INTENTS = new Set([
  'greeting', 'list_products', 'product_information', 'quote', 'delivery',
  'additional_service', 'suggested_resale_price', 'human_handoff', 'continue', 'slot_update',
  'information_request', 'comparison', 'unknown',
]);
const DIALOGUE_ACTS = new Set([
  'greeting', 'inform', 'request_information', 'request_quote', 'affirm', 'deny',
  'acknowledge', 'clarify', 'change_intent', 'human_handoff', 'thanks', 'farewell', 'unknown',
]);
const RESPONSE_GOALS = new Set([
  'continue_conversation', 'acknowledge_modality_and_ask_product', 'ask_quantity',
  'explain_modality', 'clarify_modality', 'offer_products', 'offer_quote', 'acknowledge',
  'thank_user', 'farewell', 'handoff', 'ask_clarification', 'unknown',
]);
const SALES_STAGES = new Set(['discovery', 'qualification', 'product_exploration', 'quotation', 'decision', 'handoff']);
const ADVISOR_MOVES = new Set([
  'acknowledge', 'clarify', 'explain', 'ask_need', 'ask_product', 'ask_quantity',
  'present_options', 'quote', 'handle_objection', 'offer_next_step', 'handoff',
]);
const MISSING_INFORMATION = new Set([
  'modality', 'productId', 'quantity', 'district', 'purchaseType', 'fulfillment',
  'additionalServiceName', 'resaleProductName', 'businessType', 'customerGoal', 'experienceLevel',
]);
const OPTIONAL_CONTEXT_INFORMATION = new Set(['businessType', 'customerGoal', 'experienceLevel']);
const MISSING_INFORMATION_ALIASES = new Map([
  ['product_id', 'productId'], ['purchase_type', 'purchaseType'],
  ['additional_service_name', 'additionalServiceName'], ['resale_product_name', 'resaleProductName'],
  ['business_type', 'businessType'], ['customer_goal', 'customerGoal'], ['experience_level', 'experienceLevel'],
]);
const OPERATIONS = new Map([
  ['list_products', new Set(['modality'])],
  ['get_product', new Set(['productId'])],
  ['get_purchase_price', new Set(['productId', 'quantity', 'purchaseType', 'fulfillment', 'withPersonalizedLabels'])],
  ['get_delivery_information', new Set(['modality', 'district'])],
  ['get_additional_service', new Set(['serviceName', 'topic'])],
  ['list_suggested_resale_prices', new Set(['productName'])],
  ['get_commercial_modality', new Set(['modality'])],
  ['get_product_comparison', new Set(['modality', 'requestedInformation'])],
  ['request_human_handoff', new Set([])],
]);
const REQUESTED_INFORMATION_ALIASES = new Map([
  ['price', 'prices'], ['prices', 'prices'], ['pricing', 'prices'],
  ['minimum', 'minimums'], ['minimums', 'minimums'], ['minimum_order', 'minimums'], ['minimum_quantity', 'minimums'],
]);

function dialogueActForIntent(intent) {
  if (intent === 'greeting') return 'greeting';
  if (intent === 'quote') return 'request_quote';
  if (['information_request', 'product_information', 'list_products', 'delivery', 'additional_service', 'suggested_resale_price'].includes(intent)) return 'request_information';
  if (intent === 'human_handoff') return 'human_handoff';
  if (intent === 'unknown') return 'unknown';
  return 'inform';
}

function responseGoalFor({ intent, dialogueAct }) {
  if (dialogueAct === 'thanks') return 'thank_user';
  if (dialogueAct === 'farewell') return 'farewell';
  if (dialogueAct === 'acknowledge') return 'acknowledge';
  if (dialogueAct === 'clarify') return 'ask_clarification';
  if (intent === 'human_handoff') return 'handoff';
  if (intent === 'information_request') return 'explain_modality';
  if (intent === 'list_products') return 'offer_products';
  if (intent === 'quote') return 'offer_quote';
  if (intent === 'unknown') return 'unknown';
  return 'continue_conversation';
}

function catalogFrom(commercialService) {
  const products = commercialService.list_products();
  const modalityIds = ['maquila', 'distribution_agua_renew', 'final_customer'];
  const modalities = modalityIds.flatMap((id) => {
    const result = commercialService.get_commercial_modality(id);
    return result.status === 'ok' ? [{ id, name: result.data.name }] : [];
  });
  const services = commercialService.list_additional_services();
  const resaleProducts = commercialService.list_suggested_resale_products();
  return {
    modalityIds,
    modalities,
    products: products.status === 'ok' ? products.data.map((product) => ({ id: product.id, name: product.name, modality: product.modality })) : [],
    additionalServices: services.status === 'ok' ? services.data.map((service) => service.name) : [],
    resaleProducts: resaleProducts.status === 'ok' ? resaleProducts.data : [],
  };
}

function validNullableString(value) {
  return value === null || value === undefined || typeof value === 'string';
}

function sameOrMissing(first, second) {
  return first === null || first === undefined || second === null || second === undefined || first === second;
}

function normalizeRequestedInformation(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : value === undefined || value === null ? [] : null;
  if (!values) return null;
  const normalized = values.map((item) => typeof item === 'string' ? REQUESTED_INFORMATION_ALIASES.get(item.trim().toLowerCase()) : null);
  if (normalized.some((item) => !item) || new Set(normalized).size !== normalized.length) return null;
  return normalized;
}

/** Validates a conversational plan against controlled CommercialService catalogs. */
export class AIInterpreter {
  constructor({ provider, commercialService, minimumConfidence = 0.55 }) {
    this.provider = provider;
    this.commercialService = commercialService;
    this.minimumConfidence = minimumConfidence;
  }

  async interpret({ message, conversationState, conversationHistory = [] }) {
    const catalog = catalogFrom(this.commercialService);
    let providerResult;
    try {
      providerResult = await this.provider.interpret({
        systemPrompt: this.buildSystemPrompt(catalog, conversationState, conversationHistory),
        userMessage: message,
      });
    } catch (error) {
      return { success: false, errorType: error.type ?? 'provider_error', errorMessage: error.message ?? 'Error del proveedor.', metrics: this.metricsFrom(error) };
    }

    let parsed;
    try {
      parsed = JSON.parse(providerResult.content);
    } catch {
      return { success: false, errorType: 'invalid_json', errorMessage: 'La IA no devolvió JSON válido.', metrics: { ...providerResult, rawResponse: providerResult.content, parserRejection: 'invalid_json' } };
    }
    const validation = this.validate(parsed, catalog);
    if (!validation.valid) {
      return { success: false, errorType: 'invalid_interpretation', errorMessage: validation.reason, metrics: { ...providerResult, rawResponse: providerResult.content, parsedResponse: parsed, parserRejection: validation.reason } };
    }
    return { success: true, interpretation: validation.value, metrics: { ...providerResult, rawResponse: providerResult.content, parsedResponse: parsed } };
  }

  buildSystemPrompt(catalog, conversationState, conversationHistory = []) {
    const compactContext = {
      known_state: {
        modality: conversationState.modality ?? null,
        product_id: conversationState.productId ?? null,
        quantity: conversationState.quantity ?? null,
        district: conversationState.district ?? null,
        sales_stage: conversationState.salesStage ?? 'discovery',
      },
      pending_field: conversationState.pendingField ?? null,
      last_topic: conversationState.lastTopic ?? null,
      last_assistant_act: conversationState.lastAssistantAct ?? null,
      offered_options: conversationState.offeredOptions ?? [],
    };
    const recentTurns = conversationHistory.slice(-1).map((turn) => ({
      role: turn.role === 'bot' ? 'advisor' : 'customer',
      text: String(turn.text ?? '').slice(0, 280),
    }));
    const compactCatalog = {
      modalities: catalog.modalityIds,
      products: catalog.products.map(({ id, name, modality }) => ({ id, name, modality })),
      additional_services: catalog.additionalServices,
      resale_products: catalog.resaleProducts,
      operations: [...OPERATIONS.entries()].map(([name, args]) => ({ name, args: [...args] })),
    };
    return [
      'Planifica el siguiente turno de un asesor comercial de Agua ReNew. Devuelve SOLO JSON válido; no redactes respuesta al cliente ni datos comerciales.',
      'Conserva datos explícitos nuevos y el contexto. Un saludo puro es greeting; con una consulta conserva la intención y social_opening=true. Una aceptación breve debe retomar opciones previas, no reiniciar diagnóstico. Pide una sola cosa útil. No inventes precios, descuentos, disponibilidad, condiciones ni resultados.',
      'Usa operation solo para una consulta necesaria y solo desde el catálogo. operation es null o {"name":"operacion_permitida","args":{"clave":"valor"}}: args SIEMPRE es objeto, nunca arreglo ni string. Para derivación humana, servicios, diferencias entre modalidades o familias de producto usa operation=null. requestedInformation solo puede ser [], ["prices"], ["minimums"] o ["prices","minimums"], nunca texto. Para precios o mínimos de varias presentaciones usa get_product_comparison. missing_information solo contiene datos necesarios; contexto opcional no bloquea.',
      'Schema válido de ejemplo: {"dialogue_act":"inform","intent":"information_request","social_opening":false,"updates":{"modality":null,"product_id":null,"quantity":null,"district":null,"business_type":null,"customer_goal":null,"experience_level":null,"requested_information":[],"additional_service_name":null,"resale_product_name":null,"topic":null},"operation":null,"missing_information":[],"sales_stage":"discovery","advisor_move":"offer_next_step","response_goal":"continue_conversation","confidence":0.9}',
      `VALID_VALUES_JSON=${JSON.stringify({ intents:[...INTENTS], dialogue_acts:[...DIALOGUE_ACTS], response_goals:[...RESPONSE_GOALS], sales_stages:[...SALES_STAGES], advisor_moves:[...ADVISOR_MOVES] })}`,
      `CATALOGO_PERMITIDO_JSON=${JSON.stringify(compactCatalog)}`,
      `ESTADO_JSON=${JSON.stringify(compactContext)}`,
      `ULTIMO_TURNO_JSON=${JSON.stringify(recentTurns)}`,
    ].join('\n');
  }

  validateOperation(value, catalog) {
    if (value === null || value === undefined) return { valid: true, value: null };
    if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !OPERATIONS.has(value.name)) return { valid: false, reason: 'Operación no permitida.' };
    const args = value.args ?? {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { valid: false, reason: 'Argumentos de operación no válidos.' };
    const normalizedArgs = { ...args };
    if (args.requestedInformation !== undefined) {
      const requestedInformation = normalizeRequestedInformation(args.requestedInformation);
      if (!requestedInformation?.length) return { valid: false, reason: 'Información de comparación no válida.' };
      normalizedArgs.requestedInformation = requestedInformation;
    }
    const allowedArgs = OPERATIONS.get(value.name);
    if (Object.keys(args).some((key) => !allowedArgs.has(key))) return { valid: false, reason: 'Argumento de operación no permitido.' };
    if (args.modality !== undefined && !catalog.modalityIds.includes(args.modality)) return { valid: false, reason: 'Modalidad de operación no permitida.' };
    if (args.productId !== undefined && !catalog.products.some((product) => product.id === args.productId)) return { valid: false, reason: 'Producto de operación no permitido.' };
    if (args.quantity !== undefined && (!Number.isInteger(args.quantity) || args.quantity <= 0)) return { valid: false, reason: 'Cantidad de operación no válida.' };
    if (args.serviceName !== undefined && !catalog.additionalServices.includes(args.serviceName)) return { valid: false, reason: 'Servicio de operación no permitido.' };
    if (args.productName !== undefined && !catalog.resaleProducts.includes(args.productName)) return { valid: false, reason: 'Producto de reventa no permitido.' };
    if (args.district !== undefined && typeof args.district !== 'string') return { valid: false, reason: 'Distrito de operación no válido.' };
    if (args.withPersonalizedLabels !== undefined && typeof args.withPersonalizedLabels !== 'boolean') return { valid: false, reason: 'Argumento booleano no válido.' };
    return { valid: true, value: { name: value.name, args: normalizedArgs } };
  }

  validate(value, catalog) {
    if (!value || typeof value !== 'object' || !INTENTS.has(value.intent)) return { valid: false, reason: 'Intención no permitida.' };
    const dialogueAct = value.dialogue_act ?? dialogueActForIntent(value.intent);
    if (!DIALOGUE_ACTS.has(dialogueAct)) return { valid: false, reason: 'Acto conversacional no permitido.' };
    if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) return { valid: false, reason: 'Confianza no válida.' };
    const socialOpening = value.social_opening ?? dialogueAct === 'greeting';
    if (typeof socialOpening !== 'boolean') return { valid: false, reason: 'Apertura social no válida.' };
    const updates = value.updates && typeof value.updates === 'object' && !Array.isArray(value.updates) ? value.updates : {};
    const operationValidation = this.validateOperation(value.operation, catalog);
    if (!operationValidation.valid) return operationValidation;
    const operationArgs = operationValidation.value?.args ?? {};
    const modality = value.modality ?? updates.modality ?? operationArgs.modality ?? null;
    const productId = value.product_id ?? updates.product_id ?? operationArgs.productId ?? null;
    const quantity = value.quantity ?? updates.quantity ?? operationArgs.quantity ?? null;
    const district = value.district ?? updates.district ?? operationArgs.district ?? null;
    const additionalServiceName = value.additional_service_name ?? updates.additional_service_name ?? operationArgs.serviceName ?? null;
    const resaleProductName = value.resale_product_name ?? updates.resale_product_name ?? operationArgs.productName ?? null;
    const topic = value.topic ?? updates.topic ?? operationArgs.topic ?? null;
    const businessType = value.business_type ?? updates.business_type ?? null;
    const customerGoal = value.customer_goal ?? updates.customer_goal ?? null;
    const experienceLevel = value.experience_level ?? updates.experience_level ?? null;
    const explicitRequestedInformation = value.requested_information ?? updates.requested_information;
    const requestedInformation = normalizeRequestedInformation(
      Array.isArray(explicitRequestedInformation) && explicitRequestedInformation.length === 0
        ? operationArgs.requestedInformation ?? explicitRequestedInformation
        : explicitRequestedInformation ?? operationArgs.requestedInformation ?? [],
    );
    if (!sameOrMissing(value.modality ?? updates.modality, operationArgs.modality) || !sameOrMissing(value.product_id ?? updates.product_id, operationArgs.productId) || !sameOrMissing(value.quantity ?? updates.quantity, operationArgs.quantity)) return { valid: false, reason: 'Actualizaciones y operación incoherentes.' };
    if (modality !== null && !catalog.modalityIds.includes(modality)) return { valid: false, reason: 'Modalidad no permitida.' };
    const product = productId === null ? null : catalog.products.find((item) => item.id === productId);
    if (productId !== null && !product) return { valid: false, reason: 'Producto no permitido.' };
    if (product && modality && product.modality !== modality) return { valid: false, reason: 'Producto y modalidad incoherentes.' };
    if (quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) return { valid: false, reason: 'Cantidad no válida.' };
    if (!validNullableString(district)) return { valid: false, reason: 'Distrito no válido.' };
    if (additionalServiceName !== null && !catalog.additionalServices.includes(additionalServiceName)) return { valid: false, reason: 'Servicio adicional no permitido.' };
    if (resaleProductName !== null && !catalog.resaleProducts.includes(resaleProductName)) return { valid: false, reason: 'Producto de reventa no permitido.' };
    if (!validNullableString(topic)) return { valid: false, reason: 'Tema no válido.' };
    if (![businessType, customerGoal, experienceLevel].every(validNullableString)) return { valid: false, reason: 'Contexto comercial no válido.' };
    if (!requestedInformation) return { valid: false, reason: 'Información solicitada no válida.' };
    const salesStage = value.sales_stage ?? 'discovery';
    if (!SALES_STAGES.has(salesStage)) return { valid: false, reason: 'Etapa comercial no permitida.' };
    let advisorMove = value.advisor_move ?? (value.intent === 'quote' ? 'quote' : value.intent === 'human_handoff' ? 'handoff' : 'offer_next_step');
    if (!ADVISOR_MOVES.has(advisorMove)) return { valid: false, reason: 'Movimiento del asesor no permitido.' };
    if (dialogueAct === 'greeting') advisorMove = 'acknowledge';
    const rawMissingInformation = value.missing_information ?? [];
    if (!Array.isArray(rawMissingInformation)) return { valid: false, reason: 'Información faltante no permitida.' };
    const parsedMissingInformation = rawMissingInformation.map((field) => MISSING_INFORMATION_ALIASES.get(field) ?? field);
    if (parsedMissingInformation.some((field) => !MISSING_INFORMATION.has(field)) || new Set(parsedMissingInformation).size !== parsedMissingInformation.length) return { valid: false, reason: 'Información faltante no permitida.' };
    const missingInformation = parsedMissingInformation.filter((field) => !OPTIONAL_CONTEXT_INFORMATION.has(field));
    const optionalContextMissing = parsedMissingInformation.filter((field) => OPTIONAL_CONTEXT_INFORMATION.has(field));
    const responseGoal = value.response_goal ?? responseGoalFor({ intent: value.intent, dialogueAct });
    if (!RESPONSE_GOALS.has(responseGoal)) return { valid: false, reason: 'Objetivo de respuesta no permitido.' };
    return {
      valid: true,
      value: {
        dialogueAct, lowConfidence: value.confidence < this.minimumConfidence,
        intent: value.intent, modality: modality ?? product?.modality ?? null, productId,
        quantity, district, additionalServiceName, resaleProductName, topic, confidence: value.confidence,
        businessType, customerGoal, experienceLevel, requestedInformation, socialOpening, salesStage, advisorMove,
        optionalContextMissing,
        operation: operationValidation.value, missingInformation, responseGoal,
      },
    };
  }

  metricsFrom(error) {
    return {
      provider: error.provider ?? 'deepseek', model: error.model ?? null,
      latencyMs: error.latencyMs ?? null, inputTokens: error.inputTokens ?? null,
      outputTokens: error.outputTokens ?? null, errorType: error.type ?? 'provider_error',
      rawResponse: error.rawResponse ?? null, parsedResponse: null,
      parserRejection: error.message ?? null,
    };
  }
}
