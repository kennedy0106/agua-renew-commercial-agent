import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { LeadProcessor } from '../src/meta/lead-processor.mjs';
import { ConversationObserver } from '../src/meta/conversation-observer.mjs';
import { ObserverLeadService } from '../src/leads/observer-lead-service.mjs';
import { LeadsApi } from '../src/admin/leads-api.mjs';

function setup() {
  const repository = new InMemoryLeadRepository();
  const processor = new LeadProcessor({ repository });
  return { repository, processor, observer: new ConversationObserver({ repository, processor }) };
}

test('observer acumula producto, modalidad y teléfono antes de marcar listo', async () => {
  const { observer } = setup();
  const base = { channel: 'instagram', sourceConversationId: 'u-1', sourceOrigin: 'organic_dm', direction: 'inbound', actorType: 'user' };
  let result = await observer.observe({ ...base, externalMessageId: 'm1', text: 'Quiero bidones de 20 litros' });
  assert.equal(result.lead.status, 'COLLECTING');
  result = await observer.observe({ ...base, externalMessageId: 'm2', text: 'con la marca de ustedes' });
  assert.equal(result.lead.status, 'WAITING_PHONE');
  result = await observer.observe({ ...base, externalMessageId: 'm3', text: 'Mi WhatsApp es 955623069' });
  assert.equal(result.lead.status, 'READY_FOR_WHATSAPP');
  assert.equal(result.lead.product, '20l');
  assert.equal(result.lead.modality, 'distribution_agua_renew');
  assert.equal(result.lead.phoneE164, '+51955623069');
});

test('observer usa el último teléfono explícito y conserva auditoría', async () => {
  const { observer, repository } = setup();
  const base = { channel: 'facebook_messenger', sourceConversationId: 'u-2', direction: 'inbound', actorType: 'user' };
  const first = await observer.observe({ ...base, externalMessageId: 'p1', text: '20 litros con mi marca, 955623069' });
  await observer.observe({ ...base, externalMessageId: 'p2', text: 'Corrección: 999888777' });
  const lead = await repository.findLeadById(first.lead.id);
  assert.equal(lead.phoneE164, '+51999888777');
  assert.equal((await repository.listPhoneHistory(lead.id)).length, 2);
});

test('observer no marca listo cuando falta producto o modalidad', async () => {
  const { observer } = setup();
  const result = await observer.observe({ channel: 'instagram', sourceConversationId: 'u-3', direction: 'inbound', externalMessageId: 'x1', text: 'Mi número es 955623069' });
  assert.equal(result.lead.status, 'COLLECTING');
});

test('observer reconoce galonera de 10.5 L y reemplaza una presentación anterior', async () => {
  const { observer } = setup();
  const base = { channel: 'facebook_messenger', sourceConversationId: 'u-10-5', direction: 'inbound', actorType: 'user' };
  await observer.observe({ ...base, externalMessageId: 'g1', text: 'Quiero bidones de 20 litros con mi marca' });
  const result = await observer.observe({ ...base, externalMessageId: 'g2', text: 'Corrección: prefiero galoneras de 10.5 L, mi WhatsApp es 955623069' });
  assert.equal(result.lead.product, '10_5l');
  assert.equal(result.lead.status, 'READY_FOR_WHATSAPP');
});

