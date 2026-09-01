import assert from 'node:assert/strict';
import test from 'node:test';
import { LeadService } from '../src/leads/lead-service.mjs';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { SocialLeadIntake } from '../src/meta/social-lead-intake.mjs';

function fakeRouter(resultOrFn) {
  return {
    classify: async ({ text }) => (typeof resultOrFn === 'function' ? resultOrFn(text) : resultOrFn),
  };
}

const COMMERCIAL = (extraction = {}, overrides = {}) => ({
  conversationType: 'commercial_lead', confidence: 0.99, reasonCode: 'test',
  extraction: { phone: null, product: null, modality: null, ...extraction }, ...overrides,
});

function makeService({ router, sender = null, windowHours = 24, autoReplyEnabled = true, replyCooldownMs = 60_000 } = {}) {
  const repository = new InMemoryLeadRepository();
  const service = new LeadService({
    repository,
    router: router ?? fakeRouter(COMMERCIAL()),
    intake: new SocialLeadIntake(),
    sender,
    windowHours,
    autoReplyEnabled,
    replyCooldownMs,
  });
  return { service, repository };
}

function inbound(overrides = {}) {
  return {
    channel: 'instagram', externalMessageId: `mid-${Math.random()}`, sourceConversationId: 'conv-1',
    sourceOrigin: 'ad_automation', automationTriggered: true,
    sender: { id: 'user-1', username: 'prospecto' }, text: 'Hola', ...overrides,
  };
}

test('mensaje automation_triggered: apertura ligera, sin clasificar, sin bloque completo', async () => {
  let classified = false;
  const { service, repository } = makeService({
    router: { classify: async () => { classified = true; return COMMERCIAL(); } },
  });
  const result = await service.handleInboundMessage(inbound({ automationTriggered: true }));
  assert.equal(classified, false);
  assert.equal(result.replies.length, 1);
  // Mensaje predeterminado con saludo (según MD): bloque de captación completo.
  assert.match(result.replies[0].content, /Bidón de 20 L/i);
  assert.match(result.replies[0].content, /número de WhatsApp/i);

  const lead = await repository.findLeadById(result.lead.id);
  assert.equal(lead.status, 'COLLECTING');
  assert.equal(lead.conversationType, null);
});

test('primer mensaje real sin datos: bloque completo una sola vez, con saludo', async () => {
  const { service, repository } = makeService();
  // 1) mensaje real sin datos extraíbles
  const r1 = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'Hola, ¿me pueden informar?' }));
  assert.equal(r1.replies.length, 1);
  assert.match(r1.replies[0].content, /Buenos días|Buenas tardes|Buenas noches/);
  assert.match(r1.replies[0].content, /número de WhatsApp/i);
  assert.match(r1.replies[0].content, /Bidón de 20 L/i);
  const lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.initialSocialMessageSent, true);

  // 2) segundo mensaje real sin datos (dentro de la ventana de ráfaga): se guarda sin responder
  const r2 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-2', text: 'Quiero información' }));
  assert.equal(r2.replies.length, 0);
  assert.equal(r2.coalesced, true);
  // El bloque completo sigue sin repetirse: el lead conserva su estado.
  const after = await repository.findLeadById(r1.lead.id);
  assert.equal(after.initialSocialMessageSent, true);
});

