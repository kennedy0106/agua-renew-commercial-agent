import assert from 'node:assert/strict';
import test from 'node:test';
import { CommercialService } from '../src/commercial/commercial-service.mjs';
import { CommercialToolRegistry } from '../src/ai/commercial-tool-registry.mjs';
import { CommercialAgent } from '../src/ai/commercial-agent.mjs';
import { CommercialAdvisorVoice } from '../src/ai/commercial-advisor-voice.mjs';
import { DeepSeekProvider } from '../src/ai/deepseek-provider.mjs';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { InMemoryConversationRepository } from '../src/repository/in-memory-conversation-repository.mjs';
import { getNextBestAction } from '../src/ai/sales-context.mjs';

function toolCall(name, args) {
  return { id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

/** Proveedor que registra cada llamada (temperature/maxTokens/input) y devuelve
 * respuestas programadas. */
function capturingProvider(responses) {
  const calls = [];
  let index = 0;
  return {
    model: 'test-agent',
    async complete(input) {
      calls.push({
        temperature: input.temperature ?? 0,
        maxTokens: input.maxTokens ?? null,
        toolChoice: input.toolChoice ?? null,
        systemPrompt: input.messages?.[0]?.content ?? null,
      });
      const item = responses[index++];
      assert.ok(item, 'respuesta de proveedor faltante');
      return { latencyMs: 2, inputTokens: 10, outputTokens: 5, finishReason: 'stop', toolCalls: [], ...item };
    },
    calls,
  };
}

async function createAgentEngine(provider, channel = 'local') {
  const repository = new InMemoryConversationRepository();
  const service = new CommercialService();
  const engine = new ConversationEngine({
    repository, commercialService: service, conversationArchitecture: 'agent',
    commercialAgent: new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: service }) }),
  });
  await engine.initialize({ customerExternalId: `voice-${Math.random()}`, channel, mode: 'ai' });
  return engine;
}

const stateOf = (engine) => engine.snapshot().state;

// ── FASE 5 · Perfiles de generación (sección 30) ──

test('TEMPERATURA A/B/C: decisión y recuperación a 0, redacción final a 0.3', async () => {
  const provider = capturingProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_625ml_rosca', quantity: 20 })] },
    { content: 'Ya revisé la cotización.' },
  ]);
  const agent = new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  await agent.reply({ message: 'Quiero 20 paquetes de 625 ml', state: {}, history: [] });
  // Llamada 1 (decisión/herramientas): determinista.
  assert.equal(provider.calls[0].temperature, 0);
  // Llamada 2 (redacción final): moderada.
  assert.equal(provider.calls[1].temperature, 0.3);
  assert.equal(provider.calls[1].maxTokens, 400);
});

test('TEMPERATURA C: retry de protocolo y recuperación JSON usan 0', async () => {
  const provider = capturingProvider([
    { content: 'Voy a usar get_quote para responder.' }, // fuga de protocolo → retry
    { content: 'Usaré get_quote.' },                     // sigue fugando → recovery JSON
    { content: '{"tool":"get_quote","arguments":{"productId":"maquila_botella_625ml_rosca","quantity":20}}' },
    { content: 'Listo.' },
  ]);
  const agent = new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const result = await agent.reply({ message: '20 paquetes de 625 ml', state: {}, history: [] });
  assert.equal(result.success, true);
  assert.equal(provider.calls.length, 4);
  assert.ok(provider.calls.slice(0, 3).every((call) => call.temperature === 0));
  assert.equal(provider.calls[3].temperature, 0.3);
});

test('TEMPERATURA D: DeepSeekProvider mantiene defaults retrocompatibles y acepta overrides', async () => {
  const payloads = [];
  const fetchImpl = async (_url, opts) => {
    payloads.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) };
  };
  const provider = new DeepSeekProvider({ apiKey: 'test', model: 'm', baseUrl: 'http://test', maxTokens: 4096, fetchImpl });
  await provider.complete({ messages: [{ role: 'user', content: 'hola' }] });
  assert.equal(payloads[0].temperature, 0);
  assert.equal(payloads[0].max_tokens, 4096);
  await provider.complete({ messages: [{ role: 'user', content: 'hola' }], temperature: 0.3, maxTokens: 400 });
  assert.equal(payloads[1].temperature, 0.3);
  assert.equal(payloads[1].max_tokens, 400);
});

// ── FASE 6 · Registro “usted” (sección 31) ──

