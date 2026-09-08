import assert from 'node:assert/strict';
import test from 'node:test';
import { LeadsApi } from '../src/admin/leads-api.mjs';
import { LeadService } from '../src/leads/lead-service.mjs';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { SocialLeadIntake } from '../src/meta/social-lead-intake.mjs';
import { MetaMessageSender } from '../src/meta/meta-message-sender.mjs';

function makeApi() {
  const repository = new InMemoryLeadRepository();
  const leadService = new LeadService({
    repository,
    router: {
      classify: async () => ({ conversationType: 'commercial_lead', confidence: 0.99, extraction: { phone: '955623069', product: '20l', modality: 'maquila' } }),
    },
    intake: new SocialLeadIntake(),
    sender: new MetaMessageSender({ mode: 'mock' }),
  });
  const api = new LeadsApi({ leadService, repository, adminToken: 'sekret' });
  const seed = async () => {
    const result = await leadService.handleInboundMessage({
      channel: 'instagram', externalMessageId: 'mid-api-1', sourceConversationId: 'api-user-1',
      sourceOrigin: 'organic_dm', automationTriggered: false,
      sender: { id: 'api-user-1', username: '@prospecto' }, text: 'Quiero 20 litros con mi marca, mi número es 955623069',
    });
    return result.lead.id;
  };
  return { api, repository, leadService, seed };
}

const AUTH = { Authorization: 'Bearer sekret' };

test('API: requiere token de administrador', async () => {
  const { api } = makeApi();
  const anon = await api.handle({ method: 'GET', pathname: '/api/leads', headers: {}, body: {} });
  assert.equal(anon.status, 401);
  const bad = await api.handle({ method: 'GET', pathname: '/api/leads', headers: { Authorization: 'Bearer malo' }, body: {} });
  assert.equal(bad.status, 401);
});

test('API: lista leads con filtros y conteos', async () => {
  const { api, seed } = makeApi();
  await seed();
  const response = await api.handle({ method: 'GET', pathname: '/api/leads', headers: AUTH, body: {} });
  assert.equal(response.status, 200);
  assert.equal(response.body.leads.length, 1);
  assert.equal(response.body.counts.READY_FOR_WHATSAPP, 1);
});

test('API: detalle incluye mensajes y enlace de WhatsApp generado', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  const response = await api.handle({ method: 'GET', pathname: `/api/leads/${id}`, headers: AUTH, body: {} });
  assert.equal(response.status, 200);
  assert.equal(response.body.lead.phoneE164, '+51955623069');
  assert.equal(response.body.messages.length, 2);
  assert.ok(response.body.whatsappLink);
  assert.match(response.body.whatsappLink.url, /^https:\/\/wa\.me\/51955623069\?text=/);
});

test('API: acciones del operador y bloqueo del control Meta', async () => {
  const { api, seed } = makeApi();
  const id = await seed();

  let r = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/open`, headers: AUTH, body: {} });
  assert.equal(r.body.lead.status, 'CONTACT_OPENED');

  r = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/contact`, headers: AUTH, body: {} });
  assert.equal(r.body.lead.status, 'CONTACTED_MANUALLY');

  r = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/control`, headers: AUTH, body: { controlMode: 'HUMAN' } });
  assert.equal(r.status, 405);
  assert.equal(r.body.code, 'META_OBSERVER_READ_ONLY');

  r = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/phone`, headers: AUTH, body: { phone: '999999999' } });
  assert.equal(r.body.lead.phoneE164, '+51999999999');

  r = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/close`, headers: AUTH, body: {} });
  assert.equal(r.body.lead.status, 'CLOSED');
});

test('API: edición manual validada', async () => {
  const { api, seed } = makeApi();
  const id = await seed();
  const r = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/edit`, headers: AUTH, body: { product: '1l', modality: 'distribution_agua_renew' } });
  assert.equal(r.body.lead.product, '1l');
  assert.equal(r.body.lead.modality, 'distribution_agua_renew');
  const bad = await api.handle({ method: 'POST', pathname: `/api/leads/${id}/edit`, headers: AUTH, body: { product: '999l' } });
  assert.equal(bad.status, 400);
});

test('API: filtros con limit/offset inválidos no rompen la consulta', async () => {
  const { api, seed } = makeApi();
  await seed();
  const r = await api.handle({ method: 'GET', pathname: '/api/leads', headers: AUTH, body: {}, query: { limit: 'abc', offset: '-5' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.leads.length, 1);
  const big = await api.handle({ method: 'GET', pathname: '/api/leads', headers: AUTH, body: {}, query: { limit: '999999' } });
  assert.equal(big.status, 200);
});

test('API: auto-respuesta está retirada en modo observer', async () => {
  const { api } = makeApi();
  const before = await api.handle({ method: 'GET', pathname: '/api/leads/autoreply', headers: AUTH, body: {} });
  assert.equal(before.status, 405);
  assert.equal(before.body.code, 'META_OBSERVER_READ_ONLY');

  const off = await api.handle({ method: 'POST', pathname: '/api/leads/autoreply', headers: AUTH, body: { enabled: false } });
  assert.equal(off.status, 405);

  const on = await api.handle({ method: 'POST', pathname: '/api/leads/autoreply', headers: AUTH, body: { enabled: true } });
  assert.equal(on.status, 405);
});

test('API: exportación CSV y XLSX con filtros', async () => {
  const { api, seed } = makeApi();
  await seed();

  const csv = await api.handle({ method: 'GET', pathname: '/api/leads/export.csv', headers: AUTH, body: {} });
  assert.equal(csv.status, 200);
  assert.match(csv.headers['Content-Type'], /text\/csv/);
  assert.ok(Buffer.isBuffer(csv.body));
  assert.ok(csv.body.toString('utf8').startsWith('\uFEFF'));
  assert.match(csv.body.toString('utf8'), /@prospecto/);

  const xlsx = await api.handle({ method: 'GET', pathname: '/api/leads/export.xlsx', headers: AUTH, body: {} });
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.body[0], 0x50);
  assert.equal(xlsx.body[1], 0x4B);
});