test('captura incremental en cualquier orden: producto luego teléfono', async () => {
  const router = fakeRouter((text) => {
    if (text === '20 litros') return COMMERCIAL({ product: '20l' });
    if (text === '955623069') return COMMERCIAL({ phone: '955623069' });
    if (text === 'con mi marca') return COMMERCIAL({ modality: 'maquila' });
    return COMMERCIAL();
  });
  const { service, repository } = makeService({ router });

  const r1 = await service.handleInboundMessage(inbound({ automationTriggered: false, text: '20 litros' }));
  let lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.product, '20l');
  assert.equal(lead.status, 'WAITING_PHONE');
  assert.match(r1.replies[0].content, /número de WhatsApp/i);
  assert.doesNotMatch(r1.replies[0].content, /producto/i);

  const r2 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-2', text: '955623069' }));
  lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.phoneE164, '+51955623069');
  // Sin modalidad todavía: NO pasa a Listo; el bot pregunta la modalidad.
  assert.equal(lead.status, 'WAITING_MODALITY');
  assert.match(r2.replies[0].content, /maquila|distribución|marca/i);
  assert.doesNotMatch(r2.replies[0].content, /producto/i);

  const r3 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-3', text: 'con mi marca' }));
  lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.modality, 'maquila');
  assert.equal(lead.status, 'READY_FOR_WHATSAPP');
  assert.match(r3.replies[0].content, /WhatsApp/i);
});

test('primer mensaje con producto: saluda y pide WhatsApp (atención humana)', async () => {
  const router = fakeRouter(COMMERCIAL({ product: '20l' }));
  const { service, repository } = makeService({ router });
  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'Cuánto cuesta el bidón de 20 litros' }));
  const lead = await repository.findLeadById(r.lead.id);
  assert.equal(lead.status, 'WAITING_PHONE');
  // El primer contacto SIEMPRE saluda, aunque el cliente ya pidió un producto.
  assert.match(r.replies[0].content, /Buenos días|Buenas tardes|Buenas noches/);
  assert.match(r.replies[0].content, /número de WhatsApp/i);
});

test('teléfono en el primer mensaje: saluda y pide la modalidad', async () => {
  const router = fakeRouter(COMMERCIAL({ phone: '955623069' }));
  const { service, repository } = makeService({ router });
  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'mi número es 955623069' }));
  const lead = await repository.findLeadById(r.lead.id);
  assert.equal(lead.phoneE164, '+51955623069');
  assert.equal(lead.status, 'WAITING_MODALITY');
  assert.match(r.replies[0].content, /Buenos días|Buenas tardes|Buenas noches/);
  assert.match(r.replies[0].content, /maquila|distribución|marca/i);
});

test('ráfaga del anuncio: la primera responde, las duplicadas se silencian', async () => {
  const { service, repository } = makeService();
  const r1 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'ad-1', text: 'Quiero una cotización para mi negocio' }));
  assert.equal(r1.replies.length, 1); // el bloque de captación

  const r2 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'ad-2', text: 'Quiero una cotización para mi negocio' }));
  assert.equal(r2.replies.length, 0);
  assert.equal(r2.coalesced, true);
  const r3 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'ad-3', text: 'Quiero una cotización para mi negocio' }));
  assert.equal(r3.replies.length, 0);
  assert.equal(r3.coalesced, true);

  const messages = await repository.listMessages(r1.lead.id);
  assert.equal(messages.filter((m) => m.direction === 'inbound').length, 3);
  assert.equal(messages.filter((m) => m.direction === 'outbound').length, 1); // solo una respuesta
});

test('mensaje con datos durante la ráfaga: sí responde', async () => {
  const router = fakeRouter((text) => (text.includes('955623069') ? COMMERCIAL({ phone: '955623069' }) : COMMERCIAL()));
  const { service } = makeService({ router });
  await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'ad-1', text: 'Quiero una cotización' }));
  const r2 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'ad-2', text: 'mi número es 955623069' }));
  assert.equal(r2.coalesced, undefined);
  assert.ok(r2.replies.length >= 1);
  assert.match(r2.replies[0].content, /maquila|distribución|marca/i);
});

test('modalidad: máximo 2 preguntas y luego se obvia a Listo', async () => {
  const router = fakeRouter((text) => (text.includes('999999999') ? COMMERCIAL({ phone: '999999999' }) : COMMERCIAL()));
  const { service, repository } = makeService({ router, replyCooldownMs: 0 });
  const r1 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'm1', text: 'Hola' }));
  const r2 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'm2', text: '999999999' }));
  assert.match(r2.replies[0].content, /maquila|distribución|marca/i);
  const r3 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'm3', text: '¿y los precios?' }));
  assert.match(r3.replies[0].content, /maquila|distribución|marca/i); // segunda pregunta

  const r4 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'm4', text: 'ok' }));
  const lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.status, 'READY_FOR_WHATSAPP'); // se obvia la modalidad
  assert.match(r4.replies[0].content, /WhatsApp/i); // mensaje de completo
  const events = await repository.listEvents(lead.id);
  assert.ok(events.some((e) => e.eventType === 'MODALITY_SKIPPED'));
});

