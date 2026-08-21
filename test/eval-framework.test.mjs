import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDataset, validateScenario, filterScenarios, categoryBreakdown } from '../eval/lib/dataset.mjs';
import { gradeScenario, gradePrice, gradeMinimum, gradePolicy, gradeRestricted, gradeChannel, gradeTone } from '../eval/lib/graders.mjs';
import { aggregateGrades, globalScore, criticalFailureSummary, categoryMatrix, THRESHOLDS } from '../eval/lib/scoring.mjs';
import { estimateCost, usageTotals, estimateRunCost, loadModels } from '../eval/lib/cost.mjs';
import { latencySummary, buildReport, renderMarkdown } from '../eval/lib/report.mjs';
import { runScenario, runEvaluation } from '../eval/lib/runner.mjs';
import { createScriptedProvider } from '../eval/lib/providers.mjs';

// ── Dataset (sección 47) ──

test('DATASET: carga 81 escenarios versionados con ids únicos y categorías válidas', () => {
  const { version, scenarios } = loadDataset();
  assert.equal(version, 1);
  assert.ok(scenarios.length >= 60, `esperado >= 60, hay ${scenarios.length}`);
  assert.equal(new Set(scenarios.map((s) => s.id)).size, scenarios.length);
  assert.equal(categoryBreakdown(scenarios).quotation, 12);
});

test('DATASET: la validación de schema detecta datasets inválidos', () => {
  const problems = validateScenario({ id: 'X', category: 'nope', channel: 'fax', turns: [] }, 0);
  assert.ok(problems.some((p) => p.includes('category')));
  assert.ok(problems.some((p) => p.includes('channel')));
  assert.ok(problems.some((p) => p.includes('turns')));
  const ok = validateScenario({ id: 'X', category: 'memory', channel: 'local', turns: ['Hola'] }, 0);
  assert.equal(ok.length, 0);
});

test('DATASET: filtros por límite, categoría y escenario', () => {
  const { scenarios } = loadDataset();
  assert.equal(filterScenarios(scenarios, { limit: 10 }).length, 10);
  assert.ok(filterScenarios(scenarios, { category: 'objections' }).every((s) => s.category === 'objections'));
  assert.equal(filterScenarios(scenarios, { scenarioId: 'E001' }).length, 1);
});

// ── Runner mocked (sin API) ──

test('RUNNER: ejecuta un escenario multi-turno con provider scripted y produce estructura evaluable', async () => {
  const { scenarios } = loadDataset();
  const scenario = scenarios.find((s) => s.id === 'N001');
  const result = await runScenario({ scenario, provider: createScriptedProvider(), conversationIndex: 1 });
  assert.equal(result.scenario.id, 'N001');
  assert.equal(result.replies.length, scenario.turns.length);
  assert.ok(typeof result.fullText === 'string');
  assert.ok(Array.isArray(result.toolsCalled));
  assert.equal(typeof result.nextAction, 'string');
  assert.ok(result.usage.requests >= 1);
  assert.ok(result.latencies.turnMs.length === scenario.turns.length);
  assert.equal(result.errors.length, 0);
});

test('RUNNER: runEvaluation mocked completa 3 escenarios sin errores', async () => {
  const { scenarios } = loadDataset();
  const selected = filterScenarios(scenarios, { scenarioId: 'A001,F001,M004' });
  const results = await runEvaluation({ scenarios: selected, provider: createScriptedProvider(), concurrency: 2 });
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => typeof r.critical === 'boolean'));
});

// ── Graders determinísticos (sección 12) ──

test('GRADER: price_accuracy valida precio correcto y rechaza incorrecto', () => {
  const base = { fullText: 'Para 20 paquetes, S/ 12.00 por paquete.', expect: {} };
  assert.equal(gradePrice({ ...base, expect: { priceExpected: 'S/ 12.00' } }).score, 2);
  assert.equal(gradePrice({ ...base, expect: { priceExpected: 'S/ 11.00' } }).score, 0);
  assert.equal(gradePrice({ ...base, expect: { priceWrong: 'S/ 9.00' } }).score, 2);
});

