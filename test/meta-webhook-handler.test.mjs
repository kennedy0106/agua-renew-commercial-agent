import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { MetaWebhookHandler } from '../src/meta/meta-webhook-handler.mjs';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { LeadProcessor } from '../src/meta/lead-processor.mjs';
import { ConversationObserver } from '../src/meta/conversation-observer.mjs';

function signatureFor(rawBody, appSecret) {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

function makeHandler({ appSecret = 'secret', profileResolver = null } = {}) {
  const repository = new InMemoryLeadRepository();
  const processor = new LeadProcessor({ repository });
  const observer = new ConversationObserver({ repository, processor });
  const handler = new MetaWebhookHandler({ verifyToken: 'verify-token', appSecret, observer, repository, profileResolver });
  return { handler, repository, observer };
}

function igPayload(mid, text, senderId = 'cust-1') {
  return JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ig-business', time: 1, messaging: [{ sender: { id: senderId }, recipient: { id: 'ig-business' }, timestamp: 1, message: { mid, text } }] }],
  });
}

test('handshake: verify token correcto devuelve el challenge', () => {
  const { handler } = makeHandler();
  const result = handler.verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token', 'hub.challenge': '12345' });
  assert.equal(result.verified, true);
  assert.equal(result.challenge, '12345');
});

test('handshake: token incorrecto rechaza', () => {
  const { handler } = makeHandler();
  const result = handler.verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'malo', 'hub.challenge': '12345' });
  assert.equal(result.verified, false);
});

test('firma: HMAC válido pasa; inválido se rechaza', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = igPayload('mid-1', 'Hola');
  const ok = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(ok.processed, 1);
  assert.equal(ok.ignored, 0);

  const bad = await handler.handle({ rawBody, signature: 'sha256=deadbeef' });
  assert.deepEqual(bad, { error: 'invalid_signature' });
  const leads = await repository.listLeads({});
  assert.equal(leads.length, 1); // el inválido no creó nada

  // El id de conversación de Messenger es el PSID (mismo formato que usa el
  // auto-sync con participants.id) para que no se duplique el lead.
  const pageBody = JSON.stringify({
    object: 'page',
    entry: [{ id: 'page-1', time: 1, messaging: [{ sender: { id: 'cust-1' }, recipient: { id: 'page-1' }, timestamp: 1, message: { mid: 'mid-ok', text: 'Hola' } }] }],
  });
  const okPage = await handler.handle({ rawBody: pageBody, signature: signatureFor(pageBody, 'secret') });
  assert.equal(okPage.processed, 1);
  const pageLead = (await repository.listLeads({})).find((l) => l.sourceConversationId === 'cust-1');
  assert.ok(pageLead, 'lead de Messenger debe quedar con sourceConversationId = PSID');
});

test('webhook: crea y procesa un lead completo sin responder', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = igPayload('mid-2', 'Quiero 20 litros con mi marca, mi número es 955623069');
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });

  assert.equal(result.processed, 1);
  assert.equal('replies' in result, false);
  const leads = await repository.listLeads({});
  assert.equal(leads.length, 1);
  const lead = leads[0];
  assert.equal(lead.product, '20l');
  assert.equal(lead.modality, 'maquila');
  assert.equal(lead.phoneE164, '+51955623069');
  assert.equal(lead.status, 'READY_FOR_WHATSAPP');
  assert.equal(lead.sourceOrigin, 'organic_dm');
});

test('webhook: mensaje de plantilla del anuncio queda observado sin respuesta', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = igPayload('mid-3', '¿Podrían darme más información del negocio?');
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(result.processed, 1);
  assert.equal('replies' in result, false);
  const leads = await repository.listLeads({});
  assert.equal(leads[0].sourceOrigin, 'ad_automation');
  assert.equal(leads[0].automationTriggered, true);
});

test('webhook: conserva la referencia del anuncio de Meta para el vendedor', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ig-business', messaging: [{
      sender: { id: 'cust-ad' }, recipient: { id: 'ig-business' }, timestamp: 1,
      referral: {
        source: 'ADS', type: 'OPEN_THREAD', ref: 'campana-verano', ad_id: '2385123456789',
        ads_context_data: { ad_title: 'Bidones para empresas' },
      },
      message: { mid: 'mid-ad', text: 'Quiero cotizar 20 litros' },
    }] }],
  });
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(result.processed, 1);
  const [lead] = await repository.listLeads({});
  assert.equal(lead.sourceAdId, '2385123456789');
  assert.deepEqual(lead.sourceContext, {
    source: 'ADS', type: 'OPEN_THREAD', ref: 'campana-verano',
    adId: '2385123456789', adTitle: 'Bidones para empresas',
  });
});

