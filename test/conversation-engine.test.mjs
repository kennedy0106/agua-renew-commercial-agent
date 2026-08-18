import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { InMemoryConversationRepository } from '../src/repository/in-memory-conversation-repository.mjs';

async function createEngine({ repository = new InMemoryConversationRepository(), customerExternalId = 'test-customer' } = {}) {
  const engine = new ConversationEngine({ repository });
  await engine.initialize({ customerExternalId });
  return { engine, repository };
}

async function choose(engine, type, value) {
  return engine.dispatch({ type, value });
}

test('inicia con presentaciones obtenidas desde CommercialService', async () => {
  const { engine } = await createEngine();
  const snapshot = engine.snapshot();
  assert.equal(snapshot.state.stage, 'choose_family');
  assert.ok(snapshot.messages[0].options.length >= 4);
  assert.ok(snapshot.messages[0].options.every((option) => option.event.type === 'select_family'));
});

test('resuelve una cotización determinística de distribución de botella de 1 L', async () => {
  const { engine, repository } = await createEngine();
  await choose(engine, 'select_family', 'botella_1l_fliptop');
  await choose(engine, 'select_modality', 'distribution_agua_renew');
  const result = await choose(engine, 'submit_quantity', '10');

  assert.equal(result.state.stage, 'complete');
  assert.match(result.messages.at(-1).text, /S\/ 1\.40/);
  assert.match(result.messages.at(-1).text, /S\/ 14\.00/);
  assert.equal(repository.quoteRequests.length, 1);
  assert.deepEqual(repository.quoteRequests[0].validatedData, {
    modality: 'distribution_agua_renew', purchaseType: null, fulfillment: null,
  });
});

test('convierte input_required en solicitud de cantidad', async () => {
  const { engine } = await createEngine();
  await choose(engine, 'select_family', 'bidon_20l');
  await choose(engine, 'select_modality', 'maquila');
  const result = await engine.dispatch({ type: 'submit_quantity', value: '' });

  assert.equal(result.state.stage, 'await_quantity');
  assert.match(result.messages.at(-1).text, /cantidad/i);
  assert.equal(result.state.handoffRequired, false);
});

test('muestra derivación visual y persiste handoff cuando CommercialService bloquea', async () => {
  const { engine, repository } = await createEngine();
  await choose(engine, 'select_family', 'bidon_20l');
  await choose(engine, 'select_modality', 'maquila');
  const result = await choose(engine, 'submit_quantity', '30');

  assert.equal(result.state.stage, 'handoff');
  assert.equal(result.state.handoffRequired, true);
  assert.equal(result.messages.at(-1).kind, 'handoff');
  assert.equal(repository.humanHandoffs.length, 1);
  assert.deepEqual(repository.humanHandoffs[0].ambiguityIds, ['maquila_20l_minimum']);
});

test('permite cambiar a recojo en planta después de una escala de más de 400 recargas', async () => {
  const { engine } = await createEngine();
  await choose(engine, 'select_family', 'bidon_20l');
  await choose(engine, 'select_modality', 'maquila');
  await choose(engine, 'submit_quantity', '500');
  assert.equal(engine.snapshot().state.stage, 'await_purchase_type');

  await choose(engine, 'select_purchase_type', 'refill_with_own_container');
  assert.equal(engine.snapshot().state.stage, 'await_fulfillment');

  const confirmation = await choose(engine, 'select_fulfillment', 'authorized_collection_point');
  assert.equal(confirmation.state.stage, 'await_fulfillment_confirmation');
  assert.match(confirmation.messages.at(-1).text, /recojo en planta/i);

  const complete = await choose(engine, 'change_to_plant_collection');
  assert.equal(complete.state.stage, 'complete');
  assert.match(complete.messages.at(-1).text, /S\/ 5\.80/);
});

test('“sí” confirma localmente el cambio de recojo cuando es la única acción pendiente', async () => {
  const { engine, repository } = await createEngine();
  await choose(engine, 'select_family', 'bidon_20l');
  await choose(engine, 'select_modality', 'maquila');
  await choose(engine, 'submit_quantity', '500');
  await choose(engine, 'select_purchase_type', 'refill_with_own_container');
  await choose(engine, 'select_fulfillment', 'authorized_collection_point');
  const complete = await choose(engine, 'submit_text', 'sí');
  assert.equal(complete.state.stage, 'complete');
  assert.equal(complete.state.fulfillment, 'plant_collection');
  assert.equal(repository.turnMetrics.at(-1).resolution, 'local');
  assert.equal(repository.turnMetrics.at(-1).aiCallCount, 0);
});

test('recupera conversación, estado y mensajes después de recrear ConversationEngine', async () => {
  const repository = new InMemoryConversationRepository();
  const first = await createEngine({ repository, customerExternalId: 'persistent-customer' });
  await choose(first.engine, 'select_family', 'botella_625ml_rosca');
  await choose(first.engine, 'select_modality', 'maquila');
  await choose(first.engine, 'submit_quantity', '20');
  const original = first.engine.snapshot();

  const resumed = await createEngine({ repository, customerExternalId: 'persistent-customer' });
  const recovered = resumed.engine.snapshot();
  assert.equal(recovered.conversationId, original.conversationId);
  assert.equal(recovered.state.stage, 'complete');
  assert.deepEqual(recovered.messages, original.messages);
  assert.equal(repository.messages.filter((message) => message.direction === 'inbound').length, 3);
  assert.ok(repository.messages.filter((message) => message.direction === 'outbound').length >= 4);
});

test('reinicia la conversación actual y una nueva prueba crea otra conversación', async () => {
  const repository = new InMemoryConversationRepository();
  const { engine } = await createEngine({ repository, customerExternalId: 'reset-customer' });
  const firstConversationId = engine.snapshot().conversationId;
  await choose(engine, 'select_family', 'botella_1l_fliptop');
  const reset = await engine.dispatch({ type: 'restart' });
  assert.equal(reset.conversationId, firstConversationId);
  assert.equal(reset.state.stage, 'choose_family');
  assert.ok(reset.messages.length > 1);

  const newConversation = await engine.dispatch({ type: 'new_test_conversation' });
  assert.notEqual(newConversation.conversationId, firstConversationId);
  assert.equal(newConversation.state.stage, 'choose_family');
  assert.equal(repository.conversations.length, 2);
});

test('mantiene conversaciones separadas para dos clientes de prueba', async () => {
  const repository = new InMemoryConversationRepository();
  const first = await createEngine({ repository, customerExternalId: 'customer-a' });
  const second = await createEngine({ repository, customerExternalId: 'customer-b' });
  assert.notEqual(first.engine.snapshot().customerId, second.engine.snapshot().customerId);
  assert.notEqual(first.engine.snapshot().conversationId, second.engine.snapshot().conversationId);
  assert.equal(repository.customers.length, 2);
});
