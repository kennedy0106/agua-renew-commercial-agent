import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { MetaOutboxWorker } from '../src/meta/outbox-worker.mjs';

async function setup(sender, clock = () => new Date('2026-08-31T12:00:00Z')) {
  const repository = new InMemoryLeadRepository();
  const lead = await repository.createLead({ sourceChannel: 'facebook_messenger', sourceOrigin: 'organic_dm', sourceConversationId: 'outbox-1', metaUserId: 'psid-1' });
  const message = await repository.enqueueOutbound({ leadId: lead.id, channel: lead.sourceChannel, actorType: 'operator', content: 'Hola', purpose: 'operator_reply' });
  return { repository, lead, message, worker: new MetaOutboxWorker({ repository, sender, clock }) };
}

test('outbox: una entrega confirmada pasa a SENT y registra proveedor', async () => {
  const { repository, message, worker } = await setup({ sendText: async () => ({ messageId: 'meta-1' }) });
  assert.deepEqual(await worker.runOnce(), { processed: 1 });
  const stored = (await repository.listMessages(message.leadId)).find((item) => item.id === message.id);
  assert.equal(stored.deliveryStatus, 'SENT');
  assert.equal(stored.providerMessageId, 'meta-1');
  assert.ok((await repository.listEvents(message.leadId)).some((event) => event.eventType === 'OUTBOUND_SENT'));
});

test('outbox: 5xx programa reintento con backoff', async () => {
  const error = new Error('Meta no disponible');
  error.httpStatus = 503;
  error.retryable = true;
  const { repository, message, worker } = await setup({ sendText: async () => { throw error; } });
  await worker.runOnce();
  const stored = (await repository.listMessages(message.leadId)).find((item) => item.id === message.id);
  assert.equal(stored.deliveryStatus, 'RETRY_WAIT');
  assert.equal(stored.attemptCount, 1);
  assert.ok(stored.nextAttemptAt);
});

test('outbox: timeout ambiguo queda UNKNOWN y solo reintenta manualmente', async () => {
  const error = new Error('timeout');
  error.code = 'META_TIMEOUT';
  error.ambiguous = true;
  const { repository, message, worker } = await setup({ sendText: async () => { throw error; } });
  await worker.runOnce();
  let stored = (await repository.listMessages(message.leadId)).find((item) => item.id === message.id);
  assert.equal(stored.deliveryStatus, 'UNKNOWN');
  stored = await repository.retryOutbound(message.id);
  assert.equal(stored.deliveryStatus, 'PENDING');
  assert.equal(stored.attemptCount, 0);
});

test('outbox: recupera leases SENDING abandonados', async () => {
  const first = new Date(Date.now() + 1_000);
  const { repository } = await setup({ sendText: async () => ({}) }, () => first);
  const claimed = await repository.claimDueOutbound({ now: first });
  assert.equal(claimed[0].deliveryStatus, 'SENDING');
  const reclaimed = await repository.claimDueOutbound({ now: new Date(first.getTime() + 121_000), leaseMs: 120_000 });
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].attemptCount, 2);
});
