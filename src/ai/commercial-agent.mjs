import { getNextBestAction, suggestSalesStage, applyToolMemoryToState } from './sales-context.mjs';

function compactMemory(state = {}) {
  return {
    business_type: state.businessType ?? null, customer_goal: state.customerGoal ?? null,
    use_case: state.useCase ?? null,
    experience_level: state.experienceLevel ?? null, modality: state.modality ?? null,
    product_id: state.productId ?? null, quantity: state.quantity ?? null, district: state.district ?? null,
    last_referenced_product: state.lastReferencedProduct ?? state.productId ?? null, last_topic: state.lastTopic ?? null,
    commercial_intent: state.commercialIntent ?? null, has_brand: state.hasBrand ?? null,
    brand_name: state.brandName ?? null, has_logo: state.hasLogo ?? null,
    needs_design: state.needsDesign ?? null, has_own_containers: state.hasOwnContainers ?? null,
    label_requirements: state.labelRequirements ?? null, payment_status: state.paymentStatus ?? null,
    current_objection: state.currentObjection ?? null,
    sample_interest: state.sampleInterest ?? null,
    purchase_readiness: state.purchaseReadiness ?? 'exploring', questions_resolved: state.questionsResolved ?? [],
    pending_topic: state.pendingTopic ?? null, sales_stage: state.salesStage ?? 'discovery',
  };
}

function sanitizeToolResult(value) { return JSON.stringify(value); }

function responseDiagnostics(text, toolAudits = []) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return {
    responseDetailLevel: words <= 90 ? 'brief' : words <= 130 ? 'standard' : 'detailed',
    wordCount: words,
    questionCount: (String(text ?? '').match(/\?/g) ?? []).length,
    factsAvailable: toolAudits.flatMap((item) => item.factsAvailable ?? []),
    factsAllowed: toolAudits.flatMap((item) => item.factsAllowed ?? []),
    factsSelected: toolAudits.flatMap((item) => item.factsAllowed ?? []),
    restrictedFieldsRemoved: toolAudits.flatMap((item) => item.restrictedFieldsRemoved ?? []),
    technicalDetailsSuppressed: toolAudits.some((item) => item.technicalDetailsSuppressed),
  };
}