test('REGISTRO: el prompt ya no obliga a “tú” y establece “usted” como predeterminado', () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const prompt = agent.systemPrompt({}, null, 'local');
  assert.doesNotMatch(prompt, /Habla con “tú” y “nosotros”/);
  assert.match(prompt, /tratamiento comercial predeterminado “usted”/);
  assert.doesNotMatch(prompt, /¿Qué presentación te interesa\?/);
});

test('REGISTRO: CommercialAdvisorVoice no contiene respuestas normales en tuteo', () => {
  const voice = new CommercialAdvisorVoice();
  const samples = [
    voice.greeting(), voice.greetingPrefix(), voice.askModality(), voice.askPurchaseGoal(),
    voice.modalityNextStep(), voice.priceConcern(), voice.indecision(), voice.acknowledge(),
    voice.productListClosing(), voice.askMoreContext(), voice.thankYou(), voice.farewell(),
    voice.explainBusinessPaths(), voice.askBrandPreference(), voice.commercialServicesOverview(),
    voice.modalityExplanation('maquila', {}), voice.modalityExplanation('distribution_agua_renew', {}),
    voice.purchasePrice({ tier: { quantity: '40 paquetes', price: { amount_pen: 1.4, per: 'botella' }, package_price_pen: 14 } }),
    voice.distributionRecognition({}), voice.maquilaRecognition({}),
    voice.directPurchaseRecognition([{ id: 'a', name: 'A', price: { includes: ['envase'] } }, { id: 'b', name: 'B' }]),
  ];
  const tuteo = /\b(te|tú|tus|tienes|quieres|estás|puedes|deseas|cuéntame|ayudarte|contigo|mostrarte)\b/i;
  const offenders = samples.filter((text) => tuteo.test(text));
  assert.deepEqual(offenders, [], `frases en tuteo: ${offenders.join(' | ')}`);
});

// ── Saludos (sección 32) ──

test('SALUDOS: primer contacto y conversación en curso se distinguen por estado', () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const first = agent.systemPrompt({}, null, 'local', false);
  const ongoing = agent.systemPrompt({}, null, 'local', true);
  assert.match(first, /Es el primer contacto/);
  assert.match(ongoing, /Es una conversación en curso/);
  assert.match(ongoing, /NO repitas saludos/);
});

// ── Nombre de perfil (sección 33) ──

test('PERFIL: el displayName no se usa automáticamente ni entra a la memoria', () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const prompt = agent.systemPrompt({}, null, 'local', false);
  assert.match(prompt, /nombre visible del perfil/);
  assert.doesNotMatch(prompt, /Sebastian/);
});

// ── Emojis (sección 34) ──

test('EMOJIS: política en el prompt y plantillas que no dependen de emoji', () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const prompt = agent.systemPrompt({}, null, 'local', true);
  assert.match(prompt, /EMOJIS moderados/);
  assert.match(prompt, /en seguimientos prefiere 0/);
  const voice = new CommercialAdvisorVoice();
  const outputs = [voice.greeting(), voice.askModality(), voice.priceConcern(), voice.acknowledge(), voice.modalityNextStep(), voice.thankYou()];
  const emojiStarts = outputs.filter((text) => /^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)).length;
  assert.equal(emojiStarts, 0, 'ninguna plantilla normal empieza con emoji');
});

// ── Canal (sección 35) ──

test('CANAL: Instagram/Messenger continúan en el mismo canal sin pedir WhatsApp; local y WhatsApp funcionan', async () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  for (const channel of ['instagram', 'messenger']) {
    const prompt = agent.systemPrompt({}, null, channel, true);
    assert.match(prompt, new RegExp(`CANAL_ACTUAL=${channel}`));
    assert.match(prompt, /no pida que le escriban por WhatsApp/);
  }
  assert.match(agent.systemPrompt({}, null, 'whatsapp', true), /CANAL_ACTUAL=whatsapp/);
  assert.match(agent.systemPrompt({}, null, 'local', true), /CANAL_ACTUAL=local/);
  // El canal llega desde el estado del engine al agente.
  const engine = await createAgentEngine(capturingProvider([
    { content: 'Hola, claro.' },
  ]), 'instagram');
  await engine.dispatch({ type: 'submit_text', value: 'Hola' });
  assert.equal(stateOf(engine).channel, 'instagram');
});

// ── Longitud (sección 36) ──

