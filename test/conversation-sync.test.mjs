import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { syncConversations } from '../src/meta/conversation-sync.mjs';
import { LeadProcessor } from '../src/meta/lead-processor.mjs';
import { ConversationObserver } from '../src/meta/conversation-observer.mjs';

function observerFor(repository) {
  return new ConversationObserver({ repository, processor: new LeadProcessor({ repository }) });
}

/** fetch falso: responde listas de conversaciones y mensajes de la Graph API. */
function mockGraph() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/conversations?')) {
      return { ok: true, json: async () => ({
        data: [{
          id: 't_999', unread_count: 1, updated_time: '2026-08-25T12:00:00+0000',
          participants: { data: [{ id: 'page-1' }, { id: 'psid-1', name: 'Kennedy Rojas' }] },
        }],
      }) };
    }
    if (u.includes('/messages?')) {
      return { ok: true, json: async () => ({
        data: [{ id: 'mid-1', message: 'Hola, me interesa', created_time: '2026-08-25T12:00:00+0000', from: { id: 'psid-1', name: 'Kennedy Rojas' } }],
      }) };
    }
    return { ok: true, json: async () => ({ data: [] }) };
  };
  return () => { globalThis.fetch = original; };
}

test('sync: reutiliza el lead creado por el webhook (mismo psid) — no duplica', async () => {
  const restore = mockGraph();
  try {
    const repository = new InMemoryLeadRepository();
    // Lead ya creado por el webhook (sourceConversationId = psid, SIN nombre —
    // el payload del webhook no incluye el nombre del usuario).
    await repository.createLead({
      sourceChannel: 'facebook_messenger', sourceOrigin: 'webhook',
      sourceConversationId: 'psid-1', metaUserId: 'psid-1', metaUsername: null,
    });

    const summary = await syncConversations({ repository, observer: observerFor(repository), pageId: 'page-1', pageAccessToken: 'tok' });
    assert.equal(summary.leadsCreated, 0, 'no debe crear un segundo lead para la misma conversación');
    assert.equal(summary.messagesImported, 1);

    const leads = await repository.listLeads({});
    assert.equal(leads.length, 1);
    const lead = leads[0];
    assert.equal(lead.metaUsername, 'Kennedy Rojas');
    const messages = await repository.listMessages(lead.id);
    assert.equal(messages.length, 1, 'el mensaje se agrega al lead existente');
    assert.equal(messages[0].content, 'Hola, me interesa');
    assert.equal(new Date(messages[0].sourceCreatedAt).toISOString(), '2026-08-25T12:00:00.000Z');
    assert.equal(messages[0].deliveryStatus, 'RECEIVED');
    assert.equal(lead.lastInboundAt, '2026-08-25T12:00:00.000Z');
  } finally {
    restore();
  }
});

test('sync: si no existe el lead, lo crea con sourceConversationId = psid', async () => {
  const restore = mockGraph();
  try {
    const repository = new InMemoryLeadRepository();
    const summary = await syncConversations({ repository, observer: observerFor(repository), pageId: 'page-1', pageAccessToken: 'tok' });
    assert.equal(summary.leadsCreated, 1);
    const leads = await repository.listLeads({});
    assert.equal(leads.length, 1);
    assert.equal(leads[0].sourceConversationId, 'psid-1', 'id canónico = PSID, igual que el webhook');
  } finally {
    restore();
  }
});

test('sync: Instagram usa el mismo observer y conserva el canal', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/conversations?')) return { json: async () => ({ data: [{ id: 'ig-thread', unread_count: 0, participants: { data: [{ id: 'ig-business' }, { id: 'ig-user', name: 'Cliente IG' }] } }] }) };
    return { json: async () => ({ data: [{ id: 'ig-mid', message: '625 con mi marca, 955623069', created_time: '2026-08-25T12:00:00+0000', from: { id: 'ig-user' } }] }) };
  };
  try {
    const repository = new InMemoryLeadRepository();
    const summary = await syncConversations({ repository, observer: observerFor(repository), businessAccountId: 'ig-business', platform: 'instagram', pageAccessToken: 'tok', onlyUnread: false });
    assert.equal(summary.platform, 'instagram');
    const [lead] = await repository.listLeads({});
    assert.equal(lead.sourceChannel, 'instagram');
    assert.equal(lead.status, 'READY_FOR_WHATSAPP');
  } finally {
    globalThis.fetch = original;
  }
});