function formatPEN(amount) {
  const fixed = Number(amount).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decPart}`;
}

const PLURAL_PER = { recarga: 'recargas', unidad: 'unidades', botella: 'botellas', bidón: 'bidones', paquete: 'paquetes' };

function pluralPer(per, quantity) {
  if (!quantity || quantity === 1) return per ?? 'unidades';
  return PLURAL_PER[per] ?? per;
}

function quoteFact(data, productName) {
  const quantity = Number.isFinite(data.quantity) && data.quantity > 0 ? data.quantity : null;
  const label = productName ? `${productName}: ` : '';
  let sentence = null;

  if (data.tier?.package_price_pen !== undefined && data.tier?.price?.amount_pen !== undefined) {
    const packagePrice = Number(data.tier.package_price_pen);
    const unit = Number(data.tier.price.amount_pen);
    const totalPart = quantity ? ` El total es S/ ${formatPEN(quantity * packagePrice)}.` : '';
    sentence = `Para ${data.quantity} paquetes, el precio aplicable es S/ ${packagePrice.toFixed(2)} por paquete (S/ ${unit.toFixed(2)} por botella).${totalPart}`;
  } else if (data.price?.amount_pen !== undefined) {
    const unit = Number(data.price.amount_pen);
    const per = data.price.per ?? 'unidad';
    const totalPart = quantity ? ` El total para ${data.quantity} ${pluralPer(per, data.quantity)} es S/ ${formatPEN(quantity * unit)}.` : '';
    sentence = `El precio aplicable es S/ ${unit.toFixed(2)} por ${per}.${totalPart}`;
  } else if (data.tier?.price?.amount_pen !== undefined) {
    const unit = Number(data.tier.price.amount_pen);
    const per = data.tier.price.per ?? 'unidad';
    const totalPart = quantity ? ` El total para ${data.quantity} ${pluralPer(per, data.quantity)} es S/ ${formatPEN(quantity * unit)}.` : '';
    sentence = `Para la cantidad indicada, el precio aplicable es S/ ${unit.toFixed(2)} por ${per}.${totalPart}`;
  }
  if (!sentence) return null;

  // Hechos adicionales autorizados que el modelo no puede alterar: contenido
  // de paquete, mínimo vigente e inclusión/exclusión de etiqueta.
  const facts = [sentence];
  if (data.package?.contents) facts.push(`Cada paquete contiene ${data.package.contents} ${data.package.unit}.`);
  if (data.minimum?.value) facts.push(`El pedido mínimo es de ${data.minimum.value} ${data.minimum.unit}.`);
  if (data.label_included === true) facts.push('La etiqueta personalizada está incluida.');
  else if (data.label_included === false && data.exclusions?.includes('etiqueta personalizada')) facts.push('No incluye etiqueta personalizada.');
  return `${label}${facts.join(' ')}`;
}

function serviceFact(data) {
  const name = data.name ?? null;
  if (!name) return null;
  const amount = data.price?.amount_pen !== undefined ? Number(data.price.amount_pen) : null;
  const deliveryTime = typeof data.delivery_time === 'string' ? data.delivery_time.replace(/[.\s]+$/, '') : null;
  if (amount === null) return `${name}.`;
  const pricePart = amount === 0 ? 'no tiene costo' : `tiene un costo de S/ ${formatPEN(amount)}`;
  const timePart = deliveryTime ? ` El tiempo de entrega es ${deliveryTime}.` : '';
  return `${name} ${pricePart}.${timePart}`;
}

/**
 * Compone de forma determinística los hechos comerciales críticos (dinero y
 * condiciones duras) a partir de los resultados de herramientas. El modelo solo
 * aporta lenguaje; nunca puede omitir ni alterar un precio, total o plazo.
 */
function composeCommercialFacts(tools, nameById = new Map()) {
  const facts = [];
  for (const tool of tools) {
    if (tool.name === 'get_quote') {
      if (tool.resultStatus === 'ok' || tool.resultStatus === 'partial') {
        const fact = quoteFact(tool.result?.data, nameById.get(tool.args?.productId));
        if (fact) facts.push(fact);
      } else if (tool.resultStatus === 'below_minimum') {
        // Situación comercial: el pedido está bajo el mínimo vigente. Se
        // explica con el mínimo autorizado (nunca lo decide el modelo).
        const name = nameById.get(tool.args?.productId) ?? 'Ese producto';
        const min = tool.result?.data?.minimum;
        const packageInfo = tool.result?.data?.package;
        const parts = [];
        if (min?.value) parts.push(`el pedido mínimo vigente es de ${min.value} ${min.unit}`);
        if (packageInfo?.contents) parts.push(`cada paquete contiene ${packageInfo.contents} ${packageInfo.unit}`);
        const message = parts.length ? parts.join('; ') : 'el pedido está por debajo del mínimo vigente';
        facts.push(`${name}: ${message}.`);
      } else if (tool.resultStatus === 'blocked' || tool.resultStatus === 'not_available') {
        // El cliente pidió un producto cuyo precio no es consultable o es
        // ambiguo: se explica en vez de omitirlo en silencio.
        const name = nameById.get(tool.args?.productId) ?? 'Ese producto';
        facts.push(`${name}: el precio requiere confirmación con un asesor.`);
      }
      continue;
    }
    if (tool.resultStatus !== 'ok' && tool.resultStatus !== 'partial') continue;
    const data = tool.result?.data;
    if (!data) continue;
    if (tool.name === 'get_service_information') {
      const fact = serviceFact(data);
      if (fact) facts.push(fact);
    } else if (tool.name === 'knowledge_lookup' && ['brand_registration', 'logo', 'sample'].includes(tool.args?.topic)) {
      // Temas de knowledge_lookup que devuelven un servicio con precio: se
      // componen igual que get_service_information para no dejar el dinero en
      // manos del modelo.
      const fact = serviceFact(data);
      if (fact) facts.push(fact);
    }
  }
  return facts.length ? facts.join('\n\n') : null;
}

function trailingQuestion(text) {
  const t = String(text ?? '').trim();
  const idx = t.lastIndexOf('?');
  if (idx < 0) return null;
  const head = t.slice(0, idx);
  const boundary = Math.max(head.lastIndexOf('. '), head.lastIndexOf('\n'));
  const question = (boundary >= 0 ? t.slice(boundary + 2) : t).trim();
  if (!question) return null;
  return question.endsWith('?') ? question : `${question}?`;
}

/** Separa el cuerpo del texto de su pregunta final (si existe). Se usa para
 * reconstruir una respuesta sin la pregunta insegura del modelo. */
function splitTrailingQuestion(text) {
  const t = String(text ?? '').trim();
  const idx = t.lastIndexOf('?');
  if (idx < 0) return { body: t, question: null };
  const head = t.slice(0, idx);
  const boundary = Math.max(head.lastIndexOf('. '), head.lastIndexOf('\n'));
  const question = (boundary >= 0 ? t.slice(boundary + 2) : t).trim();
  if (!question) return { body: t, question: null };
  const body = boundary >= 0 ? t.slice(0, boundary + 2).trim() : '';
  return { body, question: question.endsWith('?') ? question : `${question}?` };
}

/** Categorías de afirmaciones comerciales NO verificables (guard conservador por
 * categorías, no listas de frases). Se aplica a la transición de cotización y a
 * la pregunta final generadas por el modelo: si mencionan alguna, se descartan
 * para no introducir hechos comerciales sin respaldo de herramientas. */
const COMMERCIAL_CLAIM_TERMS = [
  'stock', 'disponibilidad', 'disponible', 'inmediata', 'inmediato',
  'entreg', 'envi',
  'mañana', 'hoy mismo', 'horas', 'día hábil', 'dia habil', 'días hábiles', 'dias habiles', 'semanas',
  'promoción', 'promocion', 'promo', 'descuento', 'oferta', 'bonificaci',
  'rentable', 'rentabilidad', 'ganancia', 'más vendida', 'mas vendida', 'más vendido', 'mas vendido', 'popular',
  'calidad', 'garantía', 'garantia', 'devoluci', 'reembolso',
  'contrato', 'crédito', 'credito', 'financiamiento', 'adelanto', 'forma de pago',
  'mínimo', 'minimo', 'mínima', 'total es', 'incluye', 'incluida', 'etiqueta personalizada',
];

function isUnsafeCommercialClaim(text) {
  const t = String(text ?? '').toLowerCase();
  return COMMERCIAL_CLAIM_TERMS.some((term) => t.includes(term));
}

/** Transición breve generada por el modelo para abrir una cotización
 * determinística. Solo se acepta si es lenguaje discursivo: sin montos
 * (integridad: el dinero nunca viene del texto libre), sin afirmaciones
 * comerciales nuevas (stock, tiempos, rentabilidad, condiciones…) y sin
 * exceder ~30 palabras. Si hay duda, se descarta (integridad > variedad). */
function extractTransition(text) {
  const t = String(text ?? '').trim();
  const idx = t.lastIndexOf('?');
  const head = idx >= 0 ? t.slice(0, idx) : t;
  const cleaned = head.replace(/[.!¿¡\s]+$/g, '').trim();
  if (!cleaned) return null;
  if (/S\/\s?\d/.test(cleaned)) return null;
  if (cleaned.split(/\s+/).length > 30) return null;
  if (isUnsafeCommercialClaim(cleaned)) return null;
  return cleaned;
}

/** Pregunta de cierre segura según contexto: si hubo cotización, invita a
 * revisar otra cantidad; si no, abre a otra consulta. Nunca inventa
 * condiciones comerciales. */
function safeFollowUp(hasQuoteFacts) {
  return hasQuoteFacts ? '¿Desea revisar otra cantidad?' : '¿Hay algo más que le gustaría revisar?';
}

function containsToolProtocolLeak(content, definitions) {
  const text = String(content ?? '');
  if (text.includes('<｜｜DSML｜｜tool_calls>')) return true;
  return definitions.some((definition) => text.includes(definition.function.name));
}

/** Perfiles de generación: decisión/herramientas determinista (temperature 0);
 * redacción final con variedad moderada. La temperatura nunca gobierna hechos
 * comerciales (esos se componen determinísticamente en composeCommercialFacts). */
const GENERATION_PROFILES = Object.freeze({
  decision: { temperature: 0, maxTokens: 1200 },
  final_response: { temperature: 0.3, maxTokens: 400 },
});

const CHANNEL_RULES = Object.freeze({
  instagram: 'Canal Instagram: continúe la conversación en este mismo canal; no pida que le escriban por WhatsApp ni ofrezca cambiar de canal. Respuestas breves y directas.',
  messenger: 'Canal Messenger: continúe la conversación en este mismo canal; no pida que le escriban por WhatsApp ni ofrezca cambiar de canal. Respuestas breves y directas.',
  whatsapp: 'Canal WhatsApp: mismo asesor comercial de Agua ReNew; tono ligeramente conversacional, respuestas breves y texto plano.',
  local: 'Canal local (simulador): mismo comportamiento comercial.',
});

export class CommercialAgent {
  constructor({ provider, tools }) { this.provider = provider; this.tools = tools; }

  systemPrompt(memory, nextBestAction = null, channel = 'local', conversationHasStarted = false) {
    const channelRules = CHANNEL_RULES[channel] ?? CHANNEL_RULES.local;
    const turnContext = conversationHasStarted
      ? 'Es una conversación en curso: NO repitas saludos ni la presentación de Agua ReNew (evita “Hola”, “Gracias por escribirnos”, “Con gusto le ayudo”, “En Agua ReNew…”). Continúa como si ya estuvieran hablando.'
      : 'Es el primer contacto: saluda brevemente (una línea) y pasa a una respuesta útil con una pregunta concreta si corresponde. No acumules cortesías.';
    return [
      'Eres el asesor comercial virtual de primer contacto de Agua ReNew: un vendedor proactivo y consultivo, no un centro de ayuda ni un FAQ. Atiendes, educas, orientas, calificas y haces preventa; conduces la conversación hacia la venta y no negocias condiciones especiales.',
      'MISIÓN: tu objetivo no es responder preguntas aisladas, sino hacer avanzar una oportunidad comercial. Cada respuesta debe cumplir uno o más de estos objetivos: descubrir una necesidad, aumentar el valor percibido, resolver una objeción, calificar al prospecto, recomendar una alternativa, obtener un dato necesario, preparar una cotización o acercar naturalmente a la compra. No fuerces una pregunta si la respuesta ya cumple el objetivo y no empujes un cierre prematuro.',
      'PRIMERO APORTA VALOR, LUEGO CALIFICA: cuando el prospecto expresa una intención clara (por ejemplo “quiero mi propia marca”), reconócelo, aporta una explicación breve de lo que ofrece esa ruta y recién después haz la pregunta mínima necesaria (presentación o cantidad). No arranques con una batería de preguntas (negocio, volumen, presupuesto) antes de aportar nada, y nunca respondas solo con una pregunta abierta como “¿qué necesitas?”: si preguntas, que sea una pregunta concreta que conduzca a una recomendación.',
      'REGLA OBLIGATORIA DE HERRAMIENTAS: cuando el mensaje identifica una presentación y una cantidad, debes llamar get_quote antes de responder. No puedes dar una respuesta provisional, decir que revisarás ni explicar solo el empaque en lugar de una cotización. Los saludos y cortesías sin consulta comercial pueden responderse directamente.',
      'No uses get_product_catalog si la persona ya mencionó una presentación concreta o una cantidad: esa herramienta es exclusivamente para ver opciones amplias. Nunca expliques tu razonamiento, tu plan, IDs de producto ni nombres de herramientas; responde siempre como asesor directamente a la persona.',
      `CATÁLOGO_CANÓNICO_PARA_HERRAMIENTAS=${JSON.stringify(this.tools.agentCatalog())}`,
      'En get_quote usa exclusivamente un productId exacto del catálogo canónico. No coloques una presentación informal como productId. Usa purchaseType solo cuando la herramienta lo requiera; la modalidad no es un purchaseType.',
      'REGISTRO: tratamiento comercial predeterminado “usted” (¿Qué presentación le interesa trabajar?, ¿Ya cuenta con un logo?, Podemos ayudarlo con esa parte). Habla desde Agua ReNew como “nosotros”. Tono peruano profesional, cercano y consultivo; evita “señor”, “señora” y “estimado” salvo contexto real; no suenes burocrático. Si el prospecto adopta un trato informal sostenido, puedes flexibilizar ligeramente el tono, pero mantén consistencia y no tutees por un solo saludo.',
      'Habla directamente con la persona: nunca digas “el cliente” para referirte a quien te escribe (solo cuando hables de los clientes del prospecto).',
      `CANAL_ACTUAL=${channel}. ${channelRules}`,
      'No uses el nombre visible del perfil de la plataforma para dirigirte a la persona: solo usa un nombre si ella se presentó explícitamente o ya está confirmado en memoria. No empieces respuestas con “Hola [nombre]” solo porque la plataforma lo muestra.',
      turnContext,
      'EMOJIS moderados: en el primer mensaje máximo 1–2 si ayudan (no obligatorios); en seguimientos prefiere 0 y usa 1 solo si aporta claridad. Nunca empieces todos los mensajes con el mismo emoji ni uses emojis para sustituir contenido.',
      'LONGITUD: respuesta normal de 40–90 palabras; menos si la duda es sencilla. Solo supera ~90 palabras para cotizaciones de varias presentaciones, comparaciones o explicaciones solicitadas. Variedad: evita empezar todas las respuestas con las mismas palabras (“Perfecto.”, “Claro.”, “Entiendo.”).',
      'Atiende como vendedor por WhatsApp: texto plano, párrafos breves y viñetas simples solo cuando ayuden. No uses títulos Markdown, tablas, separadores, negritas visibles ni bloques tipo catálogo. Una respuesta normal tiene una idea principal y, como máximo, una pregunta útil.',
      'Conocer mucho no significa decirlo todo. Entrega información de forma progresiva: panorama al inicio; presentación cuando haya interés; precio, mínimo o escala aplicable solo al conocer el producto y la cantidad; más detalle solo si la persona realmente lo pide. Los resultados de herramientas sirven para razonar, nunca debes copiarlos completos.',
      'Elige la herramienta según el siguiente paso comercial: si la persona expresa una modalidad, consulta su panorama con get_modality_overview; si identifica una presentación sin cantidad, usa get_product_information; si identifica presentación y cantidad, prioriza get_quote directamente. No sustituyas una cotización posible por una explicación de empaque o catálogo.',
      'Cuando la persona pide información de forma general o solo muestra interés (por ejemplo “quiero información”, “¿qué ofrecen?”, “cuénteme de ustedes”, “no conozco el servicio”), presenta de inmediato el panorama del negocio usando get_business_overview: las 3 rutas (maquila con su propia marca, distribución de la marca Agua ReNew y compra directa) en una lista breve, e invita a elegir una. No te limites a preguntar “¿qué información busca?” sin aportar nada.',
      'No eres un formulario: conserva el hilo, admite interrupciones y cambios de tema. Si el prospecto hace una pregunta directa o cambia de tema, responde esa pregunta primero; el siguiente paso sugerido se retoma después si sigue siendo natural. Usa la memoria para entender el negocio, necesidad e interés. Puedes actualizarla solo con datos explícitos usando update_conversation_memory.',
      'NO REPITAS: nunca preguntes nuevamente un dato ya confirmado en memoria (por ejemplo, si has_logo es true no preguntes si tiene logo; si product_id está definido no preguntes qué presentación quiere; si quantity está definida no pidas la cantidad otra vez), salvo contradicción, cambio explícito del prospecto o confirmación necesaria para una cotización.',
      'OBJECIONES: cuando exista una objeción activa (current_objection), responde primero la objeción, refuerza valor cuando sea natural, no saltes al cierre y deja un siguiente paso pequeño. Cuando el prospecto confirma que la objeción quedó resuelta, usa update_conversation_memory con clearCurrentObjection; igual con clearPendingTopic cuando un tema pendiente se resuelve. Omitir esos campos conserva el valor existente.',
      'NO CIERRES PREMATURAMENTE: no solicites cierre ni handoff por compra solo porque el prospecto preguntó precio, pidió una cotización, mostró interés o respondió una presentación. Una cotización por sí sola no es intención de compra: prepare_purchase solo corresponde cuando hay señales suficientes (sin objeciones, sin temas pendientes y readiness alta). Antes de cualquier propuesta de cierre considera sales_stage, purchase_readiness, pending_topic, current_objection y los datos faltantes.',
      'ADAPTA EL ARGUMENTO AL CASO: cuando el prospecto explica para qué quiere el producto (use_case o business_type), traduce el producto en un beneficio relevante para su situación (por ejemplo, taxista → experiencia del pasajero y recordación; restaurante → presentación e identidad; distribuidor → rotación y producto listo para comercializar). No inventes rentabilidades, resultados garantizados ni hechos técnicos no documentados.',
      'Para cualquier hecho comercial, beneficio, precio, escala, mínimo, producto, delivery o servicio usa una herramienta de negocio aprobada. No inventes precios, promociones, descuentos, stock, rentabilidad, urgencia, crédito ni condiciones. Un resultado partial, input_required, blocked o not_available es una situación comercial para explicar, no un error técnico.',
      'El sistema compone automáticamente los precios, totales, mínimos, contenido de paquete e inclusión de etiqueta desde el resultado de las herramientas. Cuando uses get_quote o get_service_information, no escribas montos, totales, mínimos ni condiciones en tu respuesta: limítate a una transición breve y una sola pregunta de cierre; los hechos correctos se adjuntan solos. Un resultado below_minimum es una situación comercial: explica el mínimo vigente e invita a ajustar la cantidad, sin derivar por defecto.',
      'Solo recibes información ya autorizada. No reconstruyas ni infieras procesos internos, fabricación, equipamiento, químicos, proveedores, costos, márgenes, capacidad, datos de clientes o marcas maquiladas. Para solicitudes técnicas, confidenciales o formales usa get_information_boundary antes de responder; conserva una actitud comercial y ofrece un asesor cuando sea apropiado.',
      'No afirmes condiciones de pago (adelantos, plazos, porcentajes) para pedidos de agua o maquila: no están documentadas. Si preguntan por forma de pago, consulta knowledge_lookup(“payment”); si indica que no está documentada, ofrece confirmación con un asesor. La condición de 50% de adelanto corresponde únicamente al servicio de creación de logotipo.',
      'Usa prepare_handoff cuando una persona esté lista para avanzar o exista posible negociación; usa request_human_handoff solo por negociación, cierre, condición especial/no documentada, bloqueo o solicitud explícita. Cuando derives, explica que el asesor recibirá el contexto para no empezar desde cero.',
      'No menciones datos “documentados”, herramientas, JSON, sistema, políticas internas ni fuentes. Ante un saludo o cortesía, responde con calidez e inmediatamente abre la conversación comercial (una pregunta de calificación o el panorama del negocio); no te quedes solo en el saludo.',
      `MEMORIA_COMPACTA=${JSON.stringify(memory)}`,
      nextBestAction ? `SUGERENCIA_SIGUIENTE_PASO=${JSON.stringify(nextBestAction)}` : '',
      'La SUGERENCIA_SIGUIENTE_PASO es una guía, no una máquina de estados inflexible: si el mensaje actual es una pregunta directa o un cambio de tema, respóndela primero y retoma la guía después si sigue siendo natural. Si hay un pending_topic (tema interrumpido o que requiere confirmación humana), no lo pierdas: respóndelo cuando sea natural.',
    ].join('\n');
  }

  async reply({ message, state, history }) {
    const started = performance.now();
    const channel = state?.channel ?? 'local';
    const conversationHasStarted = (history?.length ?? 0) > 0;
    // Evaluación estructurada previa al turno (guía para el modelo): siguiente
    // mejor acción y etapa sugeridas desde el estado ANTERIOR al mensaje.
    const initialNextBestAction = getNextBestAction(state);
    const initialSalesStage = suggestSalesStage(state, initialNextBestAction);
    const memory = compactMemory({ ...state, salesStage: initialSalesStage });
    const turns = history.slice(-10).map((turn) => ({ role: turn.role === 'bot' ? 'assistant' : 'user', content: String(turn.text).slice(0, 700) }));
    const initialMessages = [{ role: 'system', content: this.systemPrompt(memory, initialNextBestAction, channel, conversationHasStarted) }, ...turns, { role: 'user', content: message }];
    const definitions = this.tools.listDefinitions();
    let first = await this.provider.complete({
      messages: initialMessages,
      tools: definitions, toolChoice: 'auto',
      ...GENERATION_PROFILES.decision,
    });
    const initialDecision = first;
    const protocolRetry = !first.toolCalls?.length && containsToolProtocolLeak(first.content, definitions);
    let protocolRecovery = false;
    let protocolFailure = false;
    let protocolRetryResult = null;
    if (protocolRetry) {
      first = await this.provider.complete({
        messages: [...initialMessages, { role: 'user', content: 'No expongas planificación ni nombres de herramientas. Ejecuta ahora una única herramienta autorizada y devuelve la llamada de herramienta.' }],
        tools: definitions, toolChoice: 'required',
        ...GENERATION_PROFILES.decision,
      });
      protocolRetryResult = first;
      if (!first.toolCalls?.length && containsToolProtocolLeak(first.content, definitions)) {
        const recovered = await this.provider.complete({
          messages: [...initialMessages, { role: 'user', content: 'Devuelve únicamente JSON válido con este contrato: {"tool":"nombre de herramienta autorizada","arguments":{}}. Elige la única herramienta necesaria para responder ahora; no incluyas texto adicional.' }],
          responseFormat: { type: 'json_object' }, toolChoice: 'none',
          ...GENERATION_PROFILES.decision,
        });
        try {
          const instruction = JSON.parse(recovered.content ?? '');
          const allowed = definitions.some((definition) => definition.function.name === instruction.tool);
          if (!allowed || !instruction.arguments || typeof instruction.arguments !== 'object' || Array.isArray(instruction.arguments)) throw new Error('invalid tool instruction');
          first = { ...recovered, toolCalls: [{ id: 'json_protocol_recovery_1', type: 'function', function: { name: instruction.tool, arguments: JSON.stringify(instruction.arguments) } }], toolCallFormat: 'json_protocol_recovery' };
          protocolRecovery = true;
        } catch {
          protocolFailure = true;
        }
      }
    }
    const trace = [{ phase: 'agent_decision', finishReason: first.finishReason, toolCalls: first.toolCalls?.map((call) => call.function?.name) ?? [], protocolRetry, protocolRecovery, generationProfile: 'decision', temperatureUsed: GENERATION_PROFILES.decision.temperature, maxTokensUsed: GENERATION_PROFILES.decision.maxTokens }];
    const metrics = {
      aiCallCount: protocolRecovery ? 3 : protocolRetry ? 2 : 1,
      aiLatencyMs: (initialDecision.latencyMs ?? 0) + (protocolRetryResult?.latencyMs ?? 0) + (protocolRecovery ? first.latencyMs ?? 0 : 0),
      inputTokens: (initialDecision.inputTokens ?? 0) + (protocolRetryResult?.inputTokens ?? 0) + (protocolRecovery ? first.inputTokens ?? 0 : 0),
      outputTokens: (initialDecision.outputTokens ?? 0) + (protocolRetryResult?.outputTokens ?? 0) + (protocolRecovery ? first.outputTokens ?? 0 : 0),
      toolLatencyMs: 0, tools: [],
    };
    // Recalculo determinístico del contexto final del turno (sin llamada al
    // LLM): aplica la memoria de las herramientas ejecutadas sobre el estado y
    // vuelve a decidir etapa y siguiente mejor acción sobre ese estado final.
    const buildFinalContext = (toolsList) => {
      const finalState = applyToolMemoryToState(state, toolsList);
      const finalNextBestAction = getNextBestAction(finalState);
      const finalSalesStage = suggestSalesStage(finalState, finalNextBestAction);
      return {
        finalState,
        context: {
          initial_next_best_action: initialNextBestAction.action,
          final_next_best_action: finalNextBestAction.action,
          sales_stage: finalSalesStage,
          purchase_readiness: finalState.purchaseReadiness ?? 'exploring',
          current_objection: finalState.currentObjection ?? null,
        },
      };
    };
    const finalMemory = (context) => ({
      ...memory,
      sales_stage: context.sales_stage,
      next_best_action: context.final_next_best_action,
      initial_next_best_action: context.initial_next_best_action,
    });
    if (protocolFailure) return { success: false, errorType: 'tool_protocol_invalid', trace, metrics };
    if (!first.toolCalls?.length) {
      // DECISIÓN sin herramienta: el texto de decisión (temperature 0) jamás se
      // entrega directo al prospecto. La redacción customer-facing se genera en
      // una llamada con perfil final_response (temperature 0.3), que recibe el
      // borrador de decisión como contexto y lo naturaliza.
      const decisionText = first.content?.trim() || '';
      const redactionMessages = [
        { role: 'system', content: this.systemPrompt(memory, initialNextBestAction, channel, conversationHasStarted) },
        ...turns,
        { role: 'user', content: message },
        ...(decisionText
          ? [{ role: 'assistant', content: decisionText }, { role: 'user', content: 'Redacta la respuesta final para el prospecto con naturalidad y brevedad. No menciones herramientas, procesos ni planificación; no repitas textualmente el borrador ni tus razonamientos.' }]
          : [{ role: 'user', content: 'Responde de forma natural y breve al prospecto. No menciones herramientas, procesos ni planificación.' }]),
      ];
      const redaction = await this.provider.complete({
        messages: redactionMessages, tools: [], toolChoice: 'none',
        ...GENERATION_PROFILES.final_response,
      });
      metrics.aiCallCount += 1; metrics.aiLatencyMs += redaction.latencyMs ?? 0; metrics.inputTokens += redaction.inputTokens ?? 0; metrics.outputTokens += redaction.outputTokens ?? 0;
      trace.push({ phase: 'agent_final', finishReason: redaction.finishReason, generationProfile: 'final_response', temperatureUsed: GENERATION_PROFILES.final_response.temperature, maxTokensUsed: GENERATION_PROFILES.final_response.maxTokens });
      const guarded = this.tools.exposurePolicy.guardCustomerText(redaction.content?.trim() || '');
      let text = guarded.text;
      let decisionTextFallbackUsed = false;
      if (!text && decisionText) {
        // Último recurso resiliente ante una redacción vacía: se registra para
        // auditoría que el texto proviene del borrador de decisión.
        text = this.tools.exposurePolicy.guardCustomerText(decisionText).text;
        decisionTextFallbackUsed = true;
      }
      // Un monto sin respaldo de herramienta de dinero nunca llega al prospecto.
      if (text && /S\/\s?\d/.test(text)) text = 'Permítame confirmar el precio exacto. ¿Qué presentación o servicio le interesa?';
      const { context: salesContext } = buildFinalContext([]);
      const generationContext = { channel, generation_profile: 'final_response', temperature_used: GENERATION_PROFILES.final_response.temperature, max_tokens_used: GENERATION_PROFILES.final_response.maxTokens };
      const diagnostics = { ...responseDiagnostics(text), complexMarkdown: guarded.complexMarkdown, restrictedOutputSuppressed: guarded.restrictedSuppressed, multipleQuestionsSuppressed: guarded.multipleQuestionsSuppressed ?? false, handoffCategory: null, decisionTextFallbackUsed, ...salesContext, ...generationContext };
      trace.push({ phase: 'response_policy', ...diagnostics });
      return { success: Boolean(text), text, memory: finalMemory(salesContext), trace, metrics: { ...metrics, ...diagnostics } };
    }
    const calls = first.toolCalls.slice(0, 4);
    const toolMessages = [];
    const executedCalls = [];
    let handoff = null;
    for (const call of calls) {
      let args;
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { return { success: false, errorType: 'invalid_tool_arguments', trace, metrics }; }
      const toolStarted = performance.now();
      const projected = this.tools.executeForAgent(call.function.name, args, { state, history });
      const result = projected.result;
      const latencyMs = Math.round(performance.now() - toolStarted);
      metrics.toolLatencyMs += latencyMs;
      metrics.tools.push({ name: call.function.name, args, latencyMs, resultStatus: result.status, result, exposureAudit: projected.audit });
      trace.push({ phase: 'tool_result', name: call.function.name, resultStatus: result.status, exposure: projected.audit });
      if (result.handoff_required || result.status === 'blocked' || result.status === 'human_handoff_requested') handoff = result;
      executedCalls.push({ call, result });
    }
    if (first.toolCallFormat === 'deepseek_dsml_compat') {
      toolMessages.push({
        role: 'user',
        content: `Resultado autorizado de la consulta comercial: ${sanitizeToolResult(executedCalls.map(({ call, result }) => ({ tool: call.function.name, result })))}. Responde ahora con ese resultado; no digas que vas a revisarlo ni menciones herramientas.`,
      });
    } else if (executedCalls.length) {
      toolMessages.push({ role: 'assistant', content: first.content ?? null, tool_calls: executedCalls.map(({ call }) => call) });
      for (const { call, result } of executedCalls) {
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: sanitizeToolResult(result) });
      }
    }
    const nameById = new Map(this.tools.agentCatalog().map((product) => [product.id, product.name]));
    const facts = composeCommercialFacts(metrics.tools, nameById);
    const quoteGuardInstruction = facts
      ? 'Cuando exista una cotización determinística, la transición previa solo puede ser lenguaje discursivo. No agregues hechos comerciales nuevos: nada de disponibilidad, tiempos, stock, rentabilidad, promociones, condiciones ni beneficios sin respaldo. Los hechos comerciales autorizados serán añadidos por el sistema.'
      : '';
    const final = await this.provider.complete({
      messages: [{ role: 'system', content: this.systemPrompt(memory, initialNextBestAction, channel, conversationHasStarted) }, ...turns, { role: 'user', content: message }, ...toolMessages, ...(quoteGuardInstruction ? [{ role: 'user', content: quoteGuardInstruction }] : [])],
      tools: [], toolChoice: 'none',
      ...GENERATION_PROFILES.final_response,
    });
    metrics.aiCallCount += 1; metrics.aiLatencyMs += final.latencyMs ?? 0; metrics.inputTokens += final.inputTokens ?? 0; metrics.outputTokens += final.outputTokens ?? 0;
    trace.push({ phase: 'agent_final', finishReason: final.finishReason, generationProfile: 'final_response', temperatureUsed: GENERATION_PROFILES.final_response.temperature, maxTokensUsed: GENERATION_PROFILES.final_response.maxTokens });
    const finalText = final.content?.trim() || '';
    // La pregunta de cierre también se filtra: si el modelo inventa una
    // condición comercial en ella (stock, entrega, tiempos…), se reemplaza por
    // una pregunta segura según el contexto.
    let followUp = trailingQuestion(finalText) ?? null;
    let followUpReplaced = false;
    if (followUp && (isUnsafeCommercialClaim(followUp) || /S\/\s?\d/.test(followUp))) {
      followUp = null;
      followUpReplaced = true;
    }
    if (!followUp) followUp = safeFollowUp(Boolean(facts));
    // Los hechos comerciales críticos (dinero y condiciones) son autoritativos:
    // se componen determinísticamente desde el resultado de la herramienta, no
    // desde el texto libre del modelo. El modelo aporta una transición breve
    // (solo si es lenguaje discursivo) y la pregunta de cierre.
    let groundedText;
    if (facts) {
      const transition = extractTransition(finalText);
      const separator = transition && !/[?!.]$/.test(transition) ? '. ' : ' ';
      const opener = transition ? `${transition}${separator}${facts}` : `De acuerdo. ${facts}`;
      groundedText = `${opener}\n\n${followUp}`;
    } else if (/S\/\s?\d/.test(finalText)) {
      // El modelo afirmó un monto sin respaldo de una herramienta de dinero:
      // se suprime para no arriesgar un precio inventado o incorrecto.
      groundedText = 'Permítame confirmar el precio exacto. ¿Qué presentación o servicio le interesa?';
    } else {
      // Sin facts: se conserva el texto del modelo (el guard normaliza markdown
      // y preguntas), salvo que su pregunta de cierre introduzca una condición
      // comercial no grounded: entonces se reemplaza por una pregunta segura.
      if (followUpReplaced) {
        const { body } = splitTrailingQuestion(finalText);
        groundedText = body ? `${body}\n\n${followUp}` : followUp;
      } else {
        groundedText = finalText;
      }
    }
    const guarded = this.tools.exposurePolicy.guardCustomerText(groundedText);
    const audits = metrics.tools.map((tool) => tool.exposureAudit).filter(Boolean);
    const { context: salesContext } = buildFinalContext(metrics.tools);
    const generationContext = { channel, generation_profile: 'final_response', temperature_used: GENERATION_PROFILES.final_response.temperature, max_tokens_used: GENERATION_PROFILES.final_response.maxTokens };
    const diagnostics = { ...responseDiagnostics(guarded.text, audits), complexMarkdown: guarded.complexMarkdown, restrictedOutputSuppressed: guarded.restrictedSuppressed, multipleQuestionsSuppressed: guarded.multipleQuestionsSuppressed ?? false, toolResultGroundingAdded: Boolean(facts), quoteResponseComposedLocally: Boolean(facts), handoffCategory: handoff?.context?.handoff_category ?? null, ...salesContext, ...generationContext };
    trace.push({ phase: 'response_policy', ...diagnostics });
    return {
      success: Boolean(guarded.text), text: guarded.text, memory: finalMemory(salesContext), handoff, trace,
      metrics: { ...metrics, ...diagnostics },
      totalLatencyMs: Math.round(performance.now() - started),
    };
  }
}