test('webhook: completa la atribución si Meta la envía después del primer mensaje', async () => {
  const { handler, repository } = makeHandler();
  const first = igPayload('mid-first', 'Hola', 'cust-late-ad');
  await handler.handle({ rawBody: first, signature: signatureFor(first, 'secret') });
  const second = JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ig-business', messaging: [{
      sender: { id: 'cust-late-ad' }, recipient: { id: 'ig-business' }, timestamp: 2,
      referral: { source: 'ADS', ad_id: 'ad-late', ads_context_data: { ad_title: 'Maquila Agua ReNew' } },
      message: { mid: 'mid-second', text: 'Quiero maquila' },
    }] }],
  });
  await handler.handle({ rawBody: second, signature: signatureFor(second, 'secret') });
  const [lead] = await repository.listLeads({});
  assert.equal(lead.sourceAdId, 'ad-late');
  assert.equal(lead.sourceContext.adTitle, 'Maquila Agua ReNew');
});

test('webhook: los adjuntos se conservan sin enviarlos al clasificador', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ig-business', time: 1, messaging: [{ sender: { id: 'cust-9' }, recipient: { id: 'ig-business' }, timestamp: 1, message: { mid: 'mid-img', attachments: [{ type: 'image' }] } }] }],
  });
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(result.processed, 1);
  assert.equal(result.ignored, 0);
  const [lead] = await repository.listLeads({});
  const [message] = await repository.listMessages(lead.id);
  assert.equal(message.content, '[Imagen adjunta]');
  assert.equal(lead.processingVersion, null);
});

test('webhook: ecos de Meta Business Agent se almacenan sin generar respuestas', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ig-business', time: 1, messaging: [{ sender: { id: 'ig-business' }, recipient: { id: 'cust-1' }, timestamp: 1, message: { mid: 'mid-echo', text: '¡Perfecto!...', is_echo: true } }] }],
  });
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(result.processed, 1);
  const leads = await repository.listLeads({});
  assert.equal(leads.length, 1);
  const messages = await repository.listMessages(leads[0].id);
  assert.equal(messages[0].actorType, 'meta_business_agent');
  assert.equal(messages[0].direction, 'outbound');
});

test('webhook: mensaje con sender === recipient (cuenta propia) se ignora', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ig-business', time: 1, messaging: [{ sender: { id: 'ig-business' }, recipient: { id: 'ig-business' }, timestamp: 1, message: { mid: 'mid-self', text: 'hola' } }] }],
  });
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(result.processed, 0);
  const leads = await repository.listLeads({});
  assert.equal(leads.length, 0);
});

test('webhook: el resolver de perfil llena meta_username al crear el lead', async () => {
  const { handler, repository } = makeHandler({ profileResolver: async () => '@prospecto_real' });
  const rawBody = igPayload('mid-user', 'Quiero 20 litros');
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(result.processed, 1);
  const leads = await repository.listLeads({});
  assert.equal(leads[0].metaUsername, '@prospecto_real');
});

test('webhook: sin resolver de perfil, meta_username queda null sin romper', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = igPayload('mid-user-2', 'Quiero 20 litros');
  const result = await handler.handle({ rawBody, signature: signatureFor(rawBody, 'secret') });
  assert.equal(result.processed, 1);
  const leads = await repository.listLeads({});
  assert.equal(leads[0].metaUsername, null);
});

test('webhook: sin appSecret configurado no exige firma', async () => {
  const { handler, repository } = makeHandler({ appSecret: null });
  const rawBody = igPayload('mid-4', 'Hola');
  const result = await handler.handle({ rawBody, signature: null });
  assert.equal(result.processed, 1);
  const leads = await repository.listLeads({});
  assert.equal(leads.length, 1);
});

test('webhook: webhook duplicado no duplica mensajes (idempotencia)', async () => {
  const { handler, repository } = makeHandler();
  const rawBody = igPayload('mid-5', 'Quiero 20 litros');
  const sig = signatureFor(rawBody, 'secret');
  await handler.handle({ rawBody, signature: sig });
  const second = await handler.handle({ rawBody, signature: sig });
  assert.equal(second.duplicates, 1);
  const leads = await repository.listLeads({});
  const messages = await repository.listMessages(leads[0].id);
  assert.equal(messages.length, 1); // solo inbound observado, sin respuesta ni duplicado
});
