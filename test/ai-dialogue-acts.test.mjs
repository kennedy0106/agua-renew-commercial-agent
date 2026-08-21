import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { InMemoryConversationRepository } from '../src/repository/in-memory-conversation-repository.mjs';
import { AIInterpreter } from '../src/ai/ai-interpreter.mjs';
import { FakeAIProvider } from '../src/ai/fake-ai-provider.mjs';
import { CommercialService } from '../src/commercial/commercial-service.mjs';

function plan(overrides = {}) {
  return {
    intent: 'continue', dialogue_act: 'inform', updates: {}, operation: null,
    missing_information: [], response_goal: 'continue_conversation', confidence: 0.95,
    ...overrides,
  };
}

async function createEngine(replies = []) {
  const repository = new InMemoryConversationRepository();
  const commercialService = new CommercialService();
  const provider = new FakeAIProvider(replies);
  const engine = new ConversationEngine({
    repository, commercialService,
    aiInterpreter: new AIInterpreter({ provider, commercialService }),
  });
  await engine.initialize({ customerExternalId: `dialogue-${Math.random()}`, newConversation: true, mode: 'ai' });
  return { engine, provider, repository };
}

test('paráfrasis nuevas de distribución llegan a DeepSeek y aplican únicamente su plan validado', async () => {
  const paraphrases = [
    'me interesa revender Agua ReNew',
    'prefiero vender sus productos',
    'quiero distribuir lo de ustedes',
  ];
  for (const text of paraphrases) {
    const { engine, provider, repository } = await createEngine([plan({
      updates: { modality: 'distribution_agua_renew' },
      missing_information: ['productId'],
      response_goal: 'acknowledge_modality_and_ask_product',
    })]);
    const result = await engine.dispatch({ type: 'submit_text', value: text });
    assert.equal(provider.requests.length, 1);
    assert.equal(result.state.modality, 'distribution_agua_renew');
    assert.equal(result.state.pendingField, 'product');
    assert.equal(repository.turnMetrics.at(-1).resolution, 'deepseek');
  }
});

test('marca propia, acknowledgements y despedidas usan el plan conversacional de DeepSeek', async () => {
  const cases = [
    ['preferiría ponerle el nombre de mi negocio', plan({ updates: { modality: 'maquila' }, missing_information: ['productId'] }), 'maquila'],
    ['está bien', plan({ dialogue_act: 'acknowledge', response_goal: 'acknowledge' }), 'distribution_agua_renew'],
    ['hasta luego', plan({ dialogue_act: 'farewell', response_goal: 'farewell' }), null],
  ];
  for (const [text, reply, expectedModality] of cases) {
    const { engine, provider } = await createEngine([reply]);
    if (expectedModality === 'distribution_agua_renew') engine.state.modality = expectedModality;
    const result = await engine.dispatch({ type: 'submit_text', value: text });
    assert.equal(provider.requests.length, 1);
    assert.equal(result.state.modality, expectedModality);
  }
});

test('un saludo se atiende con cordialidad antes de cualquier diagnóstico comercial', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'greeting', intent: 'greeting', advisor_move: 'ask_need', sales_stage: 'discovery',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'Buenos días' });
  const reply = result.messages.at(-1).text;
  assert.match(reply, /gracias por escribirnos a Agua ReNew/i);
  assert.match(reply, /¿En qué podemos ayudarle hoy\?/i);
  assert.doesNotMatch(reply, /consumo propio o para comercializarlos/i);
});

test('un saludo combinado con una consulta conserva el saludo y la intención comercial', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'inform', intent: 'information_request', social_opening: true,
    updates: { modality: 'distribution_agua_renew', topic: 'distribution_agua_renew' },
    sales_stage: 'discovery', advisor_move: 'explain',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'hola, quiero distribuir su marca' });
  const reply = result.messages.at(-1).text;
  assert.match(reply, /^Hola, gracias por escribirnos a Agua ReNew/i);
  assert.match(reply, /Con la distribución puede adquirir productos terminados/i);
});

