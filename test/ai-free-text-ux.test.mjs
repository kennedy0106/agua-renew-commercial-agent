import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { InMemoryConversationRepository } from '../src/repository/in-memory-conversation-repository.mjs';
import { AIInterpreter } from '../src/ai/ai-interpreter.mjs';
import { FakeAIProvider } from '../src/ai/fake-ai-provider.mjs';
import { CommercialService } from '../src/commercial/commercial-service.mjs';

function interpretation(overrides = {}) {
  return {
    intent: 'quote', modality: null, product_id: null, quantity: null, district: null,
    additional_service_name: null, resale_product_name: null, confidence: 0.95, ...overrides,
  };
}

async function createEngine(results = [], { mode = 'ai' } = {}) {
  const repository = new InMemoryConversationRepository();
  const commercialService = new CommercialService();
  const provider = new FakeAIProvider(results);
  const engine = new ConversationEngine({
    repository,
    commercialService,
    aiInterpreter: new AIInterpreter({ provider, commercialService }),
  });
  await engine.initialize({ customerExternalId: `free-text-${Math.random()}`, newConversation: true, mode });
  return { engine, provider };
}

test('una conversación IA nueva espera el primer mensaje y acepta texto libre sin botones', async () => {
  const { engine, provider } = await createEngine([interpretation({ intent: 'greeting' })]);
  const initial = engine.snapshot();
  assert.equal(initial.state.mode, 'ai');
  assert.equal(initial.messages.length, 0);

  const result = await engine.dispatch({ type: 'submit_text', value: 'Hola' });
  assert.equal(provider.requests.length, 1);
  assert.equal(provider.requests[0].userMessage, 'Hola');
  assert.match(result.messages.at(-1).text, /Podemos ayudarle/i);
});

test('una cotización IA completa por texto no solicita pasos o botones redundantes', async () => {
  const { engine, provider } = await createEngine([interpretation({
    modality: 'maquila', product_id: 'maquila_botella_1l_fliptop', quantity: 40,
  })]);
  const result = await engine.dispatch({ type: 'submit_text', value: 'Necesito 40 paquetes de botellas de litro con mi marca' });
  assert.equal(provider.requests.length, 1);
  assert.equal(result.state.stage, 'complete');
  assert.match(result.messages.at(-1).text, /S\/ 1\.40/);
  assert.doesNotMatch(result.messages.at(-1).text, /¿Cuántos paquetes necesita??\?/);
});

test('en IA se pregunta solo el producto y luego solo la cantidad que falta', async () => {
  const { engine } = await createEngine([interpretation({ modality: 'maquila' })]);
  const missingProduct = await engine.dispatch({ type: 'submit_text', value: 'Quiero vender agua con mi propia marca' });
  assert.equal(missingProduct.state.stage, 'choose_product');
  assert.match(missingProduct.messages.at(-1).text, /presentación le interesa/i);

  const afterProduct = await engine.dispatch({ type: 'select_product', value: 'maquila_botella_1l_fliptop' });
  assert.equal(afterProduct.state.stage, 'await_quantity');
  assert.match(afterProduct.messages.at(-1).text, /¿Cuántos paquetes necesita??\?/);
});

test('una respuesta corta IA completa la cantidad pendiente usando el estado conversacional', async () => {
  const { engine, provider } = await createEngine([
    interpretation({ modality: 'maquila', product_id: 'maquila_botella_1l_fliptop' }),
  ]);
  await engine.dispatch({ type: 'submit_text', value: 'Quiero botellas de litro con mi marca' });
  const result = await engine.dispatch({ type: 'submit_text', value: '40' });
  assert.equal(provider.requests.length, 1);
  assert.equal(result.state.stage, 'complete');
  assert.equal(result.state.productId, 'maquila_botella_1l_fliptop');
  assert.equal(result.state.quantity, 40);
  assert.match(result.messages.at(-1).text, /S\/ 14\.00/);
});

test('los shortcuts IA son acciones estructuradas y pueden combinarse con selección y texto', async () => {
  const { engine, provider } = await createEngine();
  await engine.dispatch({ type: 'apply_ai_goal', value: 'quote' });
  await engine.dispatch({ type: 'select_modality', value: 'maquila' });
  const afterProduct = await engine.dispatch({ type: 'select_product', value: 'maquila_botella_1l_fliptop' });
  const result = await engine.dispatch({ type: 'submit_text', value: '40' });
  assert.equal(provider.requests.length, 0);
  assert.equal(afterProduct.state.stage, 'await_quantity');
  assert.equal(result.state.stage, 'complete');
});

test('el flujo determinístico conserva su comportamiento y no llama al intérprete', async () => {
  const { engine, provider } = await createEngine([interpretation({ intent: 'greeting' })], { mode: 'deterministic' });
  const initial = engine.snapshot();
  assert.equal(initial.state.mode, 'deterministic');
  assert.ok(initial.messages.at(-1).options.length > 0);

  const result = await engine.dispatch({ type: 'submit_text', value: 'Hola' });
  assert.equal(provider.requests.length, 0);
  assert.match(result.messages.at(-1).text, /selecciona una de las opciones/i);
});
