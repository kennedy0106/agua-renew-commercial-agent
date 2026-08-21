import assert from 'node:assert/strict';
import test from 'node:test';
import { CommercialService } from '../src/commercial/commercial-service.mjs';
import { CommercialToolRegistry } from '../src/ai/commercial-tool-registry.mjs';
import { CommercialAgent } from '../src/ai/commercial-agent.mjs';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { InMemoryConversationRepository } from '../src/repository/in-memory-conversation-repository.mjs';
import { getNextBestAction, suggestSalesStage, SALES_STAGES, containerCoherence } from '../src/ai/sales-context.mjs';

function scriptedProvider(responses) {
  let index = 0;
  return {
    model: 'test-agent',
    async complete(input) {
      const item = responses[index++];
      assert.ok(item, 'respuesta de proveedor faltante');
      return { latencyMs: 2, inputTokens: 10, outputTokens: 5, finishReason: 'stop', toolCalls: [], ...item, request: input };
    },
  };
}

function toolCall(name, args) {
  return { id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

async function createAgentEngine(provider) {
  const repository = new InMemoryConversationRepository();
  const service = new CommercialService();
  const engine = new ConversationEngine({
    repository, commercialService: service, conversationArchitecture: 'agent',
    commercialAgent: new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: service }) }),
  });
  await engine.initialize({ customerExternalId: `sales-${Math.random()}`, channel: 'local', mode: 'ai' });
  return engine;
}

const stateOf = (engine) => engine.snapshot().state;

// ── FASE 3 · Memoria del prospecto (sección 19) ──

test('MEM 1: "Ya tengo mi logo" registra hasLogo = true', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { hasLogo: true })] },
    { content: '¡Genial! Entonces solo nos falta definir la presentación.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Ya tengo mi logo' });
  assert.equal(stateOf(engine).hasLogo, true);
});

test('MEM 2: con hasLogo = true el siguiente paso no vuelve a preguntar por logo', async () => {
  const state = { modality: 'maquila', productId: 'maquila_botella_625ml_rosca', quantity: 20, hasLogo: true };
  const action = getNextBestAction(state);
  assert.notEqual(action.action, 'ask_logo');
  // Y el prompt prohíbe repetir datos confirmados.
  const provider = scriptedProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_625ml_rosca', quantity: 20 })] },
    { content: '¿Te gustaría revisar otra cantidad?' },
  ]);
  const agent = new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  await agent.reply({ message: 'Sí, sigue', state: { ...state, salesStage: 'quotation' }, history: [] });
  assert.match(agent.systemPrompt({ has_logo: true }, { action: 'quote' }), /NO REPITAS/);
  assert.match(agent.systemPrompt({ has_logo: true }, { action: 'quote' }), /has_logo/);
});

test('MEM 3: "Quiero 625 ml con mi marca" conserva modality y productId', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { modality: 'maquila', productId: 'maquila_botella_625ml_rosca' })] },
    { content: 'Perfecto, la de 625 ml es una gran opción para empezar.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Quiero 625 ml con mi marca' });
  assert.equal(stateOf(engine).modality, 'maquila');
  assert.equal(stateOf(engine).productId, 'maquila_botella_625ml_rosca');
});

test('MEM 4: el cambio de producto actualiza productId (no sigue cotizando el anterior)', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { modality: 'maquila', productId: 'maquila_botella_625ml_rosca' })] },
    { content: 'Listo.' },
    { content: null, toolCalls: [toolCall('update_conversation_memory', { productId: 'maquila_botella_1l_fliptop' })] },
    { content: 'Claro, actualizo a la de 1 litro.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Quiero 625 ml con mi marca' });
  await engine.dispatch({ type: 'submit_text', value: 'Mejor quisiera 1 litro' });
  assert.equal(stateOf(engine).productId, 'maquila_botella_1l_fliptop');
  assert.equal(stateOf(engine).modality, 'maquila');
});

test('MEM 5: un dato no mencionado en un turno posterior no se borra', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { quantity: 20, productId: 'maquila_botella_625ml_rosca', modality: 'maquila' })] },
    { content: 'Perfecto.' },
    { content: null, toolCalls: [toolCall('update_conversation_memory', { businessType: 'una bodega' })] },
    { content: 'Anotado.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Quiero 20 paquetes de 625 ml' });
  await engine.dispatch({ type: 'submit_text', value: 'Tengo una bodega' });
  const state = stateOf(engine);
  assert.equal(state.quantity, 20);
  assert.equal(state.productId, 'maquila_botella_625ml_rosca');
  assert.equal(state.businessType, 'una bodega');
});