test('un acknowledge con modalidad y movimiento comercial no pierde el hilo de la conversación', async () => {
  const { engine, provider } = await createEngine([plan({
    dialogue_act: 'acknowledge', intent: 'slot_update',
    updates: { modality: 'distribution_agua_renew' },
    sales_stage: 'solution_presentation', advisor_move: 'ask_product',
    missing_information: ['product_id'], response_goal: 'acknowledge_modality_and_ask_product',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'quiero trabajar con su marca' });
  const reply = result.messages.at(-1).text;
  assert.match(reply, /busca comercializar productos con nuestra marca Agua ReNew/i);
  assert.match(reply, /¿qué presentación le interesa manejar?\?/i);
  assert.doesNotMatch(reply, /^De acuerdo\. Dígame qué le gustaría revisar/i);
  assert.match(provider.requests[0].systemPrompt, /ULTIMO_TURNO_JSON=/);
});

test('una modalidad ya entendida tiene prioridad sobre una pregunta genérica de necesidad', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'request_information', intent: 'information_request', social_opening: true,
    updates: { modality: 'distribution_agua_renew' }, sales_stage: 'qualification', advisor_move: 'ask_need',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'hola, quiero distribuir su marca' });
  const reply = result.messages.at(-1).text;
  assert.match(reply, /Hola, gracias por escribirnos a Agua ReNew/i);
  assert.match(reply, /busca comercializar productos con nuestra marca Agua ReNew/i);
  assert.match(reply, /¿qué presentación le interesa manejar?\?/i);
  assert.doesNotMatch(reply, /consumo propio o para comercializarlos/i);
});

test('pedir marca propia prioriza la presentación sobre una operación explicativa de modalidad', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'inform', intent: 'information_request',
    updates: { modality: 'maquila', customer_goal: 'own_brand_water' },
    operation: { name: 'get_commercial_modality', args: { modality: 'maquila' } },
    sales_stage: 'qualification', advisor_move: 'explain',
    response_goal: 'acknowledge_modality_and_ask_product',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'quiero tener mi propia marca de agua para comercializarla' });
  const reply = result.messages.at(-1);
  assert.equal(result.state.modality, 'maquila');
  assert.equal(result.state.pendingField, 'product');
  assert.match(reply.text, /trabajar con una marca propia/i);
  assert.match(reply.text, /¿qué presentación le interesa manejar?\?/i);
  assert.ok(reply.options.length > 0);
  assert.doesNotMatch(reply.text, /Si le parece, puedo mostrarle las presentaciones disponibles o revisar una cotización/i);
});

test('una aceptación ambigua retoma opciones previas y no reinicia el diagnóstico', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'clarify', intent: 'information_request',
    updates: { modality: 'maquila' },
    operation: { name: 'get_commercial_modality', args: { modality: 'maquila' } },
    sales_stage: 'qualification', advisor_move: 'clarify', response_goal: 'ask_clarification',
  })]);
  engine.state.modality = 'maquila';
  engine.state.lastAssistantAct = 'explain_modality';
  engine.state.lastTopic = 'maquila';
  engine.state.offeredOptions = [{ id: 'products_and_prices', label: 'Ver productos' }, { id: 'quote', label: 'Cotizar' }];
  const result = await engine.dispatch({ type: 'submit_text', value: 'de acuerdo' });
  const reply = result.messages.at(-1);
  assert.match(reply.text, /puedo mostrarle las presentaciones disponibles o revisar una cotización/i);
  assert.equal(reply.options.length, 2);
  assert.doesNotMatch(reply.text, /¿desea trabajar con su propia marca o comercializar productos de Agua ReNew/i);
  assert.equal(result.state.modality, 'maquila');
});

test('un acto social no descarta una modalidad y un siguiente paso comerciales', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'affirm', intent: 'slot_update',
    updates: { modality: 'maquila' }, sales_stage: 'solution_presentation', advisor_move: 'ask_product',
    missing_information: ['product_id'], response_goal: 'acknowledge_modality_and_ask_product',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'con mi propia marca' });
  const reply = result.messages.at(-1).text;
  assert.match(reply, /trabajar con una marca propia/i);
  assert.match(reply, /¿qué presentación le interesa manejar?\?/i);
  assert.doesNotMatch(reply, /^De acuerdo\. Dígame qué le gustaría revisar/i);
  assert.equal(result.state.modality, 'maquila');
  assert.equal(result.state.pendingField, 'product');
});

