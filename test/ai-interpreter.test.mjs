import assert from 'node:assert/strict';
import test from 'node:test';
import { AIInterpreter } from '../src/ai/ai-interpreter.mjs';
import { FakeAIProvider } from '../src/ai/fake-ai-provider.mjs';
import { CommercialService } from '../src/commercial/commercial-service.mjs';

function interpreter(result) {
  return new AIInterpreter({ provider: new FakeAIProvider([result]), commercialService: new CommercialService() });
}

test('el prompt compacto exige JSON y solo conserva el último turno relevante', async () => {
  const provider = new FakeAIProvider([{
    intent: 'greeting', dialogue_act: 'greeting', confidence: 0.9,
  }]);
  const service = new CommercialService();
  const subject = new AIInterpreter({ provider, commercialService: service });
  await subject.interpret({
    message: 'Hola',
    conversationState: { modality: null, productId: null, quantity: null, district: null, salesStage: 'discovery', pendingField: null, lastTopic: null, lastAssistantAct: null, offeredOptions: [], requestedInformation: [] },
    conversationHistory: [{ role: 'user', text: 'turno anterior' }, { role: 'bot', text: 'último turno' }],
  });
  const prompt = provider.requests[0].systemPrompt;
  assert.match(prompt, /SOLO JSON válido/i);
  assert.match(prompt, /Schema válido de ejemplo/i);
  assert.match(prompt, /ULTIMO_TURNO_JSON=.*último turno/i);
  assert.doesNotMatch(prompt, /turno anterior/);
  assert.match(prompt, /CATALOGO_PERMITIDO_JSON=/);
  assert.doesNotMatch(prompt, /S\/|precio de compra|delivery gratuito/i);
});

test('normaliza aliases estructurales de mínimos sin depender de la frase del cliente', async () => {
  const paraphrases = ['¿Desde cuántos puedo iniciar?', '¿Cuál es el volumen de arranque?', '¿Qué cantidad se necesita para comenzar?'];
  for (const message of paraphrases) {
    const subject = interpreter({
      intent: 'information_request', dialogue_act: 'request_information', confidence: 0.9,
      updates: { modality: 'maquila', requested_information: [] },
      operation: { name: 'get_product_comparison', args: { modality: 'maquila', requestedInformation: 'minimum_order' } },
      missing_information: [], sales_stage: 'product_exploration', advisor_move: 'offer_next_step', response_goal: 'continue_conversation',
    });
    const result = await subject.interpret({
      message,
      conversationState: { modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: null, district: null, salesStage: 'product_exploration', pendingField: null, lastTopic: null, lastAssistantAct: null, offeredOptions: [], requestedInformation: [] },
    });
    assert.equal(result.success, true);
    assert.deepEqual(result.interpretation.requestedInformation, ['minimums']);
    assert.deepEqual(result.interpretation.operation.args.requestedInformation, ['minimums']);
  }
});

test('valida una cotización de maquila de botella de 1 L extraída por IA', async () => {
  const result = await interpreter({
    intent: 'quote', modality: 'maquila', product_id: 'maquila_botella_1l_fliptop', quantity: 40,
    district: null, additional_service_name: null, resale_product_name: null, confidence: 0.96,
  }).interpret({ message: 'Quiero 40 paquetes de botellas de litro con mi propia marca', conversationState: { stage: 'choose_family' } });

  assert.equal(result.success, true);
  assert.deepEqual(result.interpretation, {
    dialogueAct: 'request_quote', lowConfidence: false,
    intent: 'quote', modality: 'maquila', productId: 'maquila_botella_1l_fliptop', quantity: 40,
    district: null, additionalServiceName: null, resaleProductName: null, topic: null, confidence: 0.96,
    businessType: null, customerGoal: null, experienceLevel: null, requestedInformation: [], socialOpening: false, salesStage: 'discovery', advisorMove: 'quote', optionalContextMissing: [],
    operation: null, missingInformation: [], responseGoal: 'offer_quote',
  });
});

test('acepta acto conversacional inform para preferencia de distribución', async () => {
  const result = await interpreter({
    dialogue_act: 'inform', intent: 'continue', updates: { modality: 'distribution_agua_renew' },
    confidence: 0.9,
  }).interpret({ message: 'quiero vender su marca', conversationState: { stage: 'choose_family' } });
  assert.equal(result.success, true);
  assert.equal(result.interpretation.dialogueAct, 'inform');
  assert.equal(result.interpretation.modality, 'distribution_agua_renew');
});

test('conserva baja confianza válida para solicitar clarificación conversacional', async () => {
  const result = await interpreter({ intent: 'unknown', dialogue_act: 'clarify', confidence: 0.3 })
    .interpret({ message: 'algo ambiguo', conversationState: { stage: 'choose_family' } });
  assert.equal(result.success, true);
  assert.equal(result.interpretation.lowConfidence, true);
  assert.equal(result.interpretation.dialogueAct, 'clarify');
});

