import assert from 'node:assert/strict';
import test from 'node:test';
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

async function createEngine(replies) {
  const repository = new InMemoryConversationRepository();
  const commercialService = new CommercialService();
  const provider = new FakeAIProvider(replies);
  const engine = new ConversationEngine({
    repository, commercialService,
    aiInterpreter: new AIInterpreter({ provider, commercialService }),
  });
  await engine.initialize({ customerExternalId: `partial-${Math.random()}`, newConversation: true, mode: 'ai' });
  return { engine, provider, repository };
}

test('DeepSeek completa referencias parciales usando el contexto compacto', async () => {
  const { engine, provider } = await createEngine([
    plan({ updates: { modality: 'distribution_agua_renew' }, missing_information: ['productId'] }),
    plan({ updates: { product_id: 'distribution_botella_625ml_rosca' }, missing_information: ['quantity'] }),
  ]);
  await engine.dispatch({ type: 'submit_text', value: 'me interesa revender sus productos' });
  const result = await engine.dispatch({ type: 'submit_text', value: 'las más pequeñas' });
  assert.equal(result.state.productId, 'distribution_botella_625ml_rosca');
  assert.equal(result.state.pendingField, 'quantity');
  assert.equal(provider.requests.length, 2);
  assert.match(provider.requests[1].systemPrompt, /"modality":"distribution_agua_renew"/);
  assert.match(provider.requests[1].systemPrompt, /"pending_field":"product"/);
});

test('cantidad aislada con pending_field=quantity sigue siendo una operación local segura', async () => {
  const { engine, provider, repository } = await createEngine([plan({
    intent: 'quote', dialogue_act: 'request_quote',
    updates: { modality: 'distribution_agua_renew', product_id: 'distribution_botella_1l_fliptop' },
    missing_information: ['quantity'], response_goal: 'ask_quantity',
  })]);
  await engine.dispatch({ type: 'submit_text', value: 'quisiera llevar agua de litro para revender' });
  const result = await engine.dispatch({ type: 'submit_text', value: '40 paquetes' });
  assert.equal(provider.requests.length, 1);
  assert.equal(result.state.quantity, 40);
  assert.equal(result.state.stage, 'complete');
  assert.equal(repository.turnMetrics.at(-1).resolution, 'local');
});

test('el plan puede solicitar precio, pero CommercialService produce el resultado', async () => {
  const { engine, provider } = await createEngine([plan({
    intent: 'quote', dialogue_act: 'request_quote',
    updates: { modality: 'distribution_agua_renew', product_id: 'distribution_botella_1l_fliptop', quantity: 21 },
    operation: { name: 'get_purchase_price', args: { productId: 'distribution_botella_1l_fliptop', quantity: 21 } },
    response_goal: 'offer_quote',
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'si llevo más cantidad sale mejor?' });
  assert.equal(provider.requests.length, 1);
  assert.match(result.messages.at(-1).text, /te corresponde/i);
  assert.match(result.messages.at(-1).text, /S\/ 1\.30/);
});

test('un fallo técnico no intenta sustituir DeepSeek con reglas semánticas locales', async () => {
  const { engine, repository } = await createEngine([new Error('timeout')]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'yo quiero comprarles para luego vender' });
  assert.match(result.messages.at(-1).text, /no pude procesar tu consulta/i);
  assert.equal(result.state.modality, null);
  assert.equal(repository.turnMetrics.at(-1).resolution, 'deepseek');
  assert.equal(repository.turnMetrics.at(-1).technicalFallback, true);
});

test('las opciones de la interfaz son acciones estructuradas y no frases interpretadas', async () => {
  const { engine, provider } = await createEngine();
  const result = await engine.dispatch({ type: 'apply_ai_goal', value: 'quote' });
  assert.equal(provider.requests.length, 0);
  assert.equal(result.state.pendingField, 'modality');
  assert.match(result.messages.at(-1).text, /propia marca|Agua ReNew/i);
});