test('sí/no solo se resuelven localmente ante una confirmación estructurada pendiente', async () => {
  for (const [text, expectedHandoff] of [['sí', false], ['no', true]]) {
    const { engine, provider, repository } = await createEngine();
    engine.state.productId = 'maquila_bidon_20l';
    engine.state.modality = 'maquila';
    engine.state.quantity = 500;
    engine.state.pendingAction = { type: 'confirmation', options: [{ id: 'confirm_plant_collection', intent: 'quote' }] };
    const result = await engine.dispatch({ type: 'submit_text', value: text });
    assert.equal(provider.requests.length, 0);
    assert.equal(result.state.handoffRequired, expectedHandoff);
    assert.equal(repository.turnMetrics.at(-1).resolution, 'local');
  }
});

test('clarificación y unknown conversacional no se convierten en fallos técnicos', async () => {
  const clarification = await createEngine([plan({ dialogue_act: 'clarify', intent: 'unknown', response_goal: 'clarify_modality' })]);
  const clarificationResult = await clarification.engine.dispatch({ type: 'submit_text', value: 'todavía no sé cuál de las dos formas me sirve' });
  assert.match(clarificationResult.messages.at(-1).text, /propia marca|comercializar productos/i);
  assert.equal(clarification.repository.turnMetrics.at(-1).technicalFallback, false);

  const unknown = await createEngine([plan({ dialogue_act: 'unknown', intent: 'unknown', response_goal: 'unknown' })]);
  const unknownResult = await unknown.engine.dispatch({ type: 'submit_text', value: 'asdf qwe' });
  assert.match(unknownResult.messages.at(-1).text, /No llegué a entenderle bien/i);
  assert.equal(unknown.repository.turnMetrics.at(-1).resolution, 'deepseek');
  assert.equal(unknown.repository.turnMetrics.at(-1).technicalFallback, false);
});