test('cliente con datos completos que vuelve: respuesta breve, sin recapturar', async () => {
  const router = fakeRouter(COMMERCIAL({ phone: '955623069', modality: 'maquila' }));
  const { service, repository } = makeService({ router });
  const r1 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'v1', text: 'Quiero 20 litros con mi marca, mi número es 955623069' }));
  const lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.status, 'READY_FOR_WHATSAPP');

  const r2 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'v2', text: 'Hola, ¿siguen disponibles?' }));
  assert.equal(r2.replies.length, 1);
  // Respuesta cálida: saluda, avisa de la información por WhatsApp y ofrece ayuda — sin recapturar.
  assert.match(r2.replies[0].content, /Buenos días|Buenas tardes|Buenas noches/i);
  assert.match(r2.replies[0].content, /WhatsApp/i);
  assert.doesNotMatch(r2.replies[0].content, /número de WhatsApp/i);
});

test('no pierde datos previos: modalidad + teléfono en mensajes separados', async () => {
  const router = fakeRouter((text) => {
    if (text === 'con mi marca') return COMMERCIAL({ modality: 'maquila' });
    if (text === '999999999') return COMMERCIAL({ phone: '999999999' });
    return COMMERCIAL();
  });
  const { service, repository } = makeService({ router });
  await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'con mi marca' }));
  const r2 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-2', text: '999999999' }));
  const lead = await repository.findLeadById(r2.lead.id);
  assert.equal(lead.modality, 'maquila');
  assert.equal(lead.phoneE164, '+51999999999');
  assert.equal(lead.status, 'READY_FOR_WHATSAPP');
});

test('los tres datos en un solo mensaje → READY_FOR_WHATSAPP directo', async () => {
  const router = fakeRouter(COMMERCIAL({ phone: '955623069', product: '625ml', modality: 'maquila' }));
  const { service, repository } = makeService({ router });
  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, text: '625 ml con mi marca, mi número es 955623069' }));
  const lead = await repository.findLeadById(r.lead.id);
  assert.equal(lead.product, '625ml');
  assert.equal(lead.modality, 'maquila');
  assert.equal(lead.phoneE164, '+51955623069');
  assert.equal(lead.status, 'READY_FOR_WHATSAPP');
  assert.match(r.replies[0].content, /WhatsApp/i);
});

test('proveedor: respuesta institucional y lead cerrado; no pide datos', async () => {
  const router = fakeRouter({ conversationType: 'service_provider', confidence: 0.99, extraction: {} });
  const { service, repository } = makeService({ router });
  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'Somos una agencia de marketing' }));
  const lead = await repository.findLeadById(r.lead.id);
  assert.equal(lead.status, 'CLOSED');
  assert.equal(lead.conversationType, 'service_provider');
  assert.equal(r.replies.length, 1);
  assert.doesNotMatch(r.replies[0].content, /número de WhatsApp/i);
});

test('spam: sin respuesta, lead cerrado', async () => {
  const router = fakeRouter({ conversationType: 'spam_or_irrelevant', confidence: 0.99, extraction: {} });
  const { service, repository } = makeService({ router });
  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'Gana miles de soles' }));
  const lead = await repository.findLeadById(r.lead.id);
  assert.equal(lead.status, 'CLOSED');
  assert.equal(r.replies.length, 0);
});

