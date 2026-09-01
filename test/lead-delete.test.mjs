import assert from 'node:assert/strict';
import test from 'node:test';
import { LeadsApi } from '../src/admin/leads-api.mjs';
import { LeadService } from '../src/leads/lead-service.mjs';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { SocialLeadIntake } from '../src/meta/social-lead-intake.mjs';

const inbound = (overrides = {}) => ({
  channel: 'facebook_messenger',
  sourceConversationId: 'conv-delete',
  sender: { id: 'psid-del', username: 'Prospecto Eliminable' },
  sourceOrigin: 'organic_dm',
  automationTriggered: false,
  externalMessageId: `mid-${Math.random()}`,
  text: 'Hola, quiero información',
  ...overrides,
});

function makeApi() {
  const repository = new InMemoryLeadRepository();
  const service = new LeadService({
    repository,
    router: { classify: async () => ({ conversationType: 'commercial_lead', confidence: 0.99, extraction: { phone: null, product: null, modality: null } }) },
    intake: new SocialLeadIntake(),
    autoReplyEnabled: true,
    replyCooldownMs: 0,
  });
  const api = new LeadsApi({ leadService: service, repository });
  const seed = async (text = 'Hola, quiero información') => {
    const r = await service.handleInboundMessage(inbound({ text }));
    return r.lead.id;
  };
  return { api, repository, seed };
}

test('API: eliminar lead borra sus datos y el detalle da 404', async () => {
  const { api, repository, seed } = makeApi();
  const id = await seed();

  const r = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/delete`, body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.body.deleted, true);

  const detail = await api.handle({ method: 'GET', pathname: `/api/leads/${id}` });
  assert.equal(detail.status, 404);
  assert.equal(await repository.findLeadById(id), null);
  assert.equal((await repository.listMessages(id)).length, 0);
  assert.equal((await repository.listEvents(id)).length, 0);
});

test('API: eliminar lead inexistente da 404', async () => {
  const { api } = makeApi();
  const r = await api.handle({ method: 'POST', pathname: `/api/leads/${'0'.repeat(36)}/delete`, body: {} });
  assert.equal(r.status, 404);
});

test('API: tras eliminar, la lista ya no lo incluye', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  await api.handle({ method: 'POST', pathname: `/api/leads/${id}/delete`, body: {} });
  const list = await api.handle({ method: 'GET', pathname: '/api/leads' });
  assert.equal(list.body.leads.some((l) => l.id === id), false);
});