test('ConversationEngine no contiene atajos semánticos comerciales por frase', async () => {
  const source = await readFile(new URL('../src/conversation/conversation-engine.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /quiero vender su marca|soy distribuidor|mi propia marca|sobre distribución/i);
});

test('el asesor avanza por diagnóstico y no lista productos al detectar una modalidad', async () => {
  const { engine, provider } = await createEngine([
    plan({ updates: { customer_goal: 'compra' }, sales_stage: 'discovery', advisor_move: 'ask_need' }),
    plan({ updates: { customer_goal: 'comercializar' }, sales_stage: 'qualification', advisor_move: 'ask_need' }),
    plan({ updates: { modality: 'distribution_agua_renew' }, sales_stage: 'qualification', advisor_move: 'ask_product' }),
  ]);

  let result = await engine.dispatch({ type: 'submit_text', value: 'quiero comprar productos' });
  assert.match(result.messages.at(-1).text, /consumo propio o para comercializarlos/i);

  result = await engine.dispatch({ type: 'submit_text', value: 'para vender' });
  assert.match(result.messages.at(-1).text, /propia marca|productos de Agua ReNew/i);

  result = await engine.dispatch({ type: 'submit_text', value: 'con la de ustedes' });
  const reply = result.messages.at(-1);
  assert.match(reply.text, /busca comercializar productos con nuestra marca Agua ReNew/i);
  assert.match(reply.text, /productos terminados/i);
  assert.match(reply.text, /¿Qué presentación le interesa manejar?\?/i);
  assert.doesNotMatch(reply.text, /Presentaciones documentadas|•/);
  assert.ok(reply.options.length > 0);
  assert.equal(result.state.salesStage, 'solution_presentation');
  assert.equal(provider.requests.length, 3);
});

test('el contexto de negocio persiste y una consulta explícita de productos sí puede listarlos', async () => {
  const business = await createEngine([
    plan({ updates: { business_type: 'una bodega' }, sales_stage: 'discovery', advisor_move: 'acknowledge' }),
    plan({ updates: { customer_goal: 'vender agua' }, sales_stage: 'qualification', advisor_move: 'ask_need' }),
  ]);
  let result = await business.engine.dispatch({ type: 'submit_text', value: 'tengo una bodega' });
  assert.match(result.messages.at(-1).text, /desde una bodega/i);
  assert.equal(result.state.businessType, 'una bodega');
  result = await business.engine.dispatch({ type: 'submit_text', value: 'quiero vender agua' });
  assert.match(result.messages.at(-1).text, /propia marca|productos de Agua ReNew/i);

  const products = await createEngine([plan({ intent: 'list_products', dialogue_act: 'request_information', advisor_move: 'present_options' })]);
  result = await products.engine.dispatch({ type: 'submit_text', value: '¿qué productos tienen?' });
  assert.match(result.messages.at(-1).text, /presentaciones que podemos revisar/i);
  assert.match(result.messages.at(-1).text, /•/);
});

test('la indecisión y la objeción avanzan con una única orientación consultiva', async () => {
  const undecided = await createEngine([plan({ dialogue_act: 'clarify', intent: 'unknown', sales_stage: 'discovery', advisor_move: 'clarify' })]);
  let result = await undecided.engine.dispatch({ type: 'submit_text', value: 'no sé cuál me conviene' });
  assert.match(result.messages.at(-1).text, /propia marca|comercializar productos/i);

  const objection = await createEngine([plan({ intent: 'continue', sales_stage: 'objection_handling', advisor_move: 'handle_objection' })]);
  result = await objection.engine.dispatch({ type: 'submit_text', value: 'me parece caro' });
  assert.match(result.messages.at(-1).text, /precio depende de la presentación y del volumen/i);
  assert.doesNotMatch(result.messages.at(-1).text, /descuento/i);
});

test('una consulta sobre servicios explica modalidades antes de ofrecer un catálogo', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'request_information', intent: 'information_request',
    updates: { topic: 'commercial_modalities' }, sales_stage: 'discovery', advisor_move: 'explain',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: '¿Qué servicios ofrecen?' });
  const reply = result.messages.at(-1);
  assert.match(reply.text, /Claro, con gusto le explicamos/i);
  assert.match(reply.text, /💧 Distribución con nuestra marca/i);
  assert.match(reply.text, /🏷️ Maquila \/ marca propia/i);
  assert.match(reply.text, /cuál de las dos opciones encaja mejor con su caso/i);
  assert.doesNotMatch(reply.text, /• .*Botella/);
});

test('la compra para consumo propio reconoce la necesidad y explica las dos opciones documentadas', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'inform', intent: 'slot_update',
    updates: { modality: 'final_customer', customer_goal: 'consumo propio' },
    sales_stage: 'solution_presentation', advisor_move: 'ask_product',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'quiero comprar Agua ReNew para mi consumo' });
  const reply = result.messages.at(-1);
  assert.match(reply.text, /busca Agua ReNew para su consumo/i);
  assert.match(reply.text, /Recarga de bidón de 20 L/i);
  assert.match(reply.text, /Bidón completo de 20 L/i);
  assert.match(reply.text, /Incluye envase y primera recarga/i);
  assert.match(reply.text, /¿Cuál de las dos opciones necesita\?/i);
  assert.equal(reply.options.length, 2);
});

test('una consulta multitema conserva precios y mínimos en lugar de volver a pedir presentación', async () => {
  const { engine } = await createEngine([plan({
    dialogue_act: 'request_information', intent: 'information_request',
    updates: { modality: 'distribution_agua_renew', requested_information: ['prices', 'minimums'] },
    operation: { name: 'get_product_comparison', args: { modality: 'distribution_agua_renew', requestedInformation: ['prices', 'minimums'] } },
    sales_stage: 'solution_presentation', advisor_move: 'present_options',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'quiero saber el precio y pedido mínimo de cada presentación' });
  const reply = result.messages.at(-1).text;
  assert.match(reply, /Pedido mínimo: 10 recargas/i);
  assert.match(reply, /Precio: S\/ 7\.00 por unidad/i);
  assert.match(reply, /precio cambia según la cantidad/i);
  assert.doesNotMatch(reply, /¿qué presentación le interesa manejar?/i);
});