test('LONGITUD: política de brevedad en el prompt y diagnostics de wordCount', async () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  assert.match(agent.systemPrompt({}, null, 'local'), /respuesta normal de 40–90 palabras/);
  const provider = capturingProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_625ml_rosca', quantity: 20 })] },
    { content: 'Listo, revisado.' },
  ]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: '20 paquetes de 625 ml', state: {}, history: [] });
  assert.equal(typeof result.metrics.wordCount, 'number');
  assert.ok(['brief', 'standard', 'detailed'].includes(result.metrics.responseDetailLevel));
});

// ── Métricas de generación (sección 41) ──

test('MÉTRICAS: channel, generation_profile, temperature_used y max_tokens_used en diagnostics', async () => {
  const provider = capturingProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_625ml_rosca', quantity: 20 })] },
    { content: 'Revisado.' },
  ]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: '20 paquetes de 625 ml', state: { channel: 'whatsapp' }, history: [] });
  assert.equal(result.metrics.channel, 'whatsapp');
  assert.equal(result.metrics.generation_profile, 'final_response');
  assert.equal(result.metrics.temperature_used, 0.3);
  assert.equal(result.metrics.max_tokens_used, 400);
});

// ── Escenarios de conversación (sección 37) ──

test('CASO 1: "Quiero mi propia marca" — usted, valor primero y pregunta de presentación', () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const prompt = agent.systemPrompt({ modality: null }, { action: 'ask_modality' }, 'local', false);
  assert.match(prompt, /tratamiento comercial predeterminado “usted”/);
  assert.match(prompt, /PRIMERO APORTA VALOR/);
  assert.match(prompt, /Es el primer contacto/);
});

test('CASO 2: "Ya tengo logo" — se reconoce, no vuelve a preguntar y sin emoji innecesario', async () => {
  const engine = await createAgentEngine(capturingProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { hasLogo: true })] },
    { content: 'Perfecto, con eso avanzamos.' },
    { content: null, toolCalls: [toolCall('update_conversation_memory', { productId: 'maquila_botella_625ml_rosca', quantity: 20, modality: 'maquila' })] },
    { content: 'Reviso la cotización.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Ya tengo logo' });
  assert.equal(stateOf(engine).hasLogo, true);
  await engine.dispatch({ type: 'submit_text', value: 'Quiero 20 paquetes de 625 ml' });
  const state = stateOf(engine);
  assert.notEqual(getNextBestAction(state).action, 'ask_logo');
});

test('CASO 3: taxista — habla directamente con la persona y usa beneficio contextual', async () => {
  const engine = await createAgentEngine(capturingProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { useCase: 'regalar botellas a sus pasajeros', businessType: 'taxi' })] },
    { content: 'Para su caso de taxi, las botellas dejan una muy buena impresión en los pasajeros.' },
  ]));
  await engine.dispatch({ type: 'submit_text', value: 'Soy taxista y quiero dar botellas a mis pasajeros' });
  assert.equal(stateOf(engine).useCase, 'regalar botellas a sus pasajeros');
  assert.equal(stateOf(engine).businessType, 'taxi');
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  assert.match(agent.systemPrompt({ use_case: 'regalar botellas a sus pasajeros' }), /nunca digas “el cliente”/);
});

test('CASO 4: "¿Cuánto cuesta?" con contexto — respuesta directa con hechos, sin cierre prematuro', async () => {
  const provider = capturingProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_625ml_rosca', quantity: 20 })] },
    { content: '¿Desea que revisemos otra cantidad?' },
  ]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: '¿Cuánto cuesta?', state: { modality: 'maquila', productId: 'maquila_botella_625ml_rosca', quantity: 20, salesStage: 'quotation', purchaseReadiness: 'exploring' }, history: [] });
  assert.match(result.text, /S\/ 12\.00 por paquete/);
  assert.equal(result.metrics.final_next_best_action, 'answer_current_question');
  assert.notEqual(result.metrics.final_next_best_action, 'prepare_purchase');
});

test('CASO 5: segundo/tercer turno — no repite la presentación de Agua ReNew', () => {
  const agent = new CommercialAgent({ provider: capturingProvider([]), tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  const ongoing = agent.systemPrompt({ modality: 'maquila', product_id: 'maquila_botella_625ml_rosca' }, null, 'local', true);
  assert.match(ongoing, /NO repitas saludos/);
  assert.match(ongoing, /evita “Hola”, “Gracias por escribirnos”/);
});
