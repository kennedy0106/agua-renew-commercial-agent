import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEAD_STATUSES, CONTROL_MODES, CONVERSATION_TYPES, PRODUCTS, MODALITIES,
  ORIGINS, CHANNELS, isTerminalStatus, isValidTransition,
} from '../src/leads/lead-states.mjs';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';

function sampleLead(overrides = {}) {
  return {
    sourceChannel: 'instagram',
    sourceOrigin: 'ad_automation',
    sourceConversationId: 'conv-1',
    metaUserId: 'user-1',
    metaUsername: 'prospecto',
    automationTriggered: true,
    ...overrides,
  };
}

test('constantes de estado están completas', () => {
  assert.deepEqual(LEAD_STATUSES, [
    'NEW', 'COLLECTING', 'WAITING_PHONE', 'WAITING_MODALITY', 'READY_FOR_WHATSAPP',
    'CONTACT_OPENED', 'CONTACTED_MANUALLY', 'CLOSED',
  ]);
  assert.deepEqual(CONTROL_MODES, ['AUTO', 'HUMAN', 'PAUSED']);
  assert.ok(CONVERSATION_TYPES.includes('commercial_lead'));
  assert.ok(CONVERSATION_TYPES.includes('service_provider'));
  assert.ok(CONVERSATION_TYPES.includes('unclear'));
  assert.ok(PRODUCTS.includes('20l'));
  assert.ok(MODALITIES.includes('distribution_agua_renew'));
  assert.ok(ORIGINS.includes('ad_automation'));
  assert.ok(CHANNELS.includes('instagram'));
});

test('isTerminalStatus y reglas de transición', () => {
  assert.ok(isTerminalStatus('CLOSED'));
  assert.ok(!isTerminalStatus('NEW'));
  assert.ok(isValidTransition('NEW', 'COLLECTING'));
  assert.ok(isValidTransition('READY_FOR_WHATSAPP', 'CONTACT_OPENED'));
  assert.ok(isValidTransition('NEW', 'CLOSED')); // spam/proveedor se cierran directo
  assert.ok(!isValidTransition('NEW', 'CONTACTED_MANUALLY'));
});

test('in-memory: crear, buscar y actualizar lead', async () => {
  const repo = new InMemoryLeadRepository();
  const lead = await repo.createLead(sampleLead());
  assert.ok(lead.id);
  assert.equal(lead.status, 'NEW');
  assert.equal(lead.controlMode, 'AUTO');

  const byId = await repo.findLeadById(lead.id);
  assert.equal(byId.id, lead.id);

  const byConv = await repo.findLeadByExternalConversation({ channel: 'instagram', sourceConversationId: 'conv-1' });
  assert.equal(byConv.id, lead.id);

  const updated = await repo.updateLead(lead.id, { status: 'COLLECTING', product: '20l' });
  assert.equal(updated.status, 'COLLECTING');
  assert.equal(updated.product, '20l');
  assert.ok(updated.updatedAt >= lead.createdAt);
});

test('in-memory: teléfono como llave de correlación', async () => {
  const repo = new InMemoryLeadRepository();
  const lead = await repo.createLead(sampleLead({ sourceConversationId: 'conv-a' }));
  await repo.updateLead(lead.id, { phoneE164: '+51955623069' });
  const found = await repo.findLeadByPhone('+51955623069');
  assert.equal(found.id, lead.id);
});

test('in-memory: mensajes, eventos e historial de teléfonos', async () => {
  const repo = new InMemoryLeadRepository();
  const lead = await repo.createLead(sampleLead());

  const msg = await repo.appendMessage({
    leadId: lead.id, channel: 'instagram', direction: 'inbound',
    actorType: 'user', content: '20 litros', externalMessageId: 'ext-1',
  });
  assert.ok(msg.id);
  await repo.appendMessage({
    leadId: lead.id, channel: 'instagram', direction: 'outbound',
    actorType: 'automation', actorId: 'social_lead_intake', content: 'Perfecto.',
  });

  const messages = await repo.listMessages(lead.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, '20 litros');
  assert.equal(messages[0].direction, 'inbound');

  await repo.appendEvent({ leadId: lead.id, eventType: 'PHONE_CAPTURED', payload: { phone: '+51955623069' } });
  const events = await repo.listEvents(lead.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'PHONE_CAPTURED');

  await repo.recordPhoneHistory({ leadId: lead.id, previousPhone: null, newPhone: '+51955623069', reason: 'PHONE_CAPTURED' });
  await repo.recordPhoneHistory({ leadId: lead.id, previousPhone: '+51955623069', newPhone: '+51999999999', reason: 'PHONE_CORRECTED' });
  const history = await repo.listPhoneHistory(lead.id);
  assert.equal(history.length, 2);
  assert.equal(history[1].previousPhone, '+51955623069');
});

test('in-memory: listar con filtros y conteos para el panel', async () => {
  const repo = new InMemoryLeadRepository();
  await repo.createLead(sampleLead({ sourceChannel: 'instagram', sourceConversationId: 'list-1', status: 'READY_FOR_WHATSAPP', conversationType: 'commercial_lead', phoneE164: '+51955623069' }));
  await repo.createLead(sampleLead({ sourceChannel: 'facebook_messenger', sourceConversationId: 'list-2', status: 'WAITING_PHONE', conversationType: 'commercial_lead' }));
  await repo.createLead(sampleLead({ sourceChannel: 'instagram', sourceConversationId: 'list-3', status: 'CLOSED', conversationType: 'service_provider' }));

  const ready = await repo.listLeads({ status: 'READY_FOR_WHATSAPP' });
  assert.equal(ready.length, 1);

  const fb = await repo.listLeads({ channel: 'facebook_messenger' });
  assert.equal(fb.length, 1);

  const commercial = await repo.listLeads({ conversationType: 'commercial_lead' });
  assert.equal(commercial.length, 2);

  const counts = await repo.countLeadsByStatus();
  assert.deepEqual(counts, { READY_FOR_WHATSAPP: 1, WAITING_PHONE: 1, CLOSED: 1 });
});
