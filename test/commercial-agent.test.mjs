import assert from 'node:assert/strict';
import test from 'node:test';
import { CommercialService } from '../src/commercial/commercial-service.mjs';
import { CommercialToolRegistry } from '../src/ai/commercial-tool-registry.mjs';
import { CommercialAgent } from '../src/ai/commercial-agent.mjs';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { InMemoryConversationRepository } from '../src/repository/in-memory-conversation-repository.mjs';

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

test('CommercialAgent usa get_quote y devuelve solo la respuesta final del proveedor', async () => {
  const service = new CommercialService();
  const provider = scriptedProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_botella_1l_fliptop', quantity: 40 })] },
    { content: '¡Perfecto! Para 40 paquetes, ya revisé el precio que corresponde. ¿Deseas que veamos también otra presentación?' },
  ]);
  const agent = new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: service }) });
  const result = await agent.reply({ message: 'Quiero 40 paquetes de litro con mi marca', state: {}, history: [] });
  assert.equal(result.success, true);
  assert.equal(result.metrics.aiCallCount, 2);
  assert.equal(result.metrics.tools[0].name, 'get_quote');
  assert.match(result.text, /40 paquetes/i);
});

test('CommercialToolRegistry rechaza una herramienta no autorizada y no llega al dominio', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  assert.equal(registry.execute('inventar_descuento', {}).status, 'invalid_tool');
  assert.equal(registry.execute('get_product_information', { productId: 'producto_inventado' }).status, 'invalid_input');
  assert.equal(registry.execute('get_product_information', { productId: 'maquila_botella_1l_fliptop', descuento: 20 }).status, 'invalid_input');
});

test('ConversationEngine agent persiste handoff cuando una herramienta devuelve bloqueo', async () => {
  const repository = new InMemoryConversationRepository();
  const service = new CommercialService();
  const provider = scriptedProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'maquila_bidon_20l', quantity: 30, purchaseType: 'refill_with_own_container' })] },
    { content: 'Para confirmarlo bien, te pondré en contacto con un asesor.' },
  ]);
  const engine = new ConversationEngine({
    repository, commercialService: service, conversationArchitecture: 'agent',
    commercialAgent: new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: service }) }),
  });
  await engine.initialize({ customerExternalId: 'agent-handoff', channel: 'local', mode: 'ai' });
  const snapshot = await engine.dispatch({ type: 'submit_text', value: 'Quiero maquilar 30 bidones' });
  assert.equal(snapshot.state.handoffRequired, true);
  assert.equal((await repository.listHumanHandoffs(snapshot.conversationId)).length, 1);
});

test('CommercialAgent conserva contexto explícito a través de update_conversation_memory', async () => {
  const provider = scriptedProvider([
    { content: null, toolCalls: [toolCall('update_conversation_memory', { businessType: 'una bodega', customerGoal: 'vender agua' })] },
    { content: '¡Qué buena idea! Te ayudo a revisar una opción adecuada para tu bodega.' },
  ]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: 'Tengo una bodega y quiero vender agua', state: {}, history: [] });
  assert.equal(result.metrics.tools[0].args.businessType, 'una bodega');
});

test('CommercialAgent no hace segunda llamada para un saludo social sin herramienta', async () => {
  const provider = scriptedProvider([{ content: '¡Hola! Gracias por escribirnos 😊 ¿Qué te gustaría revisar hoy?' }]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: 'Hola', state: {}, history: [] });
  assert.equal(result.metrics.aiCallCount, 1);
  assert.match(result.text, /Hola/i);
});

test('catálogo amplio devuelve todas las presentaciones seguras en una sola herramienta', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  const result = registry.execute('get_product_catalog', { modality: 'distribution_agua_renew', detailLevel: 'comparison' });
  assert.ok(['ok', 'partial'].includes(result.status));
  assert.ok(result.data.products.length >= 4);
});