test('unclear: primer contacto recibe la captación; luego aclaración hasta 2 veces y humano', async () => {
  const router = fakeRouter({ conversationType: 'unclear', confidence: 0.4, extraction: {} });
  const { service, repository } = makeService({ router });

  // Primer contacto ambiguo: NO aclaración — saludo + mensaje de captación (MD).
  const r1 = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'Somos una agencia' }));
  let lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.clarificationCount, 0);
  assert.equal(lead.controlMode, 'AUTO');
  assert.equal(lead.initialSocialMessageSent, true);
  assert.match(r1.replies[0].content, /Bidón de 20 L/i);
  assert.doesNotMatch(r1.replies[0].content, /indicarme un poco m[áa]s/i);

  // Mensajes posteriores ambiguos: sí piden aclaración (1ª y 2ª), luego humano.
  await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-2', text: '¿?' }));
  lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.clarificationCount, 1);
  assert.equal(lead.controlMode, 'AUTO');

  await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-3', text: '¿?' }));
  lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.clarificationCount, 2);
  assert.equal(lead.controlMode, 'AUTO');

  const r4 = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-4', text: '¿?' }));
  lead = await repository.findLeadById(r1.lead.id);
  assert.equal(lead.controlMode, 'HUMAN');
  assert.equal(lead.clarificationCount, 3);
  assert.match(r4.replies[0].content, /asesor/i);
});

test('control_mode HUMAN: guarda el mensaje pero no responde', async () => {
  const { service, repository } = makeService();
  const created = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'Hola' }));
  await service.setControlMode(created.lead.id, 'HUMAN', 'kennedy');

  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-2', text: '¿Precios?' }));
  assert.equal(r.replies.length, 0);
  const messages = await repository.listMessages(created.lead.id);
  assert.equal(messages.length, 3); // saludo + confirmación + inbound guardado
});

test('idempotencia: el mismo externalMessageId se procesa una sola vez', async () => {
  const { service, repository } = makeService();
  const first = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-unico', text: 'Hola' }));
  const second = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-unico', text: 'Hola' }));
  assert.equal(second.duplicate, true);
  const messages = await repository.listMessages(first.lead.id);
  assert.equal(messages.length, 2); // inbound + reply, sin duplicado
});

test('post-contacto: lead CONTACTED_MANUALLY responde cortésmente sin re-capturar', async () => {
  const router = fakeRouter(COMMERCIAL({ phone: '955623069' }));
  const { service, repository } = makeService({ router });
  const created = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'mi número es 955623069' }));
  await service.markWhatsappOpened(created.lead.id, 'kennedy');
  await service.markContacted(created.lead.id, 'kennedy');

  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-2', text: '¿Me pueden dar más info?' }));
  assert.ok(r.replies.length >= 1);
  assert.doesNotMatch(r.replies[0].content, /número de WhatsApp/i);
  const lead = await repository.findLeadById(created.lead.id);
  assert.equal(lead.status, 'CONTACTED_MANUALLY');
});

test('corrección de teléfono: CONTACT_OPENED vuelve al flujo (WAITING_MODALITY sin modalidad)', async () => {
  const router = fakeRouter(COMMERCIAL({ phone: '955623069' }));
  const { service, repository } = makeService({ router });
  const created = await service.handleInboundMessage(inbound({ automationTriggered: false, text: '955623069' }));
  await service.markWhatsappOpened(created.lead.id, 'kennedy');

  await service.correctPhone(created.lead.id, '999999999', 'kennedy');
  const lead = await repository.findLeadById(created.lead.id);
  assert.equal(lead.phoneE164, '+51999999999');
  // Sin modalidad, el lead reactivado espera ese dato antes de volver a Listo.
  assert.equal(lead.status, 'WAITING_MODALITY');

  const history = await repository.listPhoneHistory(created.lead.id);
  assert.equal(history.length, 2);
  assert.equal(history[1].previousPhone, '+51955623069');
  assert.equal(history[1].newPhone, '+51999999999');
});

