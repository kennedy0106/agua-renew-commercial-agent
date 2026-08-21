#!/usr/bin/env node
/** CLI de evaluación (Bloque D, secciones 43-45).
 * Uso:
 *   node eval/cli.mjs --dry                      valida dataset + pipeline (sin API)
 *   node eval/cli.mjs --run                      baseline DeepSeek completo
 *   node eval/cli.mjs --run --limit 10           primeros 10 escenarios
 *   node eval/cli.mjs --run --category objections
 *   node eval/cli.mjs --run --scenario E001,N001
 *   node eval/cli.mjs --run --model gpt_5_6_luna
 *   node eval/cli.mjs --compare                  DeepSeek vs Luna (si key disponible)
 */

import { loadDataset, filterScenarios, categoryBreakdown } from './lib/dataset.mjs';
import { runEvaluation } from './lib/runner.mjs';
import { aggregateGrades, globalScore, criticalFailureSummary, categoryMatrix } from './lib/scoring.mjs';
import { loadModels, estimateRunCost, usageTotals, estimateCost } from './lib/cost.mjs';
import { createEvalProvider, createScriptedProvider, providerAvailable } from './lib/providers.mjs';
import { buildReport, saveTranscripts, renderMarkdown, writeReports } from './lib/report.mjs';
import { gradeScenario } from './lib/graders.mjs';
import { loadEnvironment } from '../src/config/environment.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Carga .env local (respeta variables ya definidas; nunca loguea secretos).
loadEnvironment();

function parseArgs(argv) {
  const args = { dry: false, run: false, compare: false, regrade: false, limit: null, category: null, scenario: null, model: null, verbose: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry') args.dry = true;
    else if (arg === '--run') args.run = true;
    else if (arg === '--compare') args.compare = true;
    else if (arg === '--regrade') args.regrade = true;
    else if (arg === '--run-id') args.runId = argv[++i];
    else if (arg === '--verbose') args.verbose = true;
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--category') args.category = argv[++i];
    else if (arg === '--scenario') args.scenario = argv[++i];
    else if (arg === '--model') args.model = argv[++i];
  }
  return args;
}

/** Re-grada las transcripciones guardadas de una corrida (sin llamar API):
 * corrige la medición con el grader actual manteniendo las mismas respuestas.
 * Usa --run-id para elegir la corrida; sin él, la más reciente por mtime. */