test('un bloqueo de un producto no elimina datos seguros del catálogo amplio', () => {
  const service = new CommercialService();
  const original = service.get_product.bind(service);
  service.get_product = (id) => id === 'maquila_galonera_10_5l'
    ? { status: 'blocked', message: 'requiere revisión', handoff_required: true }
    : original(id);
  const registry = new CommercialToolRegistry({ commercialService: service });
  const result = registry.execute('get_product_catalog', { modality: 'maquila', detailLevel: 'comparison' });
  assert.equal(result.status, 'partial');
  assert.ok(result.data.products.length > 0);
  assert.ok(result.unavailable.some((item) => item.id === 'maquila_galonera_10_5l'));
});

test('prepare_handoff produce LeadSummary solo con memoria conocida', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  const result = registry.execute('prepare_handoff', { reason: 'negotiation', pendingQuestion: 'precio especial' }, {
    state: { businessType: 'bodega', district: 'Comas', modality: 'distribution_agua_renew', productId: 'distribution_botella_625ml_rosca', quantity: 30, purchaseReadiness: 'ready_for_handoff', questionsResolved: ['presentaciones', 'precio estándar'] },
  });
  assert.equal(result.data.lead_summary.business_type, 'bodega');
  assert.equal(result.data.lead_summary.product.id, 'distribution_botella_625ml_rosca');
  assert.equal(result.data.lead_summary.pending_topic, 'precio especial');
});

test('la política de exposición elimina fuentes, procesos y escalas masivas antes del modelo', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  const projected = registry.executeForAgent('get_product_information', { productId: 'maquila_botella_1l_fliptop' });
  const serialized = JSON.stringify(projected.result);
  assert.equal(serialized.includes('source'), false);
  assert.equal(serialized.includes('Ósmosis'), false);
  assert.equal(serialized.includes('ozono'), false);
  assert.equal(serialized.includes('tiers'), false);
  assert.equal(projected.result.data.name, 'Botella de 1 L tapa fliptop con marca propia');
  assert.ok(projected.audit.restrictedFieldsRemoved.length >= 0);
});

test('el catálogo seguro no entrega ofertas ni precios completos sin cantidad', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  const projected = registry.executeForAgent('get_product_catalog', { modality: 'distribution_agua_renew', detailLevel: 'comparison' });
  const serialized = JSON.stringify(projected.result);
  assert.equal(serialized.includes('offers'), false);
  assert.equal(serialized.includes('effective_unit_cost_pen'), false);
  assert.equal(serialized.includes('source'), false);
  assert.ok(projected.result.data.products.length >= 4);
});

test('una cotización conserva únicamente la escala aplicable y no su fuente', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  const projected = registry.executeForAgent('get_quote', { productId: 'distribution_botella_625ml_rosca', quantity: 20 });
  assert.equal(projected.result.status, 'ok');
  assert.equal(projected.result.data.quantity, 20);
  assert.equal(projected.result.data.tier.package_price_pen, 9.45);
  assert.equal('source' in projected.result.data, false);
});

test('knowledge_lookup técnico se convierte en límite comercial seguro', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  const projected = registry.executeForAgent('knowledge_lookup', { topic: 'product_info' });
  assert.equal(projected.result.status, 'restricted_information');
  assert.equal(JSON.stringify(projected.result).match(/ósmosis|ozono|UV/i), null);
  assert.equal(projected.audit.technicalDetailsSuppressed, true);
});

test('la salida del agente se normaliza para WhatsApp y suprime detalles restringidos', async () => {
  const provider = scriptedProvider([{ content: '### **Proceso**\nUsamos ósmosis, UV y ozono. ¿Qué deseas? ¿Algo más?' }]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: '¿Cómo fabrican el agua?', state: {}, history: [] });
  assert.equal(result.metrics.complexMarkdown, true);
  assert.equal(result.metrics.restrictedOutputSuppressed, true);
  assert.equal(result.text.includes('ósmosis'), false);
  assert.equal(result.text.includes('###'), false);
  assert.ok(result.metrics.questionCount <= 1);
  assert.equal(result.trace.at(-1).phase, 'response_policy');
  assert.equal(result.trace.at(-1).technicalDetailsSuppressed, false);
});

test('la herramienta de límite sensible entrega una respuesta profesional sin datos reservados', () => {
  const registry = new CommercialToolRegistry({ commercialService: new CommercialService() });
  const result = registry.execute('get_information_boundary', { category: 'confidential_information_request' });
  assert.equal(result.status, 'ok');
  assert.match(result.data.approved_high_level_response, /reservada/i);
  assert.equal(JSON.stringify(result).includes('supplier'), false);
});

