import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationOriginResolver } from '../src/meta/conversation-origin-resolver.mjs';
import { MetaMessageSender } from '../src/meta/meta-message-sender.mjs';

test('origen: primer mensaje con plantilla del anuncio → ad_automation', () => {
  const resolver = new ConversationOriginResolver();
  const origin = resolver.resolve({ text: '¿Podrían darme más información del negocio?', hasPriorMessages: false });
  assert.equal(origin, 'ad_automation');
});

test('origen: flag explícito de automatización gana', () => {
  const resolver = new ConversationOriginResolver();
  const origin = resolver.resolve({ text: 'hola', hasPriorMessages: false, automationTriggered: true });
  assert.equal(origin, 'ad_automation');
});

test('origen: primer mensaje libre → organic_dm', () => {
  const resolver = new ConversationOriginResolver();
  const origin = resolver.resolve({ text: 'Hola, ¿venden agua?', hasPriorMessages: false });
  assert.equal(origin, 'organic_dm');
});

test('origen: con historial previo → unknown (no se puede determinar)', () => {
  const resolver = new ConversationOriginResolver();
  const origin = resolver.resolve({ text: '¿Podrían darme más información del negocio?', hasPriorMessages: true });
  assert.equal(origin, 'unknown');
});

test('origen: frases configurables', () => {
  const resolver = new ConversationOriginResolver({ adTriggerPhrases: ['quiero cotizar'] });
  assert.equal(resolver.resolve({ text: 'Quiero cotizar por favor', hasPriorMessages: false }), 'ad_automation');
  assert.equal(resolver.resolve({ text: '¿Podrían darme más información?', hasPriorMessages: false }), 'organic_dm');
});

test('sender mock: registra el mensaje sin red', async () => {
  const sender = new MetaMessageSender({ mode: 'mock' });
  const lead = { metaUserId: 'ig-1', sourceChannel: 'instagram' };
  const result = await sender.sendText({ lead, content: 'Hola', purpose: 'reply' });
  assert.equal(result.ok, true);
  assert.equal(result.mock, true);
  assert.equal(sender.sentMessages.length, 1);
  assert.equal(sender.sentMessages[0].content, 'Hola');
});

test('sender live (Instagram): la ruta lleva la cuenta emisora y el body el receptor', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ message_id: 'm1' }) };
  };
  const sender = new MetaMessageSender({
    pageAccessToken: 'TOKEN', apiVersion: 'v21.0', fetchImpl, mode: 'live', igUserId: 'ig-business-1',
  });
  const lead = { metaUserId: 'ig-customer-1', sourceChannel: 'instagram' };
  const result = await sender.sendText({ lead, content: 'Hola', purpose: 'reply' });

  assert.equal(result.messageId, 'm1');
  assert.equal(calls.length, 1);
  // La ruta usa la cuenta emisora (business), NO el receptor.
  assert.match(calls[0].url, /graph\.facebook\.com\/v21\.0\/ig-business-1\/messages/);
  assert.match(calls[0].url, /access_token=TOKEN/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.recipient.id, 'ig-customer-1'); // receptor en el body
  assert.equal(body.message.text, 'Hola');
});

test('sender live (Messenger): ruta con el id de la página, receptor en el body', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ message_id: 'm2' }) };
  };
  const sender = new MetaMessageSender({
    pageAccessToken: 'TOKEN', apiVersion: 'v21.0', fetchImpl, mode: 'live', pageId: '733173063221109',
  });
  const lead = { metaUserId: 'psid-customer-7', sourceChannel: 'facebook_messenger' };
  await sender.sendText({ lead, content: 'Hola' });
  assert.match(calls[0].url, /\/v21\.0\/733173063221109\/messages/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.recipient.id, 'psid-customer-7');
});

test('sender live: sin cuenta emisora lanza MISSING_EMITTER', async () => {
  const sender = new MetaMessageSender({ pageAccessToken: 'TOKEN', mode: 'live' });
  await assert.rejects(
    () => sender.sendText({ lead: { metaUserId: 'x', sourceChannel: 'instagram' }, content: 'Hola' }),
    /cuenta emisora/,
  );
});

test('sender live: sin token lanza not_configured', async () => {
  const sender = new MetaMessageSender({ mode: 'live' });
  await assert.rejects(
    () => sender.sendText({ lead: { metaUserId: 'ig-1' }, content: 'Hola' }),
    /configurado/,
  );
});
