import assert from 'node:assert/strict';
import test from 'node:test';
import { IntakeClassifier, deterministicClassify } from '../src/ai/intake-classifier.mjs';
import { FakeAIProvider } from '../src/ai/fake-ai-provider.mjs';

test('determinístico: captura producto, modalidad y teléfono en un mensaje libre', () => {
  const result = deterministicClassify('20 litros con mi marca, mi número es 955623069');
  assert.equal(result.conversationType, 'commercial_lead');
  assert.equal(result.extraction.product, '20l');
  assert.equal(result.extraction.modality, 'maquila');
  assert.equal(result.extraction.phone, '+51955623069');
});

test('determinístico: proveedor de marketing NO se confunde con prospecto', () => {
  const result = deterministicClassify('Somos una agencia de marketing y podemos manejar sus redes');
  assert.equal(result.conversationType, 'service_provider');
});

test('determinístico: negocio de marketing que sí compra es prospecto', () => {
  const result = deterministicClassify('Tengo una agencia de marketing y quiero botellas con nuestro logo');
  assert.equal(result.conversationType, 'commercial_lead');
  assert.equal(result.extraction.modality, 'maquila');
});

test('determinístico: mensaje ambiguo queda unclear', () => {
  const result = deterministicClassify('Somos una agencia');
  assert.equal(result.conversationType, 'unclear');
});

test('determinístico: spam no entra al flujo', () => {
  const result = deterministicClassify('Gana miles de soles haciendo clic aquí');
  assert.equal(result.conversationType, 'spam_or_irrelevant');
});

test('determinístico: una automatización de alquiler de vehículos se archiva como contexto ajeno', () => {
  const result = deterministicClassify('Servicio de alquiler de vehículos: minivan o camión de 5 toneladas');
  assert.equal(result.conversationType, 'spam_or_irrelevant');
  assert.equal(result.reasonCode, 'foreign_business_context');
});

test('determinístico: una consulta de agua que menciona reparto no se considera contexto ajeno', () => {
  const result = deterministicClassify('Necesito bidones de agua para repartir en camión');
  assert.equal(result.conversationType, 'commercial_lead');
  assert.equal(result.extraction.product, '20l');
});

test('determinístico: botellitas pequeñas no asume 625 ml', () => {
  const result = deterministicClassify('quiero poner mi logo en las botellitas pequeñas');
  assert.equal(result.conversationType, 'commercial_lead');
  assert.equal(result.extraction.product, null);
  assert.equal(result.extraction.modality, 'maquila');
});

test('IA: salida JSON estructurada se normaliza y valida', async () => {
  const provider = new FakeAIProvider([{
    conversation_type: 'commercial_lead', confidence: 1.5, reason_code: 'asks_price',
    offering_services_to_renew: false,
    extraction: { phone: '955 623 069', product: '999l', modality: 'maquila' },
    summary: 'Solicita una cotización de maquila.',
    whatsapp_draft: 'Hola. Revisé su consulta de maquila. ¿Confirmamos la presentación?',
  }]);
  const classifier = new IntakeClassifier({ provider });
  const result = await classifier.classify({ text: 'cuánto cuesta' });
  assert.equal(result.conversationType, 'commercial_lead');
  assert.equal(result.confidence, 1); // clampeado
  assert.equal(result.extraction.phone, '+51955623069'); // normalizado
  assert.equal(result.extraction.product, null); // valor no canónico descartado
  assert.equal(result.extraction.modality, 'maquila');
  assert.equal(result.analysisSource, 'ai');
  assert.equal(result.summary, 'Solicita una cotización de maquila.');
  assert.match(result.suggestedWhatsappMessage, /consulta de maquila/);
});

test('IA: si falla, cae al clasificador determinístico (fallback conservador)', async () => {
  const provider = new FakeAIProvider([new Error('API down')]);
  const classifier = new IntakeClassifier({ provider });
  const result = await classifier.classify({ text: 'quiero vender agua con mi marca' });
  assert.equal(result.conversationType, 'commercial_lead');
  assert.equal(result.extraction.modality, 'maquila');
  assert.equal(result.analysisSource, 'deterministic_fallback');
});

test('IA: conversación_type no válido se reemplaza por unclear', async () => {
  const provider = new FakeAIProvider([{ conversation_type: 'alien_invasion', confidence: 0.99, extraction: {} }]);
  const classifier = new IntakeClassifier({ provider });
  const result = await classifier.classify({ text: 'hola' });
  assert.equal(result.conversationType, 'unclear');
});

test('sin provider: usa el determinístico directamente', async () => {
  const classifier = new IntakeClassifier({ provider: null });
  const result = await classifier.classify({ text: '1 litro' });
  assert.equal(result.extraction.product, '1l');
});
