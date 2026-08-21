import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ConversationEngine } from '../src/conversation/conversation-engine.mjs';
import { PostgresConversationRepository } from '../src/repository/postgres-conversation-repository.mjs';
import { runMigrations } from '../scripts/migrate.mjs';
import { loadEnvironment } from '../src/config/environment.mjs';

loadEnvironment();
const enabled = process.env.RUN_POSTGRES_TESTS === '1' && Boolean(process.env.DATABASE_URL);
const connectionString = process.env.DATABASE_URL;

async function choose(engine, type, value) {
  return engine.dispatch({ type, value });
}

test('PostgreSQL persiste conversación, mensajes, cotización y handoff', { skip: !enabled }, async () => {
  const repository = new PostgresConversationRepository({ connectionString });
  await repository.connect();
  try {
    await runMigrations(repository.pool);
    const customerExternalId = `integration-${randomUUID()}`;
    const first = new ConversationEngine({ repository });
    await first.initialize({ customerExternalId });
    await choose(first, 'select_family', 'botella_1l_fliptop');
    await choose(first, 'select_modality', 'distribution_agua_renew');
    const completed = await choose(first, 'submit_quantity', '10');

    const messages = await repository.listMessages(completed.conversationId);
    const quoteRequests = await repository.listQuoteRequests(completed.conversationId);
    const turnMetrics = await repository.listTurnMetrics(completed.conversationId);
    assert.equal(completed.state.stage, 'complete');
    assert.ok(messages.some((message) => message.direction === 'inbound'));
    assert.ok(messages.some((message) => message.direction === 'outbound'));
    assert.deepEqual([...messages].map((message) => message.sequenceNo), [...messages].map((message) => message.sequenceNo).sort((a, b) => a - b));
    assert.equal(quoteRequests.length, 1);
    assert.equal(quoteRequests[0].product_id, 'distribution_botella_1l_fliptop');
    assert.equal(quoteRequests[0].quantity, 10);
    assert.equal(JSON.stringify(quoteRequests[0].validated_data_json).includes('amount_pen'), false);
    assert.ok(turnMetrics.length >= 3);
    assert.ok(turnMetrics.every((metric) => metric.total_latency_ms >= 0));

    const resumed = new ConversationEngine({ repository });
    const recovered = await resumed.initialize({ customerExternalId });
    assert.equal(recovered.conversationId, completed.conversationId);
    assert.deepEqual(recovered.messages, completed.messages);

    await resumed.dispatch({ type: 'restart' });
    // Pedido bajo el mínimo vigente: situación comercial explicada, sin handoff.
    await choose(resumed, 'select_family', 'bidon_20l');
    await choose(resumed, 'select_modality', 'maquila');
    const belowMinimum = await choose(resumed, 'submit_quantity', '30');
    assert.equal(belowMinimum.state.stage, 'await_quantity');
    assert.equal(belowMinimum.state.handoffRequired, false);
    assert.match(belowMinimum.messages.at(-1).text, /mínimo/);

    // Bloqueo real (galonera de maquila): persiste handoff.
    await resumed.dispatch({ type: 'restart' });
    await choose(resumed, 'select_family', 'galonera_10_5l');
    await choose(resumed, 'select_modality', 'maquila');
    const handoff = await choose(resumed, 'submit_quantity', '50');
    const handoffs = await repository.listHumanHandoffs(handoff.conversationId);
    assert.equal(handoff.state.handoffRequired, true);
    assert.equal(handoffs.length, 1);
    assert.deepEqual(handoffs[0].ambiguity_ids, ['maquila_galonera_scope']);
  } finally {
    await repository.close();
  }
});