test('MEM 6: dos conversaciones distintas no comparten memoria', async () => {
  const engineA = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { hasLogo: true })] },
    { content: 'Perfecto.' },
  ]));
  const engineB = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { hasBrand: true })] },
    { content: 'Perfecto.' },
  ]));
  await engineA.dispatch({ type: 'submit_text', value: 'Ya tengo mi logo' });
  await engineB.dispatch({ type: 'submit_text', value: 'Ya tengo mi marca' });
  assert.equal(stateOf(engineA).hasLogo, true);
  assert.equal(stateOf(engineA).hasBrand, null);
  assert.equal(stateOf(engineB).hasLogo, null);
  assert.equal(stateOf(engineB).hasBrand, true);
});

// ── FASE 3 · SalesStage (sección 20) ──

test('STAGE 1: "Quiero información" (interés general) → discovery', async () => {
  const { action } = getNextBestAction({});
  assert.equal(action, 'ask_modality');
  assert.equal(suggestSalesStage({}, { action }), 'discovery');
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('get_business_overview', {})] },
    { content: 'Claro, te cuento las tres rutas.' },
  ]));
  const result = await engine.dispatch({ type: 'submit_text', value: 'Quiero información' });
  assert.equal(result.messages.at(-1).role, 'bot');
  assert.equal(stateOf(engine).salesStage, 'discovery');
});

test('STAGE 2: "Quiero mi propia marca" (modalidad sin presentación) → solution_presentation', async () => {
  const { action } = getNextBestAction({ modality: 'maquila' });
  assert.equal(action, 'ask_product');
  assert.equal(suggestSalesStage({ modality: 'maquila' }, { action }), 'solution_presentation');
});

test('STAGE 3: "Quiero 20 paquetes de 625" (presentación sin cantidad) → quotation', async () => {
  const { action } = getNextBestAction({ modality: 'maquila', productId: 'maquila_botella_625ml_rosca' });
  assert.equal(action, 'ask_quantity');
  assert.equal(suggestSalesStage({ modality: 'maquila', productId: 'maquila_botella_625ml_rosca' }, { action }), 'quotation');
});

test('STAGE 4: "300 son muchas" (objeción) → objection_handling', async () => {
  const { action } = getNextBestAction({ modality: 'maquila', productId: 'maquila_bidon_20l', quantity: 300, currentObjection: 'minimum_quantity' });
  assert.equal(action, 'resolve_objection');
  assert.equal(suggestSalesStage({ currentObjection: 'minimum_quantity' }, { action }), 'objection_handling');
});

test('STAGE 5: acuerdo con datos suficientes y readiness alta → purchase_preparation', () => {
  const state = {
    modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: 20,
    quoteRequestCreated: true, purchaseReadiness: 'qualified', currentObjection: null, pendingTopic: null,
  };
  const { action } = getNextBestAction(state);
  assert.equal(action, 'prepare_purchase');
  assert.equal(suggestSalesStage(state, { action }), 'purchase_preparation');
});

test('STAGE 5b: ready_for_handoff → prepare_purchase, sin handoff automático', () => {
  const state = {
    modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: 20,
    quoteRequestCreated: true, purchaseReadiness: 'ready_for_handoff', currentObjection: null, pendingTopic: null,
  };
  const { action } = getNextBestAction(state);
  assert.equal(action, 'prepare_purchase');
  assert.notEqual(action, 'handoff');
  assert.equal(suggestSalesStage(state, { action }), 'purchase_preparation');
});

test('STAGE 5c: cotización sin readiness alta NO avanza a purchase_preparation', () => {
  const state = {
    modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: 20,
    quoteRequestCreated: true, purchaseReadiness: 'exploring', currentObjection: null, pendingTopic: null,
    salesStage: 'quotation',
  };
  const { action } = getNextBestAction(state);
  assert.notEqual(action, 'prepare_purchase');
  assert.equal(action, 'answer_current_question');
  assert.equal(suggestSalesStage(state, { action }), 'quotation');
});

test('STAGE: el enum de etapas es el especificado y excluye los viejos', () => {
  assert.deepEqual(SALES_STAGES, [
    'discovery', 'solution_presentation', 'qualification', 'quotation',
    'objection_handling', 'purchase_preparation', 'handoff',
  ]);
});

