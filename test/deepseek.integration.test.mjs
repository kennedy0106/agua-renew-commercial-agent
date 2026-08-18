import assert from 'node:assert/strict';
import test from 'node:test';
import { DeepSeekProvider } from '../src/ai/deepseek-provider.mjs';
import { AIInterpreter } from '../src/ai/ai-interpreter.mjs';
import { CommercialService } from '../src/commercial/commercial-service.mjs';
import { loadEnvironment } from '../src/config/environment.mjs';

loadEnvironment();
const enabled = process.env.RUN_DEEPSEEK_TESTS === '1';

test('DeepSeek interpreta una cotización real sin devolver precio', { skip: !enabled }, async () => {
  const commercialService = new CommercialService();
  const interpreter = new AIInterpreter({
    provider: new DeepSeekProvider({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
    }),
    commercialService,
  });
  const result = await interpreter.interpret({
    message: 'Quiero 40 paquetes de botellas de litro con mi propia marca',
    conversationState: { stage: 'choose_family', modality: null, productId: null, quantity: null },
  });
  assert.equal(result.success, true);
  assert.equal(result.interpretation.intent, 'quote');
  assert.equal(result.interpretation.productId, 'maquila_botella_1l_fliptop');
  assert.equal(result.interpretation.quantity, 40);
});

test('DeepSeek generaliza paráfrasis que no figuran como ejemplos del prompt', { skip: !enabled }, async () => {
  const commercialService = new CommercialService();
  const interpreter = new AIInterpreter({
    provider: new DeepSeekProvider({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
    }),
    commercialService,
  });
  const cases = [
    ['me interesa revender Agua ReNew', 'distribution_agua_renew'],
    ['prefiero vender sus productos', 'distribution_agua_renew'],
    ['quiero distribuir lo de ustedes', 'distribution_agua_renew'],
    ['preferiría ponerle el nombre de mi negocio', 'maquila'],
  ];
  for (const [message, modality] of cases) {
    const result = await interpreter.interpret({
      message,
      conversationState: { stage: 'choose_family', modality: null, productId: null, quantity: null, district: null, pendingField: null, pendingAction: null, lastTopic: null, lastAssistantAct: null, offeredOptions: [] },
    });
    assert.equal(result.success, true);
    assert.equal(result.interpretation.modality, modality);
  }
});
