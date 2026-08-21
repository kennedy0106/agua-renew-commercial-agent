import assert from 'node:assert/strict';
import test from 'node:test';
import { CommercialAdvisorVoice } from '../src/ai/commercial-advisor-voice.mjs';
import { AIResponseComposer } from '../src/ai/ai-response-composer.mjs';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { InMemoryConversationRepository } from '../src/repository/in-memory-conversation-repository.mjs';
import { AIInterpreter } from '../src/ai/ai-interpreter.mjs';
import { FakeAIProvider } from '../src/ai/fake-ai-provider.mjs';
import { CommercialService } from '../src/commercial/commercial-service.mjs';

const thirdPerson = /el cliente (?:debe|comercializa)|el usuario (?:tiene que|puede)|el distribuidor (?:desea|compra)/i;

test('la voz comercial habla con la persona y conserva los hechos de cada modalidad', () => {
  const voice = new CommercialAdvisorVoice();
  const maquila = voice.modalityExplanation('maquila', {});
  const distribution = voice.modalityExplanation('distribution_agua_renew', {});
  const direct = voice.modalityExplanation('final_customer', {});

  assert.match(maquila, /puede comercializar agua con su propia marca/i);
  assert.match(maquila, /Nosotros nos encargamos/i);
  assert.match(distribution, /nuestra marca Agua ReNew/i);
  assert.match(distribution, /No necesita diseñar ni imprimir etiquetas personalizadas/i);
  assert.match(direct, /recarga y bidón completo de 20 L/i);
  for (const reply of [maquila, distribution, direct]) assert.doesNotMatch(reply, thirdPerson);
});

test('el compositor local presenta precios y datos autorizados con voz de asesor', () => {
  const composer = new AIResponseComposer();
  const reply = composer.composePurchasePrice({ tier: { quantity: '40 paquetes', price: { amount_pen: 1.4, per: 'botella' }, package_price_pen: 14 } });
  assert.match(reply, /le corresponde S\/ 1\.40 por botella/i);
  assert.match(reply, /S\/ 14\.00 por paquete/i);
  assert.match(reply, /podemos revisar cómo cambia el precio/i);
  assert.doesNotMatch(reply, /consulta comercial documentada|precio de compra/i);
  assert.doesNotMatch(reply, thirdPerson);
});

test('el catálogo separa modalidades y cierra con un siguiente paso comercial', () => {
  const composer = new AIResponseComposer();
  const reply = composer.composeProducts([
    { name: 'Botella Agua ReNew de 1 L', modality: 'distribution_agua_renew' },
    { name: 'Botella de 1 L con marca propia', modality: 'maquila' },
    { name: 'Bidón completo de 20 L', modality: 'final_customer' },
  ]);
  assert.match(reply, /💧 Para comercializar con nuestra marca Agua ReNew/);
  assert.match(reply, /🏷️ Para trabajar con una marca propia/);
  assert.match(reply, /🏠 Para compra directa/);
  assert.match(reply, /¿Cuál de estas opciones le interesa revisar primero\?/);
});

test('una explicación de maquila enviada por el motor usa la voz comercial centralizada', async () => {
  const repository = new InMemoryConversationRepository();
  const commercialService = new CommercialService();
  const provider = new FakeAIProvider([JSON.stringify({
    dialogue_act: 'request_information', intent: 'information_request',
    updates: { modality: 'maquila', topic: 'maquila' },
    operation: { name: 'get_commercial_modality', args: { modality: 'maquila' } },
    missing_information: [], response_goal: 'explain_modality', confidence: 0.95,
  })]);
  const engine = new ConversationEngine({
    repository, commercialService, aiInterpreter: new AIInterpreter({ provider, commercialService }),
  });
  await engine.initialize({ customerExternalId: 'voice-test', newConversation: true, mode: 'ai' });
  const result = await engine.dispatch({ type: 'submit_text', value: '¿de qué trata la maquila?' });
  const reply = result.messages.at(-1).text;
  assert.match(reply, /Con la maquila puede comercializar agua con su propia marca/i);
  assert.match(reply, /Nosotros nos encargamos de fabricar y envasar/i);
  assert.match(reply, /puedo mostrarle las presentaciones disponibles/i);
  assert.doesNotMatch(reply, thirdPerson);
});
