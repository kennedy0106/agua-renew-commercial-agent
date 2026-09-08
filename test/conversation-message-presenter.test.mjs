import assert from 'node:assert/strict';
import test from 'node:test';
import { presentConversationMessages, sanitizeConversationText } from '../src/crm/conversation-message-presenter.mjs';

test('presenta el historial en orden cronológico aunque Meta lo entregue al revés', () => {
  const messages = presentConversationMessages([
    { id: 'new', sequenceNo: 1, direction: 'inbound', actorType: 'user', content: 'Segundo', sourceCreatedAt: '2026-09-02T10:02:00Z' },
    { id: 'old', sequenceNo: 2, direction: 'inbound', actorType: 'user', content: 'Primero', sourceCreatedAt: '2026-09-02T10:01:00Z' },
  ]);
  assert.deepEqual(messages.map((message) => message.id), ['old', 'new']);
});

test('clasifica eventos de Meta, extrae el enlace y conserva el contenido original', () => {
  const raw = 'Estás respondiendo el comentario de un usuario. Ver comentario(https://facebook.com/post/123)';
  const [message] = presentConversationMessages([{ id: 'event', direction: 'outbound', actorType: 'meta_business_agent', content: raw, sourceCreatedAt: '2026-09-02T10:00:00Z' }]);
  assert.equal(message.messageKind, 'event');
  assert.equal(message.eventKind, 'comment_context');
  assert.equal(message.eventLink, 'https://facebook.com/post/123');
  assert.equal(message.content, raw);
});

test('limpia el carácter de reemplazo solo para presentación', () => {
  const raw = '� Quiero una cotización';
  const [message] = presentConversationMessages([{ id: 'text', direction: 'inbound', actorType: 'user', content: raw }]);
  assert.equal(message.content, raw);
  assert.equal(message.displayContent, 'Quiero una cotización');
  assert.equal(sanitizeConversationText(raw), 'Quiero una cotización');
});

test('reconoce contenido multimedia y agrupa duplicados del mismo segundo', () => {
  const messages = presentConversationMessages([
    { id: 'media', direction: 'inbound', actorType: 'user', content: '', sourceCreatedAt: '2026-09-02T09:00:00Z' },
    { id: 'one', direction: 'outbound', actorType: 'meta_business_agent', content: 'Ana respondió un anuncio.', sourceCreatedAt: '2026-09-02T10:00:00Z' },
    { id: 'two', direction: 'outbound', actorType: 'meta_business_agent', content: 'Ana respondió un anuncio.', sourceCreatedAt: '2026-09-02T10:00:01Z' },
  ]);
  assert.equal(messages[0].messageKind, 'media');
  assert.equal(messages.length, 2);
  assert.equal(messages[1].duplicateCount, 2);
});

test('no agrupa textos iguales enviados en momentos distintos', () => {
  const messages = presentConversationMessages([
    { id: 'one', direction: 'inbound', actorType: 'user', content: 'Hola', sourceCreatedAt: '2026-09-02T10:00:00Z' },
    { id: 'two', direction: 'inbound', actorType: 'user', content: 'Hola', sourceCreatedAt: '2026-09-02T10:05:00Z' },
  ]);
  assert.equal(messages.length, 2);
});
