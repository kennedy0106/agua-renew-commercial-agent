import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresLeadRepository } from '../src/leads/postgres-lead-repository.mjs';

/** Pool falso que captura SQL y parámetros sin tocar una base real. */
function fakePool(rows) {
  const calls = [];
  const pool = {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      return { rows };
    },
    end: async () => {},
  };
  return { pool, calls };
}

test('postgres updateLead: usa el nombre de columna correcto y parametriza valores', async () => {
  const { pool, calls } = fakePool([{
    id: 'lead-1', source_channel: 'facebook_messenger', source_origin: 'webhook',
    source_ad_id: null, source_conversation_id: 'conv-1', meta_user_id: 'psid-1',
    meta_username: 'Cliente', conversation_type: null, classification_confidence: null,
    automation_triggered: false, phone_raw: null, phone_e164: null, product: null,
    modality: null, status: 'NEW', control_mode: 'AUTO',
    initial_social_message_sent: false, clarification_count: 0, last_inbound_at: null,
    whatsapp_opened_at: null, contacted_at: null, meta_confirmation_sent_at: null,
    meta_confirmation_blocked: false, created_at: new Date(), updated_at: new Date(),
  }]);
  const repo = new PostgresLeadRepository({ connectionString: 'postgres://x' });
  repo.pool = pool;

  const iso = '2026-08-25T10:00:00.000Z';
  await repo.updateLead('lead-1', { lastInboundAt: iso, status: 'WAITING_PHONE' });

  const call = calls[1];
  assert.equal(call.text, 'UPDATE leads SET last_inbound_at = $2, status = $3, updated_at = now() WHERE id = $1 RETURNING *');
  assert.deepEqual(call.params, ['lead-1', iso, 'WAITING_PHONE']);
});

test('postgres updateLead: rechaza claves fuera del mapeo de columnas', async () => {
  const { pool, calls } = fakePool([{
    id: 'lead-1', source_channel: 'facebook_messenger', source_origin: 'webhook',
    source_ad_id: null, source_conversation_id: 'conv-1', meta_user_id: 'psid-1',
    meta_username: 'Cliente', conversation_type: null, classification_confidence: null,
    automation_triggered: false, phone_raw: null, phone_e164: null, product: null,
    modality: null, status: 'NEW', control_mode: 'AUTO',
    initial_social_message_sent: false, clarification_count: 0, last_inbound_at: null,
    whatsapp_opened_at: null, contacted_at: null, meta_confirmation_sent_at: null,
    meta_confirmation_blocked: false, created_at: new Date(), updated_at: new Date(),
  }]);
  const repo = new PostgresLeadRepository({ connectionString: 'postgres://x' });
  repo.pool = pool;

  await assert.rejects(() => repo.updateLead('lead-1', { hack: "2026-01-01'; DROP TABLE leads; --" }), /no soportados/);
  assert.equal(calls.length, 0);
});

test('postgres deleteLead: confía en las FK ON DELETE CASCADE', async () => {
  const { pool, calls } = fakePool([]);
  const repo = new PostgresLeadRepository({ connectionString: 'postgres://x' });
  repo.pool = pool;

  await repo.deleteLead('lead-1');
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /DELETE FROM leads WHERE id = \$1/);
  assert.deepEqual(calls[0].params, ['lead-1']);
});

test('postgres appendMessage: idempotente y actualiza metadatos de origen', async () => {
  const { pool, calls } = fakePool([]);
  const repo = new PostgresLeadRepository({ connectionString: 'postgres://x' });
  repo.pool = pool;

  const result = await repo.appendMessage({ leadId: 'lead-1', channel: 'facebook_messenger', direction: 'inbound', externalMessageId: 'mid-x', content: 'Hola' });
  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /ON CONFLICT \(external_message_id\).*DO UPDATE SET/s);
});