// ── FASE 4/7 · Comportamiento comercial (sección 21) ──

test('CASO 1: "Quiero mi propia marca" — el prompt obliga a aportar valor antes de calificar', () => {
  const agent = new CommercialAgent({ provider: scriptedProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const prompt = agent.systemPrompt({}, { action: 'ask_product' });
  assert.match(prompt, /PRIMERO APORTA VALOR, LUEGO CALIFICA/);
  assert.match(prompt, /explicación breve de lo que ofrece esa ruta/);
  assert.match(prompt, /No arranques con una batería de preguntas/);
  assert.doesNotMatch(prompt, /Diagnostica antes de recetar/);
  assert.match(prompt, /SUGERENCIA_SIGUIENTE_PASO/);
});

test('CASO 2: el useCase (taxista) se conserva y el prompt adapta el argumento al caso', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { useCase: 'regalar botellas a sus pasajeros', businessType: 'taxi' })] },
    { content: 'Para tu caso de taxi, la botella de 625 ml es ideal: tus pasajeros la recuerdan.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Soy taxista y quiero regalar botellas a mis pasajeros' });
  const state = stateOf(engine);
  assert.equal(state.useCase, 'regalar botellas a sus pasajeros');
  assert.equal(state.businessType, 'taxi');
  const agent = new CommercialAgent({ provider: scriptedProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const prompt = agent.systemPrompt({ use_case: 'regalar botellas a sus pasajeros' });
  assert.match(prompt, /ADAPTA EL ARGUMENTO AL CASO/);
  assert.match(prompt, /use_case/);
});

test('CASO 3: "300 son muchas" identifica objeción y no salta al cierre', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { currentObjection: 'minimum_quantity' })] },
    { content: 'Entiendo la preocupación por el volumen.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: '300 son muchas' });
  assert.equal(stateOf(engine).currentObjection, 'minimum_quantity');
  assert.equal(getNextBestAction(stateOf(engine)).action, 'resolve_objection');
  assert.notEqual(getNextBestAction(stateOf(engine)).action, 'prepare_purchase');
});

test('CASO 4: "Ya tengo logo" — no vuelve a preguntar por logo', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { hasLogo: true })] },
    { content: 'Perfecto, con eso avanzamos.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Ya tengo logo' });
  assert.equal(stateOf(engine).hasLogo, true);
  const next = getNextBestAction({ ...stateOf(engine), modality: 'maquila', productId: 'maquila_botella_625ml_rosca', quantity: 20 });
  assert.notEqual(next.action, 'ask_logo');
});

test('CASO 5: pregunta directa ("¿la etiqueta viene incluida?") se responde antes que insistir en cantidad', async () => {
  const agent = new CommercialAgent({ provider: scriptedProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const prompt = agent.systemPrompt({ product_id: 'maquila_botella_625ml_rosca' }, { action: 'ask_quantity' });
  assert.match(prompt, /Si el prospecto hace una pregunta directa o cambia de tema, responde esa pregunta primero/);
  assert.match(prompt, /La SUGERENCIA_SIGUIENTE_PASO es una guía, no una máquina de estados inflexible/);
});

test('CASO 6: pago no documentado → knowledge_lookup("payment") sin inventar y pendingTopic conservado', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('knowledge_lookup', { topic: 'payment' }), toolCall('update_conversation_memory', { pendingTopic: 'payment_method_confirmation' })] },
    { content: 'Esa condición la confirma un asesor.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: '¿Cómo se paga?' });
  assert.equal(stateOf(engine).pendingTopic, 'payment_method_confirmation');
  // La pregunta siguiente se responde y el pendingTopic no se pierde.
  await engine.dispatch({ type: 'submit_text', value: '¿Cuánto cuesta la etiqueta?' });
  assert.equal(stateOf(engine).pendingTopic, 'payment_method_confirmation');
});

test('CASO 7: el cambio de producto actualiza el contexto y no cotiza el anterior', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_625ml_rosca', quantity: 20 })] },
    { content: 'Para 20 paquetes de 625 ml.' },
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_1l_fliptop', quantity: 20 })] },
    { content: 'Para 20 paquetes de 1 litro.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Quiero 20 paquetes de 625 ml' });
  assert.equal(stateOf(engine).productId, 'maquila_botella_625ml_rosca');
  await engine.dispatch({ type: 'submit_text', value: 'Mejor 20 de 1 litro' });
  assert.equal(stateOf(engine).productId, 'maquila_botella_1l_fliptop');
});

