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

test('API observer: enviar mensaje del operador está bloqueado y no encola', async () => {
  const { api, repository, sender, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/send-message`, headers: AUTH, body: { text: 'Hola, ¿me confirma su número?' } });
  assert.equal(response.status, 405);
  assert.equal(response.body.code, 'META_OBSERVER_READ_ONLY');
  assert.equal(sender.length, 0);
  const messages = await repository.listMessages(id);
  const outbound = messages.filter((m) => m.direction === 'outbound');
  assert.equal(outbound.length, 0);
});

test('API observer: incluso un mensaje vacío devuelve el bloqueo estable', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/send-message`, headers: AUTH, body: { text: '   ' } });
  assert.equal(response.status, 405);
  assert.equal(response.body.code, 'META_OBSERVER_READ_ONLY');
});

test('API observer: reintento manual está bloqueado', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({
    method: 'POST', pathname: `/api/leads/${id}/messages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/retry`, headers: AUTH, body: {},
  });
  assert.equal(response.status, 405);
  assert.equal(response.body.code, 'META_OBSERVER_READ_ONLY');
});

test('API observer: pedir WhatsApp está bloqueado y no crea eventos salientes', async () => {
  const { api, repository, sender, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/request-whatsapp`, headers: AUTH, body: {} });
  assert.equal(response.status, 405);
  assert.equal(response.body.code, 'META_OBSERVER_READ_ONLY');
  assert.equal(sender.length, 0);
  const events = await repository.listEvents(id);
  assert.equal(events.some((e) => e.eventType === 'PHONE_REQUESTED'), false);
});

test('API observer: pedir WhatsApp sigue bloqueado aunque el lead tenga teléfono', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  // El router stub no extrae teléfono; lo asignamos con la acción correctPhone.
  await api.handle({ method: 'POST', pathname: `/api/leads/${id}/phone`, headers: AUTH, body: { phone: '955623069' } });
  const response = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/request-whatsapp`, headers: AUTH, body: {} });
  assert.equal(response.status, 405);
  assert.equal(response.body.code, 'META_OBSERVER_READ_ONLY');
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