test('GRADER: minimum_accuracy y policy_accuracy son críticos y estrictos', () => {
  const min = gradeMinimum({ fullText: 'El pedido mínimo es de 20 paquetes.', expect: { minimumExpected: '20 paquetes' } });
  assert.equal(min.score, 2);
  assert.equal(min.critical, true);
  const badMin = gradeMinimum({ fullText: 'El pedido mínimo es de 30 paquetes.', expect: { minimumExpected: '50 unidades' } });
  assert.equal(badMin.score, 0);
  const policy = gradePolicy({ fullText: 'Puede pagar el 50% de adelanto.', expect: { forbiddenPolicyTerms: ['50%'] } });
  assert.equal(policy.score, 0);
  assert.equal(policy.critical, true);
});

test('GRADER: restricted_information_safety bloquea términos y marcas', () => {
  const leak = gradeRestricted({ fullText: 'Usamos ósmosis inversa y ozono.', toolsCalled: ['get_information_boundary'], expect: {} });
  assert.equal(leak.score, 0);
  assert.equal(leak.critical, true);
  const brands = gradeRestricted({ fullText: 'Maquilamos para Coca-Cola y San Luis.', toolsCalled: [], expect: {} });
  assert.equal(brands.score, 0);
  const clean = gradeRestricted({ fullText: 'Esa información es confidencial; con gusto lo derivo.', toolsCalled: ['get_information_boundary'], expect: {} });
  assert.equal(clean.score, 2);
});

test('GRADER: channel_compliance bloquea derivación a WhatsApp y display name', () => {
  const bad = gradeChannel({ fullText: 'Mejor escríbanos por WhatsApp.', scenario: { channel: 'instagram', displayName: null } });
  assert.equal(bad.score, 0);
  const name = gradeChannel({ fullText: 'Hola Sebastian, ¿en qué le ayudo?', scenario: { channel: 'messenger', displayName: 'Sebastian Falcon' } });
  assert.equal(name.score, 0);
  const ok = gradeChannel({ fullText: '¿Qué presentación le interesa?', scenario: { channel: 'instagram', displayName: 'Sebastian Falcon' } });
  assert.equal(ok.score, 2);
});

test('GRADER: tone_consistency detecta tuteo en la respuesta', () => {
  assert.equal(gradeTone({ fullText: '¿Qué presentación le interesa?' }).score, 2);
  assert.equal(gradeTone({ fullText: '¿Qué presentación te interesa?' }).score, 1);
});

test('GRADER: gradeScenario marca critical cuando un grader crítico falla', () => {
  const result = {
    scenario: { id: 'X', category: 'quotation', turns: ['20 paquetes'], expect: { priceExpected: 'S/ 12.00' } },
    replies: ['Le sale S/ 9.00'], fullText: 'Le sale S/ 9.00', toolsCalled: [], toolsPerTurn: [],
    finalState: {}, nextAction: 'answer_current_question',
  };
  const graded = gradeScenario(result);
  assert.equal(graded.critical, true);
  assert.equal(graded.grades.price_accuracy.score, 0);
});

// ── Scoring (secciones 11/24) ──

test('SCORING: umbrales definidos y agregación por porcentaje', () => {
  assert.equal(THRESHOLDS.price_accuracy, 100);
  assert.equal(THRESHOLDS.no_repetition, 98);
  const results = [
    { scenario: { id: 'A', category: 'quotation', turns: ['20 paquetes'] }, critical: true, replies: ['ok'], grades: { price_accuracy: { score: 2, critical: true }, policy_accuracy: { score: 2, critical: true } } },
    { scenario: { id: 'B', category: 'quotation', turns: ['20 paquetes'] }, critical: true, replies: ['mal'], grades: { price_accuracy: { score: 0, critical: true }, policy_accuracy: { score: 2, critical: true } } },
  ];
  const summary = aggregateGrades(results);
  assert.equal(summary.price_accuracy.pct, 50);
  assert.equal(summary.price_accuracy.pass, 1);
  assert.equal(criticalFailureSummary(results).length, 1);
});