test('CASO 8: una pregunta interrumpida conserva el pendingTopic anterior', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { pendingTopic: 'payment_method_confirmation' })] },
    { content: 'Claro.' },
    { content: null, toolCalls: [toolCall('get_product_information', { productId: 'maquila_botella_1l_fliptop' })] },
    { content: 'La de 1 litro trae 10 botellas por paquete.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: '¿Cómo se paga?' });
  await engine.dispatch({ type: 'submit_text', value: '¿Cuántas botellas trae el paquete de litro?' });
  assert.equal(stateOf(engine).pendingTopic, 'payment_method_confirmation');
  // El siguiente paso sugerido retoma el tema pendiente.
  assert.equal(getNextBestAction(stateOf(engine)).action, 'resume_pending_topic');
});

test('CASO 9: una objeción activa tiene prioridad sobre el cierre', () => {
  const state = { modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: 20, quoteRequestCreated: true, currentObjection: 'price' };
  const { action } = getNextBestAction(state);
  assert.equal(action, 'resolve_objection');
  assert.equal(suggestSalesStage(state, { action }), 'objection_handling');
});

test('CASO 10: el siguiente paso no pregunta información ya conocida', () => {
  const state = { modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: 20, hasLogo: true };
  const { action } = getNextBestAction(state);
  assert.notEqual(action, 'ask_quantity');
  assert.notEqual(action, 'ask_product');
  assert.notEqual(action, 'ask_logo');
  assert.equal(action, 'answer_current_question');
});

// ── Métricas estructuradas (sección 25) ──

test('MÉTRICAS: el turno expone contexto inicial y final estructurado sin texto privado', async () => {
  const agent = new CommercialAgent({
    provider: scriptedProvider([
      { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_1l_fliptop', quantity: 20 })] },
      { content: '¿Te gustaría revisar otra cantidad?' },
    ]),
    tools: new CommercialToolRegistry({ commercialService: new CommercialService() }),
  });
  const result = await agent.reply({
    message: 'Quiero 20 paquetes de 1 litro con mi marca',
    state: { modality: 'maquila', productId: 'maquila_botella_1l_fliptop', salesStage: 'quotation', hasLogo: true },
    history: [],
  });
  // Pre-turno: cantidad desconocida → ask_quantity.
  assert.equal(result.metrics.initial_next_best_action, 'ask_quantity');
  // Post-turno: cantidad conocida y logo confirmado → conserva la etapa (quotation).
  assert.equal(result.metrics.final_next_best_action, 'answer_current_question');
  assert.equal(result.metrics.sales_stage, 'quotation');
  assert.equal(result.metrics.purchase_readiness, 'exploring');
  assert.equal(result.metrics.current_objection, null);
  assert.equal(result.memory.sales_stage, 'quotation');
  assert.equal(result.memory.next_best_action, 'answer_current_question');
});

// ── Cierre Bloque B · hallazgos de la auditoría ──

test('DESFASE: la objeción del turno se refleja al final del MISMO turno', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { currentObjection: 'minimum_quantity' })] },
    { content: 'Entiendo la preocupación por el volumen.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: '300 son muchas' });
  const state = stateOf(engine);
  assert.equal(state.currentObjection, 'minimum_quantity');
  assert.equal(state.salesStage, 'objection_handling');
  assert.equal(getNextBestAction(state).action, 'resolve_objection');
});

test('LIMPIAR OBJECIÓN: la objeción se resuelve con el mecanismo explícito', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { currentObjection: 'minimum_quantity' })] },
    { content: 'Entendido.' },
    { content: null, toolCalls: [toolCall('update_conversation_memory', { clearCurrentObjection: true })] },
    { content: '¡Perfecto! Entonces seguimos.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: '300 son muchas' });
  assert.equal(stateOf(engine).currentObjection, 'minimum_quantity');
  await engine.dispatch({ type: 'submit_text', value: 'Ah perfecto, entonces sí me sirve' });
  const state = stateOf(engine);
  assert.equal(state.currentObjection, null);
  assert.notEqual(getNextBestAction(state).action, 'resolve_objection');
});

