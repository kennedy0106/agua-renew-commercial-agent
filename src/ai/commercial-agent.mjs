function compactMemory(state = {}) {
  return {
    business_type: state.businessType ?? null, customer_goal: state.customerGoal ?? null,
    experience_level: state.experienceLevel ?? null, modality: state.modality ?? null,
    product_id: state.productId ?? null, quantity: state.quantity ?? null, district: state.district ?? null,
    last_referenced_product: state.lastReferencedProduct ?? state.productId ?? null, last_topic: state.lastTopic ?? null,
    commercial_intent: state.commercialIntent ?? null, has_brand: state.hasBrand ?? null,
    needs_design: state.needsDesign ?? null, sample_interest: state.sampleInterest ?? null,
    purchase_readiness: state.purchaseReadiness ?? 'exploring', questions_resolved: state.questionsResolved ?? [],
    pending_topic: state.pendingTopic ?? null,
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

  if (data.tier?.package_price_pen !== undefined && data.tier?.price?.amount_pen !== undefined) {
    const packagePrice = Number(data.tier.package_price_pen);
    const unit = Number(data.tier.price.amount_pen);
    const totalPart = quantity ? ` El total es S/ ${formatPEN(quantity * packagePrice)}.` : '';
    return `${label}Para ${data.quantity} paquetes, el precio aplicable es S/ ${packagePrice.toFixed(2)} por paquete (S/ ${unit.toFixed(2)} por botella).${totalPart}`;
  }
  if (data.price?.amount_pen !== undefined) {
    const unit = Number(data.price.amount_pen);
    const per = data.price.per ?? 'unidad';
    const totalPart = quantity ? ` El total para ${data.quantity} ${pluralPer(per, data.quantity)} es S/ ${formatPEN(quantity * unit)}.` : '';
    return `${label}El precio aplicable es S/ ${unit.toFixed(2)} por ${per}.${totalPart}`;
  }
  if (data.tier?.price?.amount_pen !== undefined) {
    const unit = Number(data.tier.price.amount_pen);
    const per = data.tier.price.per ?? 'unidad';
    const totalPart = quantity ? ` El total para ${data.quantity} ${pluralPer(per, data.quantity)} es S/ ${formatPEN(quantity * unit)}.` : '';
    return `${label}Para la cantidad indicada, el precio aplicable es S/ ${unit.toFixed(2)} por ${per}.${totalPart}`;
  }
  return null;
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

function containsToolProtocolLeak(content, definitions) {
  const text = String(content ?? '');
  if (text.includes('<｜｜DSML｜｜tool_calls>')) return true;
  return definitions.some((definition) => text.includes(definition.function.name));
}

export class CommercialAgent {
  constructor({ provider, tools }) { this.provider = provider; this.tools = tools; }

  systemPrompt(memory) {
    return [
      'Eres el asesor comercial virtual de primer contacto de Agua ReNew: un vendedor proactivo, no un centro de ayuda. Atiendes, educas, orientas, calificas y haces preventa; conduces la conversación hacia la venta y no negocias condiciones especiales.',
      'Sé proactivo: no esperes a que la persona sepa exactamente qué pedir. Diagnostica antes de recetar (pregunta su situación: negocio o consumo propio, tipo de negocio, volumen aproximado) y recomienda lo que más le conviene. Cada respuesta debe acercar la conversación al siguiente paso comercial (una presentación, una cotización o un asesor). Nunca respondas solo con una pregunta abierta como “¿qué necesitas?” o “¿en qué te ayudo?”: si preguntas, que sea una pregunta de calificación concreta que conduzca a una recomendación, por ejemplo “¿es para una bodega, un negocio o consumo propio?”.',
      'REGLA OBLIGATORIA DE HERRAMIENTAS: cuando el mensaje identifica una presentación y una cantidad, debes llamar get_quote antes de responder. No puedes dar una respuesta provisional, decir que revisarás ni explicar solo el empaque en lugar de una cotización. Los saludos y cortesías sin consulta comercial pueden responderse directamente.',
      'No uses get_product_catalog si la persona ya mencionó una presentación concreta o una cantidad: esa herramienta es exclusivamente para ver opciones amplias. Nunca expliques tu razonamiento, tu plan, IDs de producto ni nombres de herramientas; responde siempre como asesor directamente a la persona.',
      `CATÁLOGO_CANÓNICO_PARA_HERRAMIENTAS=${JSON.stringify(this.tools.agentCatalog())}`,
      'En get_quote usa exclusivamente un productId exacto del catálogo canónico. No coloques una presentación informal como productId. Usa purchaseType solo cuando la herramienta lo requiera; la modalidad no es un purchaseType.',
      'Usa un tono peruano profesional, cercano, seguro y consultivo. Habla con “tú” y “nosotros”; nunca hables de “el cliente”. Responde primero la duda y luego, solo si aporta valor, propone un siguiente paso pequeño y natural.',
      'Atiende como vendedor por WhatsApp: texto plano, párrafos breves y viñetas simples solo cuando ayuden. No uses títulos Markdown, tablas, separadores, negritas visibles ni bloques tipo catálogo. Una respuesta normal tiene una idea principal y, como máximo, una pregunta útil.',
      'Conocer mucho no significa decirlo todo. Entrega información de forma progresiva: panorama al inicio; presentación cuando haya interés; precio, mínimo o escala aplicable solo al conocer el producto y la cantidad; más detalle solo si la persona realmente lo pide. Los resultados de herramientas sirven para razonar, nunca debes copiarlos completos.',
      'Elige la herramienta según el siguiente paso comercial: si la persona expresa una modalidad, consulta su panorama con get_modality_overview; si identifica una presentación sin cantidad, usa get_product_information; si identifica presentación y cantidad, prioriza get_quote directamente. No sustituyas una cotización posible por una explicación de empaque o catálogo.',
      'Cuando la persona pide información de forma general o solo muestra interés (por ejemplo “quiero información”, “¿qué ofrecen?”, “cuéntame de ustedes”, “no conozco el servicio”), presenta de inmediato el panorama del negocio usando get_business_overview: las 3 rutas (maquila con tu propia marca, distribución de la marca Agua ReNew y compra directa) en una lista breve, e invita a elegir una. No te limites a preguntar “¿qué información buscas?” sin aportar nada.',
      'No eres un formulario: conserva el hilo, admite interrupciones y cambios de tema. Usa la memoria para entender el negocio, necesidad e interés. Puedes actualizarla solo con datos explícitos usando update_conversation_memory.',
      'Para cualquier hecho comercial, beneficio, precio, escala, mínimo, producto, delivery o servicio usa una herramienta de negocio aprobada. No inventes precios, promociones, descuentos, stock, rentabilidad, urgencia, crédito ni condiciones. Un resultado partial, input_required, blocked o not_available es una situación comercial para explicar, no un error técnico.',
      'El sistema compone automáticamente los precios, totales y condiciones desde el resultado de las herramientas. Cuando uses get_quote o get_service_information, no escribas montos ni totales en tu respuesta: limítate a una transición breve y una sola pregunta de cierre; el precio y el total correctos se adjuntan solos.',
      'Solo recibes información ya autorizada. No reconstruyas ni infieras procesos internos, fabricación, equipamiento, químicos, proveedores, costos, márgenes, capacidad, datos de clientes o marcas maquiladas. Para solicitudes técnicas, confidenciales o formales usa get_information_boundary antes de responder; conserva una actitud comercial y ofrece un asesor cuando sea apropiado.',
      'Usa prepare_handoff cuando una persona esté lista para avanzar o exista posible negociación; usa request_human_handoff solo por negociación, cierre, condición especial/no documentada, bloqueo o solicitud explícita. Cuando derives, explica que el asesor recibirá el contexto para no empezar desde cero.',
      'No menciones datos “documentados”, herramientas, JSON, sistema, políticas internas ni fuentes. Ante un saludo o cortesía, responde con calidez e inmediatamente abre la conversación comercial (una pregunta de calificación o el panorama del negocio); no te quedes solo en el saludo.',
      `MEMORIA_COMPACTA=${JSON.stringify(memory)}`,
    ].join('\n');
  }

  async reply({ message, state, history }) {
    const started = performance.now();
    const memory = compactMemory(state);
    const turns = history.slice(-10).map((turn) => ({ role: turn.role === 'bot' ? 'assistant' : 'user', content: String(turn.text).slice(0, 700) }));
    const initialMessages = [{ role: 'system', content: this.systemPrompt(memory) }, ...turns, { role: 'user', content: message }];
    const definitions = this.tools.listDefinitions();
    let first = await this.provider.complete({
      messages: initialMessages,
      tools: definitions, toolChoice: 'auto',
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
      });
      protocolRetryResult = first;
      if (!first.toolCalls?.length && containsToolProtocolLeak(first.content, definitions)) {
        const recovered = await this.provider.complete({
          messages: [...initialMessages, { role: 'user', content: 'Devuelve únicamente JSON válido con este contrato: {"tool":"nombre de herramienta autorizada","arguments":{}}. Elige la única herramienta necesaria para responder ahora; no incluyas texto adicional.' }],
          responseFormat: { type: 'json_object' }, toolChoice: 'none',
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
    const trace = [{ phase: 'agent_decision', finishReason: first.finishReason, toolCalls: first.toolCalls?.map((call) => call.function?.name) ?? [], protocolRetry, protocolRecovery }];
    const metrics = {
      aiCallCount: protocolRecovery ? 3 : protocolRetry ? 2 : 1,
      aiLatencyMs: (initialDecision.latencyMs ?? 0) + (protocolRetryResult?.latencyMs ?? 0) + (protocolRecovery ? first.latencyMs ?? 0 : 0),
      inputTokens: (initialDecision.inputTokens ?? 0) + (protocolRetryResult?.inputTokens ?? 0) + (protocolRecovery ? first.inputTokens ?? 0 : 0),
      outputTokens: (initialDecision.outputTokens ?? 0) + (protocolRetryResult?.outputTokens ?? 0) + (protocolRecovery ? first.outputTokens ?? 0 : 0),
      toolLatencyMs: 0, tools: [],
    };
    if (protocolFailure) return { success: false, errorType: 'tool_protocol_invalid', trace, metrics };
    if (!first.toolCalls?.length) {
      const guarded = this.tools.exposurePolicy.guardCustomerText(first.content?.trim() || '¿Qué te gustaría revisar?');
      const diagnostics = { ...responseDiagnostics(guarded.text), complexMarkdown: guarded.complexMarkdown, restrictedOutputSuppressed: guarded.restrictedSuppressed, multipleQuestionsSuppressed: guarded.multipleQuestionsSuppressed ?? false, handoffCategory: null };
      trace.push({ phase: 'response_policy', ...diagnostics });
      return { success: true, text: guarded.text, memory, trace, metrics: { ...metrics, ...diagnostics } };
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
    const final = await this.provider.complete({
      messages: [{ role: 'system', content: this.systemPrompt(memory) }, ...turns, { role: 'user', content: message }, ...toolMessages],
      tools: [], toolChoice: 'none',
    });
    metrics.aiCallCount += 1; metrics.aiLatencyMs += final.latencyMs ?? 0; metrics.inputTokens += final.inputTokens ?? 0; metrics.outputTokens += final.outputTokens ?? 0;
    trace.push({ phase: 'agent_final', finishReason: final.finishReason });
    const nameById = new Map(this.tools.agentCatalog().map((product) => [product.id, product.name]));
    const facts = composeCommercialFacts(metrics.tools, nameById);
    const finalText = final.content?.trim() || '';
    const followUp = trailingQuestion(finalText) ?? '¿Hay algo más en lo que pueda ayudarte?';
    // Los hechos comerciales críticos (dinero y condiciones) son autoritativos:
    // se componen determinísticamente desde el resultado de la herramienta, no
    // desde el texto libre del modelo. El modelo solo aporta la pregunta de cierre.
    let groundedText;
    if (facts) {
      groundedText = `Claro. ${facts}\n\n${followUp}`;
    } else if (/S\/\s?\d/.test(finalText)) {
      // El modelo afirmó un monto sin respaldo de una herramienta de dinero:
      // se suprime para no arriesgar un precio inventado o incorrecto.
      groundedText = 'Déjame confirmarte el precio exacto. ¿Me indicas qué presentación o servicio te interesa?';
    } else {
      groundedText = finalText;
    }
    const guarded = this.tools.exposurePolicy.guardCustomerText(groundedText);
    const audits = metrics.tools.map((tool) => tool.exposureAudit).filter(Boolean);
    const diagnostics = { ...responseDiagnostics(guarded.text, audits), complexMarkdown: guarded.complexMarkdown, restrictedOutputSuppressed: guarded.restrictedSuppressed, multipleQuestionsSuppressed: guarded.multipleQuestionsSuppressed ?? false, toolResultGroundingAdded: Boolean(facts), quoteResponseComposedLocally: Boolean(facts), handoffCategory: handoff?.context?.handoff_category ?? null };
    trace.push({ phase: 'response_policy', ...diagnostics });
    return {
      success: Boolean(guarded.text), text: guarded.text, memory, handoff, trace,
      metrics: { ...metrics, ...diagnostics },
      totalLatencyMs: Math.round(performance.now() - started),
    };
  }
}