test('SCORING: score global ponderado y matriz de categorías', () => {
  const results = [];
  for (const id of ['A001', 'A002', 'F001']) {
    results.push({
      scenario: { id, category: id.startsWith('A') ? 'first_contact' : 'objections' },
      replies: ['Hola'], critical: false,
      grades: Object.fromEntries(['price_accuracy', 'minimum_accuracy', 'policy_accuracy', 'restricted_information_safety', 'commercial_fact_accuracy',
        'memory_accuracy', 'no_repetition', 'channel_compliance', 'sales_orientation', 'objection_handling', 'premature_close_avoidance',
        'naturalness', 'tone_consistency', 'brevity', 'next_step_quality', 'tool_selection_accuracy'].map((m) => [m, { score: 2, critical: false }])),
    });
  }
  const summary = aggregateGrades(results);
  const score = globalScore(summary, { latencyCostScore: 100 });
  assert.ok(score > 99, `score global ${score}`);
  const matrix = categoryMatrix(results);
  assert.equal(matrix.first_contact.pass, 2);
  assert.equal(matrix.objections.pass, 1);
});

// ── Latencia y costo (secciones 22/16) ──

test('LATENCIA: percentiles p50/p90/p95 correctos', () => {
  const s = latencySummary([100, 200, 300, 400, 500]);
  assert.equal(s.p50, 300);
  assert.equal(s.p90, 500);
  assert.equal(s.p95, 500);
  assert.equal(s.mean, 300);
  assert.equal(latencySummary([]).count, 0);
});

test('COSTO: estimación con pricing externo (no en código)', () => {
  const models = loadModels();
  assert.ok(models.models.deepseek_flash_v4.pricing.inputPer1M > 0);
  const cost = estimateCost({ usage: { inputTokens: 1_000_000, outputTokens: 0 }, pricing: models.models.deepseek_flash_v4.pricing });
  assert.ok(Math.abs(cost - models.models.deepseek_flash_v4.pricing.inputPer1M) < 0.0001);
  const totals = usageTotals([{ requests: 2, inputTokens: 100, outputTokens: 50 }, { requests: 1, inputTokens: 50, outputTokens: 25 }]);
  assert.equal(totals.requests, 3);
  assert.equal(totals.totalTokens, 225);
  const est = estimateRunCost(models.models.deepseek_flash_v4, 80);
  assert.ok(est.usage.requests > 0 && est.estimatedCostUSD > 0);
});

// ── Reporte (secciones 25/39) ──

test('REPORTE: buildReport y renderMarkdown generan salida legible', () => {
  const scenarioResults = [{
    scenario: { id: 'E001', category: 'quotation', turns: ['20 paquetes de 625'] },
    replies: ['De acuerdo. S/ 12.00.'], grades: { price_accuracy: { score: 0, critical: true, reason: 'x', violations: [] } }, critical: true,
  }];
  const report = buildReport({
    runId: 'test-run', timestamp: '2026-01-01T00:00:00Z', datasetVersion: 1,
    modelConfig: { key: 'm', label: 'Modelo Test', provider: 'deepseek', modelId: 'm', pricing: { inputPer1M: 0.27, outputPer1M: 1.1 } },
    scenarioResults, summary: aggregateGrades(scenarioResults), global: 50,
    criticalFailures: [{ scenarioId: 'E001', category: 'quotation', metric: 'price_accuracy', input: 'x', output: 'y', reason: 'precio mal' }],
    matrix: categoryMatrix(scenarioResults), turnLatencyMs: [100, 200], aiLatencyMs: [80, 150],
    usage: { requests: 2, inputTokens: 100, outputTokens: 50, totalTokens: 150 }, estimatedCostUSD: 0.01,
  });
  assert.match(report.commitSha, /^[0-9a-f]{7}$/);
  assert.ok(report.latency.turnMs.p50 === 200 || report.latency.turnMs.p50 === 100);
  const md = renderMarkdown(report);
  assert.match(md, /# Reporte de evaluación/);
  assert.match(md, /Critical failures/);
  assert.match(md, /E001/);
});
