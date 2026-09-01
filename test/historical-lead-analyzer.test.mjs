import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { IntakeClassifier } from '../src/ai/intake-classifier.mjs';
import { analyzeHistoricalLeads } from '../src/meta/historical-lead-analyzer.mjs';

async function imported(repository, id, messages) {
  const lead = await repository.createLead({ sourceChannel: 'facebook_messenger', sourceOrigin: 'imported', sourceConversationId: id, metaUserId: id });
  for (const [index, content] of messages.entries()) {
    await repository.appendMessage({ leadId: lead.id, channel: lead.sourceChannel, direction: 'inbound', actorType: 'user', externalMessageId: `${id}-${index}`, content, sourceCreatedAt: new Date(2026, 7, 25, 10, index) });
  }
  return lead;
}

test('históricos: dry-run no modifica ni crea respuestas', async () => {
  const repository = new InMemoryLeadRepository();
  const lead = await imported(repository, 'history-1', ['Quiero 20 litros con mi marca', 'Mi número es 955623069']);
  const summary = await analyzeHistoricalLeads({ repository, classifier: new IntakeClassifier({ provider: null }), apply: false });
  assert.equal(summary.changed, 1);
  assert.equal((await repository.findLeadById(lead.id)).status, 'NEW');
  assert.equal((await repository.listMessages(lead.id)).filter((message) => message.direction === 'outbound').length, 0);
});

test('históricos: apply acumula datos y deja el prospecto listo sin responder', async () => {
  const repository = new InMemoryLeadRepository();
  const lead = await imported(repository, 'history-2', ['Quiero 20 litros con mi marca', 'Mi número es 955623069']);
  await analyzeHistoricalLeads({ repository, classifier: new IntakeClassifier({ provider: null }), apply: true });
  const updated = await repository.findLeadById(lead.id);
  assert.equal(updated.status, 'READY_FOR_WHATSAPP');
  assert.equal(updated.phoneE164, '+51955623069');
  assert.equal(updated.product, '20l');
  assert.equal(updated.modality, 'maquila');
  assert.equal((await repository.listMessages(lead.id)).filter((message) => message.direction === 'outbound').length, 0);
  assert.ok((await repository.listEvents(lead.id)).some((event) => event.eventType === 'HISTORY_ANALYZED'));
});

test('históricos: proveedor se etiqueta y cierra sin respuesta', async () => {
  const repository = new InMemoryLeadRepository();
  const lead = await imported(repository, 'history-3', ['Somos una agencia de marketing y podemos manejar sus redes']);
  await analyzeHistoricalLeads({ repository, classifier: new IntakeClassifier({ provider: null }), apply: true });
  const updated = await repository.findLeadById(lead.id);
  assert.equal(updated.conversationType, 'service_provider');
  assert.equal(updated.status, 'CLOSED');
  assert.equal((await repository.listMessages(lead.id)).length, 1);
});
