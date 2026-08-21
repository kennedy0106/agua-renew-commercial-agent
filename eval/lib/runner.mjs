/** Runner de evaluación (Bloque D): ejecuta escenarios contra el agente real
 * con el provider del modelo evaluado. Sin modificar producción: usa el
 * ConversationEngine en arquitectura agent, igual que el simulador. */

import { performance } from 'node:perf_hooks';
import { ConversationEngine } from '../../src/conversation/conversation-engine.mjs';
import { CommercialService } from '../../src/commercial/commercial-service.mjs';
import { CommercialToolRegistry } from '../../src/ai/commercial-tool-registry.mjs';
import { CommercialAgent } from '../../src/ai/commercial-agent.mjs';
import { InMemoryConversationRepository } from '../../src/repository/in-memory-conversation-repository.mjs';
import { createEvalProvider } from './providers.mjs';
import { gradeScenario } from './graders.mjs';
import { getNextBestAction } from '../../src/ai/sales-context.mjs';

async function createEngineForScenario({ scenario, provider, conversationIndex }) {
  const repository = new InMemoryConversationRepository();
  const commercialService = new CommercialService();
  const engine = new ConversationEngine({
    repository,
    commercialService,
    conversationArchitecture: 'agent',
    commercialAgent: new CommercialAgent({
      provider,
      tools: new CommercialToolRegistry({ commercialService }),
    }),
  });
  await engine.initialize({
    customerExternalId: `eval-${conversationIndex}-${scenario.id}`,
    channel: scenario.channel ?? 'local',
    mode: 'ai',
  });
  return engine;
}

/** Ejecuta un trabajo con timeout; el timer se limpia siempre (no mantiene el
 * event loop abierto tras completarse). */
async function withTurnTimeout(job, timeoutMs) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('turn timeout')), timeoutMs);
    });
    return await Promise.race([job(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Ejecuta un escenario multi-turno y devuelve el resultado evaluable. */
export async function runScenario({ scenario, provider, conversationIndex, timeoutMs = 60000 }) {
  const engine = await createEngineForScenario({ scenario, provider, conversationIndex });
  const replies = [];
  const toolsCalled = [];
  const toolsPerTurn = [];
  const usageLogs = [];
  const turnLatencies = [];
  const errors = [];

  for (const [i, text] of scenario.turns.entries()) {
    const usageBefore = engine.repository.aiUsageLogs.length;
    const t0 = performance.now();
    let snapshot;
    try {
      snapshot = await withTurnTimeout(() => engine.dispatch({ type: 'submit_text', value: text }), timeoutMs);
    } catch (error) {
      errors.push({ turn: i + 1, text, error: error?.message ?? String(error) });
      break;
    }
    turnLatencies.push(Math.round(performance.now() - t0));
    const botReplies = snapshot.messages.filter((m) => m.role === 'bot').map((m) => m.text);
    replies.push(botReplies.at(-1) ?? '');
    const turnUsage = engine.repository.aiUsageLogs.slice(usageBefore);
    usageLogs.push(...turnUsage);
    const turnToolNames = [...new Set(turnUsage.flatMap((u) => (u.parsedResponse?.tools ?? []).map((tool) => tool.name)))];
    toolsPerTurn.push(turnToolNames);
    for (const tool of turnToolNames) if (!toolsCalled.includes(tool)) toolsCalled.push(tool);
  }

  const finalState = engine.snapshot().state;
  const fullText = replies.join('\n');
  const lastUsage = usageLogs.at(-1);
  const finalNextAction = getNextBestAction(finalState);
  const nextAction = finalState.nextBestAction ?? finalNextAction.action;

  const result = {
    scenario,
    replies,
    fullText,
    toolsCalled: [...new Set(toolsCalled)],
    toolsPerTurn,
    finalState,
    nextAction,
    errors,
    usage: {
      requests: usageLogs.length,
      inputTokens: usageLogs.reduce((a, u) => a + (u.inputTokens ?? 0), 0),
      outputTokens: usageLogs.reduce((a, u) => a + (u.outputTokens ?? 0), 0),
      aiLatencyMs: usageLogs.reduce((a, u) => a + (u.latencyMs ?? 0), 0),
    },
    latencies: {
      turnMs: turnLatencies,
      lastAiLatencyMs: lastUsage?.latencyMs ?? null,
    },
  };
  const graded = gradeScenario(result);
  return { ...result, ...graded };
}

/** Ejecuta la evaluación completa de un dataset contra un provider. */
export async function runEvaluation({ scenarios, provider, onScenario = () => {}, concurrency = 2 }) {
  const results = [];
  let index = 0;
  const workerCount = Math.min(concurrency, scenarios.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = index++;
      if (i >= scenarios.length) return;
      const scenario = scenarios[i];
      try {
        const result = await runScenario({ scenario, provider, conversationIndex: i });
        results.push(result);
        onScenario({ index: i + 1, total: scenarios.length, scenarioId: scenario.id, critical: result.critical, errors: result.errors.length });
      } catch (error) {
        results.push({
          scenario, replies: [], fullText: '', toolsCalled: [], toolsPerTurn: [], finalState: {},
          nextAction: null, errors: [{ turn: 0, text: '', error: `run error: ${error?.message ?? error}` }],
          usage: { requests: 0, inputTokens: 0, outputTokens: 0, aiLatencyMs: 0 }, latencies: { turnMs: [] },
          grades: {}, critical: false,
        });
        onScenario({ index: i + 1, total: scenarios.length, scenarioId: scenario.id, error: error?.message });
      }
    }
  });
  await Promise.all(workers);
  results.sort((a, b) => a.scenario.id.localeCompare(b.scenario.id));
  return results;
}