test('markContacted: encola confirmación Meta si está dentro de la ventana de 24h', async () => {
  const sent = [];
  const sender = { sendText: async ({ purpose, content }) => { sent.push({ purpose, content }); return { ok: true }; } };
  const router = fakeRouter(COMMERCIAL({ phone: '955623069' }));
  const { service, repository } = makeService({ router, sender });

  const created = await service.handleInboundMessage(inbound({ automationTriggered: false, text: '955623069', timestamp: new Date().toISOString() }));
  await service.markWhatsappOpened(created.lead.id, 'kennedy');
  await service.markContacted(created.lead.id, 'kennedy');

  const lead = await repository.findLeadById(created.lead.id);
  assert.equal(lead.status, 'CONTACTED_MANUALLY');
  assert.ok(lead.contactedAt);
  assert.equal(lead.metaConfirmationSentAt, null);
  assert.equal(lead.metaConfirmationBlocked, false);
  assert.equal(sent.length, 0, 'LeadService no envía directamente');
  const messages = await repository.listMessages(created.lead.id);
  const confirmation = messages.find((m) => m.purpose === 'meta_confirmation');
  assert.ok(confirmation, 'debe existir una confirmación Meta');
  assert.equal(confirmation.deliveryStatus, 'PENDING');
  assert.match(confirmation.content, /WhatsApp/i);
});

test('markContacted: NO confirma si la ventana de 24h expiró', async () => {
  const sent = [];
  const sender = { sendText: async ({ purpose, content }) => { sent.push({ purpose, content }); return { ok: true }; } };
  const router = fakeRouter(COMMERCIAL({ phone: '955623069' }));
  const { service, repository } = makeService({ router, sender });

  const oldTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const created = await service.handleInboundMessage(inbound({ automationTriggered: false, text: '955623069', timestamp: oldTimestamp }));
  await service.markWhatsappOpened(created.lead.id, 'kennedy');
  await service.markContacted(created.lead.id, 'kennedy');

  const lead = await repository.findLeadById(created.lead.id);
  assert.equal(lead.metaConfirmationBlocked, true);
  assert.equal(lead.metaConfirmationSentAt, null);
  assert.equal(sent.some((m) => m.purpose === 'meta_confirmation'), false);
});

test('mensajes concurrentes del mismo lead se serializan (mutex)', async () => {
  let calls = 0;
  const router = {
    classify: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return COMMERCIAL({ product: '20l' });
    },
  };
  const { service } = makeService({ router });
  const results = await Promise.all([
    service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-a', text: '20 litros' })),
    service.handleInboundMessage(inbound({ automationTriggered: false, externalMessageId: 'mid-b', text: '20 litros' })),
  ]);
  assert.equal(results.length, 2);
  assert.equal(calls, 2);
});

test('auto-reply apagado: guarda el mensaje pero NO responde (control manual)', async () => {
  const { service, repository } = makeService({ autoReplyEnabled: false });
  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, text: 'Quiero 20 litros, mi número es 955623069' }));
  assert.equal(r.autoReplyDisabled, true);
  assert.equal(r.replies.length, 0);
  const lead = await repository.findLeadById(r.lead.id);
  assert.equal(lead.status, 'NEW'); // no avanza estados, solo se guarda
  assert.equal(lead.conversationType, null); // no clasifica (sin respuesta)
  const messages = await repository.listMessages(r.lead.id);
  assert.equal(messages.length, 1); // solo el inbound guardado
  const events = await repository.listEvents(r.lead.id);
  assert.ok(events.some((e) => e.eventType === 'INBOUND_STORED'));
});

test('auto-reply encendido: responde normalmente', async () => {
  const { service } = makeService({ autoReplyEnabled: true });
  const r = await service.handleInboundMessage(inbound({ automationTriggered: false, text: '955623069' }));
  assert.equal(r.replies.length, 1);
});

test('setAutoReplyEnabled alterna el interruptor', async () => {
  const { service } = makeService({ autoReplyEnabled: false });
  assert.equal(service.autoReplyEnabled, false);
  assert.equal(service.setAutoReplyEnabled(true), true);
  assert.equal(service.autoReplyEnabled, true);
});