test('observer entrega el transcript completo a la IA y persiste su borrador', async () => {
  const repository = new InMemoryLeadRepository();
  const calls = [];
  const classifier = { classify: async (input) => {
    calls.push(input);
    return {
      conversationType: 'commercial_lead', confidence: 0.96, analysisSource: 'ai', provider: 'compatible', model: 'model-x',
      extraction: { phone: '+51955623069', product: '625ml', modality: 'maquila' },
      summary: 'Busca botellas de 625 ml con marca propia.',
      suggestedWhatsappMessage: 'Hola, Ana. Revisé tu consulta por botellas de 625 ml con tu marca. ¿Coordinamos la cantidad?',
    };
  } };
  const observer = new ConversationObserver({ repository, processor: new LeadProcessor({ repository, classifier }) });
  const base = { channel: 'facebook_messenger', sourceConversationId: 'ai-1', direction: 'inbound', actorType: 'user', sender: { username: 'Ana' } };
  await observer.observe({ ...base, externalMessageId: 'a1', text: 'Quiero botellas con mi logo' });
  const result = await observer.observe({ ...base, externalMessageId: 'a2', text: 'Mi número es 955623069' });
  assert.equal(calls.at(-1).messages.length, 2);
  assert.equal(result.lead.analysisSource, 'ai');
  assert.equal(result.lead.analysisModel, 'model-x');
  assert.match(result.lead.suggestedWhatsappMessage, /625 ml/);
  assert.equal(result.lead.status, 'READY_FOR_WHATSAPP');
});

test('observer puede confirmar el webhook antes de terminar el análisis de IA', async () => {
  const repository = new InMemoryLeadRepository();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const classifier = { classify: async () => {
    await gate;
    return { conversationType: 'commercial_lead', confidence: 0.9, analysisSource: 'ai', provider: 'test', model: 'slow-model', extraction: { phone: null, product: '20l', modality: null } };
  } };
  const observer = new ConversationObserver({ repository, processor: new LeadProcessor({ repository, classifier }) });
  const observed = await observer.observe({ channel: 'facebook_messenger', sourceConversationId: 'deferred-1', direction: 'inbound', externalMessageId: 'deferred-message', text: 'Quiero bidones', deferProcessing: true });
  assert.equal(observed.deferred, true);
  assert.equal(observed.lead.processingVersion, null);
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const processed = await repository.findLeadById(observed.lead.id);
  assert.equal(processed.analysisSource, 'ai');
  assert.equal(processed.product, '20l');
});

test('observer cierra una conversación cuya automatización pertenece claramente a otro rubro', async () => {
  const { observer } = setup();
  const base = { channel: 'facebook_messenger', sourceConversationId: 'foreign-1', sourceOrigin: 'imported' };
  await observer.observe({ ...base, direction: 'outbound', actorType: 'meta_business_agent', externalMessageId: 'foreign-out', text: 'Servicio de alquiler de vehículos: minivan o camión de 5 toneladas' });
  const result = await observer.observe({ ...base, direction: 'inbound', actorType: 'user', externalMessageId: 'foreign-in', text: '👍' });
  assert.equal(result.lead.conversationType, 'spam_or_irrelevant');
  assert.equal(result.lead.status, 'CLOSED');
});

test('API observer rechaza todas las rutas de escritura hacia Meta', async () => {
  const { repository } = setup();
  const service = new ObserverLeadService({ repository });
  const api = new LeadsApi({ leadService: service, repository });
  for (const pathname of ['/api/leads/autoreply', '/api/leads/abc/send-message', '/api/leads/abc/request-whatsapp', '/api/leads/abc/messages/def/retry']) {
    const result = await api.handle({ method: 'POST', pathname, body: {} });
    assert.equal(result.status, 405);
    assert.equal(result.body.code, 'META_OBSERVER_READ_ONLY');
  }
});

test('corrección manual completa el lead sin escribir en Meta', async () => {
  const { observer, repository } = setup();
  const observed = await observer.observe({ channel: 'instagram', sourceConversationId: 'u-4', direction: 'inbound', externalMessageId: 'e1', text: 'Mi número es 955623069' });
  const service = new ObserverLeadService({ repository });
  await service.editLead(observed.lead.id, { product: '625ml', modality: 'maquila' });
  const lead = await repository.findLeadById(observed.lead.id);
  assert.equal(lead.status, 'READY_FOR_WHATSAPP');
  assert.equal((await repository.listMessages(lead.id)).length, 1);
});