test('acepta una solicitud informativa parcial con topic y updates', async () => {
  const result = await interpreter({
    intent: 'information_request', topic: 'distribution_agua_renew', updates: { modality: 'distribution_agua_renew' },
    product_id: null, quantity: null, district: null, additional_service_name: null, resale_product_name: null, confidence: 0.92,
  }).interpret({ message: 'sobre distribución', conversationState: { stage: 'choose_family' } });
  assert.equal(result.success, true);
  assert.equal(result.interpretation.intent, 'information_request');
  assert.equal(result.interpretation.modality, 'distribution_agua_renew');
  assert.equal(result.interpretation.topic, 'distribution_agua_renew');
});

test('el contexto opcional faltante no invalida una intención comercial válida', async () => {
  const result = await interpreter({
    dialogue_act: 'request_information', intent: 'information_request', social_opening: true,
    updates: { modality: 'distribution_agua_renew' }, sales_stage: 'qualification', advisor_move: 'ask_need',
    missing_information: ['business_type'], confidence: 0.95,
  }).interpret({ message: 'hola, quiero distribuir su marca', conversationState: { stage: 'choose_family' } });
  assert.equal(result.success, true);
  assert.deepEqual(result.interpretation.missingInformation, []);
  assert.deepEqual(result.interpretation.optionalContextMissing, ['businessType']);
});

test('valida distribución de botella de 625 ml usando solo el catálogo interno', async () => {
  const result = await interpreter({
    intent: 'quote', modality: 'distribution_agua_renew', product_id: 'distribution_botella_625ml_rosca', quantity: 31,
    district: null, additional_service_name: null, resale_product_name: null, confidence: 0.93,
  }).interpret({ message: 'Necesito 31 paquetes de botellas de 625 para vender Agua ReNew', conversationState: { stage: 'choose_family' } });
  assert.equal(result.success, true);
  assert.equal(result.interpretation.productId, 'distribution_botella_625ml_rosca');
  assert.equal(result.interpretation.quantity, 31);
});

test('rechaza producto inventado, modalidad inventada y cantidad incoherente', async () => {
  for (const output of [
    { intent: 'quote', modality: 'maquila', product_id: 'producto_inventado', quantity: 20, confidence: 0.9 },
    { intent: 'quote', modality: 'modalidad_inventada', product_id: null, quantity: 20, confidence: 0.9 },
    { intent: 'quote', modality: 'maquila', product_id: 'maquila_botella_1l_fliptop', quantity: 2.5, confidence: 0.9 },
  ]) {
    const result = await interpreter(output).interpret({ message: 'texto', conversationState: { stage: 'choose_family' } });
    assert.equal(result.success, false);
    assert.equal(result.errorType, 'invalid_interpretation');
  }
});

test('rechaza JSON inválido y confianza fuera de rango sin llamar a CommercialService', async () => {
  const invalidJson = await interpreter('{no-json').interpret({ message: 'texto', conversationState: { stage: 'choose_family' } });
  assert.equal(invalidJson.success, false);
  assert.equal(invalidJson.errorType, 'invalid_json');

  const lowConfidence = await interpreter({ intent: 'quote', modality: null, product_id: null, quantity: null, confidence: 1.2 })
    .interpret({ message: 'texto', conversationState: { stage: 'choose_family' } });
  assert.equal(lowConfidence.success, false);
  assert.equal(lowConfidence.errorType, 'invalid_interpretation');
});

test('acepta una operación permitida y rechaza operaciones o argumentos inventados', async () => {
  const accepted = await interpreter({
    intent: 'quote', dialogue_act: 'request_quote', confidence: 0.9,
    operation: { name: 'get_purchase_price', args: { productId: 'distribution_botella_1l_fliptop', quantity: 21 } },
  }).interpret({ message: 'consulta', conversationState: { stage: 'choose_family' } });
  assert.equal(accepted.success, true);
  assert.equal(accepted.interpretation.operation.name, 'get_purchase_price');

  const comparison = await interpreter({
    intent: 'information_request', dialogue_act: 'request_information', confidence: 0.9,
    operation: { name: 'get_product_comparison', args: { modality: 'distribution_agua_renew', requestedInformation: ['prices', 'minimums'] } },
  }).interpret({ message: 'precios y mínimos de todas las presentaciones', conversationState: { stage: 'choose_family' } });
  assert.equal(comparison.success, true);
  assert.deepEqual(comparison.interpretation.requestedInformation, ['prices', 'minimums']);

  for (const operation of [
    { name: 'apply_discount', args: {} },
    { name: 'get_purchase_price', args: { productId: 'producto_inventado', quantity: 20 } },
    { name: 'get_purchase_price', args: { productId: 'distribution_botella_1l_fliptop', discount: 20 } },
  ]) {
    const result = await interpreter({ intent: 'quote', confidence: 0.9, operation })
      .interpret({ message: 'consulta', conversationState: { stage: 'choose_family' } });
    assert.equal(result.success, false);
    assert.equal(result.errorType, 'invalid_interpretation');
  }
});