test('PENDING TOPIC: se conserva ante preguntas intermedias y se limpia solo al resolverse', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { pendingTopic: 'payment_method_confirmation' })] },
    { content: 'Esa condición la confirma un asesor.' },
    { content: null, toolCalls: [toolCall('get_product_information', { productId: 'maquila_botella_1l_fliptop' })] },
    { content: 'La de 1 litro trae 10 botellas por paquete.' },
    { content: null, toolCalls: [toolCall('update_conversation_memory', { clearPendingTopic: true })] },
    { content: 'Queda resuelto.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: '¿Cómo se paga?' });
  assert.equal(stateOf(engine).pendingTopic, 'payment_method_confirmation');
  // Pregunta intermedia: se responde y el pendingTopic NO se pierde.
  await engine.dispatch({ type: 'submit_text', value: '¿Cuántas botellas trae el paquete de litro?' });
  assert.equal(stateOf(engine).pendingTopic, 'payment_method_confirmation');
  // Resolución explícita del tema.
  await engine.dispatch({ type: 'submit_text', value: 'Ya me confirmaron el pago' });
  assert.equal(stateOf(engine).pendingTopic, null);
  assert.notEqual(getNextBestAction(stateOf(engine)).action, 'resume_pending_topic');
});

test('PURCHASE TYPE: get_quote con recarga persiste purchaseType y no vuelve a preguntar envases', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_bidon_20l', quantity: 50, purchaseType: 'refill_with_own_container' })] },
    { content: 'Para 50 recargas con tus bidones.' },
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_bidon_20l', quantity: 50, purchaseType: 'new_bidon_first_refill' })] },
    { content: 'Para 50 bidones nuevos.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Tengo mis propios bidones, quiero 50 recargas' });
  const state = stateOf(engine);
  assert.equal(state.purchaseType, 'refill_with_own_container');
  assert.notEqual(getNextBestAction(state).action, 'ask_container_status');
  // Equivalente con bidón nuevo.
  await engine.dispatch({ type: 'submit_text', value: 'Mejor necesito que me proporcionen los bidones' });
  assert.equal(stateOf(engine).purchaseType, 'new_bidon_first_refill');
});

test('FULFILLMENT: una herramienta válida conserva el recojo sin volver a pedirlo', async () => {
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_bidon_20l', quantity: 500, purchaseType: 'refill_with_own_container', fulfillment: 'plant_collection' })] },
    { content: 'Para esa escala el recojo es en planta.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: '500 recargas con mis bidones, recojo en planta' });
  assert.equal(stateOf(engine).fulfillment, 'plant_collection');
});

test('COHERENCIA: pares válidos y contradicción resuelta sin estado inválido persistente', async () => {
  assert.equal(containerCoherence({ hasOwnContainers: true, purchaseType: 'refill_with_own_container' }).valid, true);
  assert.equal(containerCoherence({ hasOwnContainers: false, purchaseType: 'new_bidon_first_refill' }).valid, true);
  assert.equal(containerCoherence({ hasOwnContainers: true, purchaseType: 'new_bidon_first_refill' }).valid, false);
  // Contradicción a través de herramientas: no se persiste como estado válido.
  const engine = await createAgentEngine(scriptedProvider([
    { content: null, toolCalls: [
      toolCall('update_conversation_memory', { hasOwnContainers: true }),
      toolCall('get_quote', { productId: 'maquila_bidon_20l', quantity: 50, purchaseType: 'new_bidon_first_refill' }),
    ] },
    { content: 'Reviso esa condición contigo.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Tengo bidones propios pero quiero bidones nuevos' });
  const state = stateOf(engine);
  assert.ok(!(state.hasOwnContainers === true && state.purchaseType === 'new_bidon_first_refill'));
});

test('NO CIERRE: exploring con cotización no produce prepare_purchase; qualified sí', () => {
  const exploring = {
    modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: 20,
    quoteRequestCreated: true, purchaseReadiness: 'exploring', currentObjection: null, pendingTopic: null,
  };
  assert.notEqual(getNextBestAction(exploring).action, 'prepare_purchase');
  const qualified = {
    ...exploring, purchaseReadiness: 'qualified',
  };
  assert.equal(getNextBestAction(qualified).action, 'prepare_purchase');
  // Datos incompletos bloquean incluso con readiness alta.
  const incomplete = { ...qualified, quantity: null };
  assert.notEqual(getNextBestAction(incomplete).action, 'prepare_purchase');
});