test('la salida WhatsApp conserva una sola pregunta útil por turno', async () => {
  const provider = scriptedProvider([{ content: 'Te puedo orientar con las presentaciones disponibles. ¿Cuál te interesa? ¿También quieres delivery?' }]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: 'Quiero información', state: {}, history: [] });
  assert.equal(result.text, 'Te puedo orientar con las presentaciones disponibles. ¿Cuál te interesa?');
  assert.equal(result.metrics.questionCount, 1);
  assert.equal(result.metrics.multipleQuestionsSuppressed, true);
});

test('el prompt prioriza cotización cuando ya existen producto y cantidad', () => {
  const agent = new CommercialAgent({
    provider: scriptedProvider([]),
    tools: new CommercialToolRegistry({ commercialService: new CommercialService() }),
  });
  assert.match(agent.systemPrompt({}), /presentación y cantidad, prioriza get_quote directamente/i);
});

test('CommercialAgent reenvía un resultado DSML autorizado para cerrar la cotización', async () => {
  const calls = [];
  const provider = {
    async complete(input) {
      calls.push(input);
      if (calls.length === 1) return { content: 'Revisaré la cotización.', toolCallFormat: 'deepseek_dsml_compat', toolCalls: [toolCall('get_quote', { productId: 'distribution_botella_625ml_rosca', quantity: 20 })], latencyMs: 1, inputTokens: 1, outputTokens: 1 };
      return { content: 'Para 20 paquetes corresponde el precio consultado.', toolCalls: [], latencyMs: 1, inputTokens: 1, outputTokens: 1 };
    },
  };
  const agent = new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) });
  await agent.reply({ message: '20 paquetes de 625 ml', state: {}, history: [] });
  assert.match(calls[1].messages.at(-1).content, /Resultado autorizado de la consulta comercial/);
});

test('CommercialAgent completa una cotización si el modelo omite el precio de la herramienta', async () => {
  const provider = scriptedProvider([
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'distribution_botella_625ml_rosca', quantity: 20 })] },
    { content: 'Ya revisé la cotización para esa cantidad.' },
  ]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: '20 paquetes de 625 ml', state: {}, history: [] });
  assert.match(result.text, /S\/ 9\.45 por paquete/);
  assert.equal(result.metrics.toolResultGroundingAdded, true);
  assert.equal(result.metrics.quoteResponseComposedLocally, true);
  assert.match(result.text, /El total es S\/ 189\.00/);
});

test('CommercialAgent reintenta el protocolo cuando el modelo escribe el nombre de una herramienta', async () => {
  const provider = scriptedProvider([
    { content: 'Ahora llamo a get_quote.' },
    { content: null, toolCalls: [toolCall('get_quote', { productId: 'distribution_botella_625ml_rosca', quantity: 20 })] },
    { content: 'Cotización lista.' },
  ]);
  const result = await new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) })
    .reply({ message: '20 paquetes de 625 ml', state: {}, history: [] });
  assert.equal(result.metrics.aiCallCount, 3);
  assert.equal(result.trace[0].protocolRetry, true);
  assert.equal(result.text.includes('get_quote'), false);
});

test('ConversationEngine persiste la categoría de handoff de una herramienta', async () => {
  const repository = new InMemoryConversationRepository();
  const provider = scriptedProvider([
    { content: null, toolCalls: [toolCall('request_human_handoff', { reason: 'condición especial', category: 'commercial_exception' })] },
    { content: 'Para revisar esa condición correctamente, un asesor puede ayudarte.' },
  ]);
  const engine = new ConversationEngine({
    repository, commercialService: new CommercialService(), conversationArchitecture: 'agent',
    commercialAgent: new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService: new CommercialService() }) }),
  });
  await engine.initialize({ customerExternalId: 'exposure-handoff', channel: 'local', mode: 'ai' });
  const snapshot = await engine.dispatch({ type: 'submit_text', value: 'Necesito una condición especial' });
  const handoff = (await repository.listHumanHandoffs(snapshot.conversationId))[0];
  assert.equal(handoff.category, 'commercial_exception');
});