function regrade(runIdArg) {
  const { version } = loadDataset();
  const dirs = readdirSync(path.join('eval', 'results'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const runId = runIdArg ?? dirs.at(-1);
  if (!runId) { console.error('No hay corridas en eval/results/'); return; }
  const files = readdirSync(path.join('eval', 'results', runId)).filter((f) => f.endsWith('.json')).sort();
  const scenarioResults = files.map((file) => {
    const t = JSON.parse(readFileSync(path.join('eval', 'results', runId, file), 'utf8'));
    const base = {
      scenario: {
        id: t.scenarioId, category: t.category, channel: t.channel, turns: t.turns,
        expect: loadDataset().scenarios.find((s) => s.id === t.scenarioId)?.expect ?? {},
      },
      replies: t.replies, fullText: t.replies.join('\n'), toolsCalled: t.toolsCalled,
      toolsPerTurn: t.toolsPerTurn, finalState: t.finalState, nextAction: t.nextAction,
      errors: t.errors ?? [], usage: t.usage, latencies: { turnMs: t.latencies?.turnMs ?? [] },
    };
    return { ...base, ...gradeScenario(base) };
  });
  const models = loadModels();
  const modelConfig = { key: runId.replace(/^run-/, '').replace(/-\w+$/, ''), ...models.models[runId.replace(/^run-/, '').replace(/-\w+$/, '')] };
  const summary = aggregateGrades(scenarioResults);
  const criticalFailures = criticalFailureSummary(scenarioResults);
  const matrix = categoryMatrix(scenarioResults);
  const usage = usageTotals(scenarioResults.map((r) => r.usage));
  const estimatedCostUSD = estimateCost({ usage, pricing: modelConfig.pricing ?? models.models.deepseek_flash_v4.pricing });
  const turnLatencyMs = scenarioResults.flatMap((r) => r.latencies.turnMs ?? []);
  const aiLatencyMs = scenarioResults.flatMap((r) => (r.usage.aiLatencyMs ? [r.usage.aiLatencyMs] : []));
  const global = globalScore(summary);
  const report = buildReport({
    runId, timestamp: new Date().toISOString(), datasetVersion: version,
    modelConfig: { key: modelConfig.key, ...modelConfig }, scenarioResults, summary, global,
    criticalFailures, matrix, turnLatencyMs, aiLatencyMs, usage, estimatedCostUSD,
  });
  saveTranscripts({ runId, scenarioResults });
  const md = renderMarkdown(report);
  const paths = writeReports(report, md);
  console.log(`✅ Re-grado de ${runId} (${scenarioResults.length} escenarios) — score global ${global}/100 · critical ${criticalFailures.length}`);
  console.log(`   Reportes: ${paths.json} · ${paths.md}`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.regrade) { regrade(args.runId); return; }
  const { version, scenarios } = loadDataset();
  const selected = filterScenarios(scenarios, { limit: args.limit, category: args.category, scenarioId: args.scenario });
  const models = loadModels();
  const breakdown = categoryBreakdown(selected);

  console.log(`Dataset v${version}: ${selected.length}/${scenarios.length} escenarios`);
  console.log(`Categorías: ${Object.entries(breakdown).map(([c, n]) => `${c}(${n})`).join(' ')}`);

  const targetModels = args.compare ? Object.keys(models.models) : [args.model ?? models.defaultModel];
  const resultsByModel = {};

  for (const key of targetModels) {
    const modelConfig = { key, ...models.models[key] };
    if (!modelConfig) { console.error(`Modelo desconocido: ${key}`); continue; }
    if (!providerAvailable(modelConfig)) {
      console.log(`\n${modelConfig.label}: NO DISPONIBLE — benchmark no ejecutado (falta API key).`);
      resultsByModel[key] = { status: 'not_executed', modelConfig };
      continue;
    }
    if (args.dry) {
      console.log(`\n${modelConfig.label}: dry run (provider scripted, sin API).`);
      const estimate = estimateRunCost(modelConfig, selected.length);
      console.log(`Estimación de costo si fuera real: ${estimate.usage.requests} requests, ${estimate.usage.inputTokens + estimate.usage.outputTokens} tokens ≈ USD ${estimate.estimatedCostUSD}`);
      runModel(key, modelConfig, selected, { ...args, scripted: true });
      continue;
    }
    const estimate = estimateRunCost(modelConfig, selected.length);
    console.log(`\n${modelConfig.label} (${modelConfig.modelId}): estimación ${estimate.usage.requests} requests, ${estimate.usage.totalTokens ?? estimate.usage.inputTokens + estimate.usage.outputTokens} tokens ≈ USD ${estimate.estimatedCostUSD}`);
    runModel(key, modelConfig, selected, args);
  }

  if (args.compare && Object.keys(resultsByModel).length >= 2) {
    console.log('\n=== Comparación ===');
    for (const [key, r] of Object.entries(resultsByModel)) {
      if (r.status === 'not_executed') { console.log(`${r.modelConfig.label}: not executed`); continue; }
      console.log(`${r.modelConfig.label}: score ${r.report.globalScore} · critical ${r.report.criticalFailures.length} · costo USD ${r.report.usage.estimatedCostUSD}`);
    }
  }
}

async function runModel(key, modelConfig, scenarios, args) {
  const runId = `run-${key}-${Date.now().toString(36)}`;
  const provider = args.scripted
    ? createScriptedProvider()
    : createEvalProvider(modelConfig);
  let lastPct = -1;
  console.log(`Ejecutando ${scenarios.length} escenarios…`);
  const scenarioResults = await runEvaluation({
    scenarios,
    provider,
    concurrency: 1,
    onScenario: ({ index, total, scenarioId, critical, errors, error }) => {
      const pct = Math.floor((index / total) * 100);
      if (pct >= lastPct + 10 || args.verbose) {
        console.log(`  ${pct}% (${index}/${total}) ${error ? `${scenarioId} ERROR ${error}` : critical ? `${scenarioId} CRITICAL` : scenarioId}`);
        lastPct = pct;
      }
    },
  });

  const summary = aggregateGrades(scenarioResults);
  const criticalFailures = criticalFailureSummary(scenarioResults);
  const matrix = categoryMatrix(scenarioResults);
  const usage = usageTotals(scenarioResults.map((r) => r.usage));
  const estimatedCostUSD = estimateCost({ usage, pricing: modelConfig.pricing });
  const turnLatencyMs = scenarioResults.flatMap((r) => r.latencies.turnMs ?? []);
  const aiLatencyMs = scenarioResults.flatMap((r) => (r.usage.aiLatencyMs ? [r.usage.aiLatencyMs] : []));
  const global = globalScore(summary);

  const report = buildReport({
    runId, timestamp: new Date().toISOString(), datasetVersion: 1, modelConfig,
    scenarioResults, summary, global, criticalFailures, matrix,
    turnLatencyMs, aiLatencyMs, usage, estimatedCostUSD,
  });
  saveTranscripts({ runId, scenarioResults });
  const markdown = renderMarkdown(report);
  const paths = writeReports(report, markdown);
  console.log(`\n✅ ${modelConfig.label} — score global ${global}/100 · ${scenarioResults.length} escenarios · critical failures ${criticalFailures.length}`);
  console.log(`   costo estimado USD ${report.usage.estimatedCostUSD} · turnos p50 ${report.latency.turnMs.p50 ?? '-'}ms · p90 ${report.latency.turnMs.p90 ?? '-'}ms`);
  console.log(`   Reportes: ${paths.json} · ${paths.md}`);
}

main();
