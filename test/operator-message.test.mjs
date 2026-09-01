import assert from 'node:assert/strict';
import test from 'node:test';
import { LeadsApi } from '../src/admin/leads-api.mjs';
import { LeadService } from '../src/leads/lead-service.mjs';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { SocialLeadIntake } from '../src/meta/social-lead-intake.mjs';

/** API con sender mock que registra los envíos. */
function makeApi() {
  const repository = new InMemoryLeadRepository();
  const sent = [];
  const sender = {
    mode: 'mock',
    sendText: async ({ content, purpose }) => { sent.push({ content, purpose }); return { mid: `mock-${sent.length}` }; },
  };
  const leadService = new LeadService({
    repository,
    router: {
      classify: async () => ({ conversationType: 'commercial_lead', confidence: 0.99, extraction: { phone: null, product: null, modality: null } }),
    },
    intake: new SocialLeadIntake(),
    sender,
    autoReplyEnabled: false,
  });
  const api = new LeadsApi({ leadService, repository, adminToken: 'sekret' });
  const seed = async (text = 'Hola, quiero información sobre sus productos') => {
    const result = await leadService.handleInboundMessage({
      channel: 'facebook_messenger', externalMessageId: `mid-op-${Math.random()}`, sourceConversationId: `conv-op-${Math.random()}`,
      sourceOrigin: 'organic_dm', automationTriggered: false,
      sender: { id: 'psid-op', username: 'Cliente Prueba' }, text,
    });
    return result.lead.id;
  };
  return { api, repository, leadService, sender: sent, seed };
}

const AUTH = { Authorization: 'Bearer sekret' };

test('API: enviar mensaje del operador lo encola sin afirmar entrega', async () => {
  const { api, repository, sender, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/send-message`, headers: AUTH, body: { text: 'Hola, ¿me confirma su número?' } });
  assert.equal(response.status, 202);
  assert.equal(sender.length, 0);
  const messages = await repository.listMessages(id);
  const outbound = messages.filter((m) => m.direction === 'outbound');
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].actorType, 'operator');
  assert.equal(outbound[0].deliveryStatus, 'PENDING');
  assert.equal(outbound[0].purpose, 'operator_reply');
  const events = await repository.listEvents(id);
  assert.ok(events.some((e) => e.eventType === 'OUTBOUND_QUEUED'));
});

test('API: enviar mensaje vacío devuelve 400', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/send-message`, headers: AUTH, body: { text: '   ' } });
  assert.equal(response.status, 400);
});

test('API: reintento manual vuelve a encolar un mensaje fallido', async () => {
  const { api, repository, seed } = makeApi();
  const id = await seed();
  const queued = await api.handle({
    method: 'POST', pathname: `/api/leads/${id}/send-message`, headers: AUTH, body: { text: 'Mensaje operativo' },
  });
  await repository.markOutboundFailed(queued.body.message.id, { errorCode: '400', errorMessage: 'Solicitud rechazada' });

  const response = await api.handle({
    method: 'POST', pathname: `/api/leads/${id}/messages/${queued.body.message.id}/retry`, headers: AUTH, body: {},
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.message.deliveryStatus, 'PENDING');
  const events = await repository.listEvents(id);
  assert.ok(events.some((event) => event.eventType === 'OUTBOUND_REQUEUED'));
});

test('API: pedir WhatsApp encola la plantilla askPhone y registra evento', async () => {
  const { api, repository, sender, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/request-whatsapp`, headers: AUTH, body: {} });
  assert.equal(response.status, 202);
  assert.equal(sender.length, 0);
  const events = await repository.listEvents(response.body.lead.id);
  assert.ok(events.some((e) => e.eventType === 'PHONE_REQUESTED'));
});

test('API: pedir WhatsApp a un lead que ya tiene teléfono devuelve 400', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  // El router stub no extrae teléfono; lo asignamos con la acción correctPhone.
  await api.handle({ method: 'POST', pathname: `/api/leads/${id}/phone`, headers: AUTH, body: { phone: '955623069' } });
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/request-whatsapp`, headers: AUTH, body: {} });
  assert.equal(response.status, 400);
});

test('API: reabrir un lead cerrado lo vuelve a Nuevo con evento', async () => {
  const { api, repository, seed } = makeApi();
  const id = await seed();
  await api.handle({ method: 'POST', pathname: `/api/leads/${id}/close`, headers: AUTH, body: {} });
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/reopen`, headers: AUTH, body: {} });
  assert.equal(response.status, 200);
  assert.equal(response.body.lead.status, 'NEW');
  const events = await repository.listEvents(id);
  assert.ok(events.some((e) => e.eventType === 'LEAD_REOPENED'));
});

test('API: reabrir un lead que no está cerrado devuelve 400', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/reopen`, headers: AUTH, body: {} });
  assert.equal(response.status, 400);
});
