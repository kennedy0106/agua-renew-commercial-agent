import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresLeadRepository } from '../src/leads/postgres-lead-repository.mjs';
import { runMigrations } from '../scripts/migrate.mjs';
import { enabled, connectionString } from './postgres-test-config.mjs';

test('PostgreSQL persiste leads, mensajes, eventos e historial de teléfono', { skip: !enabled }, async () => {
  const repository = new PostgresLeadRepository({ connectionString });
  await repository.connect();
  try {
    await runMigrations(repository.pool);

    const lead = await repository.createLead({
      sourceChannel: 'instagram',
      sourceOrigin: 'organic_dm',
      sourceConversationId: `it-conv-${Date.now()}`,
      metaUserId: 'ig-user-1',
      automationTriggered: false,
    });
    assert.equal(lead.status, 'NEW');
    assert.equal(lead.controlMode, 'AUTO');

    const updated = await repository.updateLead(lead.id, { product: '20l', status: 'WAITING_PHONE', phoneE164: '+51955623069' });
    assert.equal(updated.product, '20l');
    assert.equal(updated.phoneE164, '+51955623069');

    const found = await repository.findLeadByPhone('+51955623069');
    assert.equal(found.id, lead.id);

    await repository.appendMessage({ leadId: lead.id, channel: 'instagram', direction: 'inbound', externalMessageId: `mid-${Date.now()}`, content: '20 litros' });
    await repository.appendEvent({ leadId: lead.id, eventType: 'CLASSIFIED', payload: { conversationType: 'commercial_lead' } });
    await repository.recordPhoneHistory({ leadId: lead.id, previousPhone: null, newPhone: '+51955623069', reason: 'PHONE_CAPTURED' });

    const messages = await repository.listMessages(lead.id);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content, '20 litros');
    assert.equal(messages[0].direction, 'inbound');

    const events = await repository.listEvents(lead.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'CLASSIFIED');

    const history = await repository.listPhoneHistory(lead.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].newPhone, '+51955623069');

    const counts = await repository.countLeadsByStatus();
    assert.equal(counts.WAITING_PHONE >= 1, true);
  } finally {
    await repository.pool?.query("DELETE FROM leads WHERE source_conversation_id LIKE 'it-conv-%'");
    await repository.close();
  }
});

test('PostgreSQL: external_message_id duplicado se reconoce sin crear otra fila', { skip: !enabled }, async () => {
  const repository = new PostgresLeadRepository({ connectionString });
  await repository.connect();
  try {
    await runMigrations(repository.pool);
    const lead = await repository.createLead({ sourceChannel: 'instagram', sourceConversationId: `it-conv-dup-${Date.now()}` });
    const mid = `mid-dup-${Date.now()}`;
    const first = await repository.appendMessage({ leadId: lead.id, channel: 'instagram', direction: 'inbound', externalMessageId: mid, content: 'hola' });
    const duplicate = await repository.appendMessage({ leadId: lead.id, channel: 'instagram', direction: 'inbound', externalMessageId: mid, content: 'hola de nuevo' });
    assert.equal(first.wasInserted, true);
    assert.equal(duplicate.wasInserted, false);
    assert.equal((await repository.listMessages(lead.id)).length, 1);
  } finally {
    await repository.pool?.query("DELETE FROM leads WHERE source_conversation_id LIKE 'it-conv-dup-%'");
    await repository.close();
  }
});

test('PostgreSQL: persiste runtime y reclama outbox una sola vez', { skip: !enabled }, async () => {
  const repository = new PostgresLeadRepository({ connectionString });
  await repository.connect();
  try {
    await runMigrations(repository.pool);
    const lead = await repository.createLead({ sourceChannel: 'facebook_messenger', sourceConversationId: `it-outbox-${Date.now()}`, metaUserId: 'psid-outbox' });
    const analyzed = await repository.applyHistoricalAnalysis({
      leadId: lead.id,
      before: { status: 'NEW', conversationType: null },
      after: { status: 'WAITING_MODALITY', conversationType: 'commercial_lead' },
      payload: { outboundMessagesCreated: 0 },
    });
    assert.equal(analyzed, true);
    const updated = await repository.updateLead(lead.id, { status: 'WAITING_MODALITY', lastReplyAt: new Date(), modalityAskCount: 2 });
    assert.equal(updated.modalityAskCount, 2);
    assert.ok(updated.lastReplyAt);
    const queued = await repository.enqueueOutbound({ leadId: lead.id, channel: lead.sourceChannel, actorType: 'operator', content: 'Hola', purpose: 'operator_reply' });
    assert.equal(queued.deliveryStatus, 'PENDING');
    const [claimedA, claimedB] = await Promise.all([
      repository.claimDueOutbound({ limit: 1 }), repository.claimDueOutbound({ limit: 1 }),
    ]);
    assert.equal(claimedA.length + claimedB.length, 1);
    const claimed = claimedA[0] ?? claimedB[0];
    assert.equal(claimed.deliveryStatus, 'SENDING');
    const sent = await repository.recordOutboundOutcome({
      messageId: claimed.id,
      status: 'SENT',
      providerMessageId: 'meta-integration',
      sentAt: new Date(),
      events: [{ eventType: 'OUTBOUND_SENT', payload: { messageId: claimed.id } }],
    });
    assert.equal(sent.deliveryStatus, 'SENT');
    assert.ok((await repository.listEvents(lead.id)).some((event) => event.eventType === 'OUTBOUND_SENT'));
  } finally {
    await repository.pool?.query("DELETE FROM leads WHERE source_conversation_id LIKE 'it-outbox-%'");
    await repository.close();
  }
});
