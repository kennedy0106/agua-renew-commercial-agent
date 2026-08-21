/** Generación de reportes (Bloque D, secciones 25-27/39). */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { EVAL_GRADER_VERSION } from './graders.mjs';

const RESULTS_DIR = path.join('eval', 'results');
const REPORTS_DIR = path.join('eval', 'reports');

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function latencySummary(latencies) {
  if (!latencies.length) return { p50: null, p90: null, p95: null, mean: null, count: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    mean: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    count: latencies.length,
  };
}

function commitSha() {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

/** Construye el reporte agregado de una corrida. */
export function buildReport({ runId, timestamp, datasetVersion, modelConfig, scenarioResults, summary, global, criticalFailures, matrix, turnLatencyMs, aiLatencyMs, usage, estimatedCostUSD }) {
  const scenarioCount = Math.max(1, scenarioResults.length);
  const costPerConversation = Number((estimatedCostUSD / scenarioCount).toFixed(4));
  return {
    runId,
    timestamp,
    commitSha: commitSha(),
    evalDatasetVersion: datasetVersion,
    evalGraderVersion: EVAL_GRADER_VERSION,
    model: {
      key: modelConfig.key,
      label: modelConfig.label,
      provider: modelConfig.provider,
      modelId: modelConfig.modelId,
      pricing: modelConfig.pricing,
    },
    scenariosTotal: scenarioResults.length,
    scenariosWithErrors: scenarioResults.filter((r) => (r.errors?.length ?? 0) > 0).length,
    summary,
    globalScore: global,
    criticalFailures,
    categoryMatrix: matrix,
    latency: {
      turnMs: latencySummary(turnLatencyMs),
      aiMs: latencySummary(aiLatencyMs),
      perTurnAiMs: latencySummary(aiLatencyMs),
    },
    usage: {
      requests: usage.requests,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUSD: Number(estimatedCostUSD.toFixed(4)),
    },
    tokenization: {
      tokensPerTurn: scenarioResults.length ? Math.round(usage.totalTokens / Math.max(1, scenarioResults.reduce((a, r) => a + r.scenario.turns.length, 0))) : 0,
      tokensPerConversation: scenarioResults.length ? Math.round(usage.totalTokens / scenarioResults.length) : 0,
      // costPerConversation = costo total de la corrida / número de conversaciones;
      // costPer1000 = ese costo unitario × 1000 (no el costo total × 1000).
      costPerConversation,
      costPer1000Conversations: Number((costPerConversation * 1000).toFixed(2)),
    },
    topFailures: topFailures(scenarioResults),
  };
}

function topFailures(scenarioResults) {
  const failures = [];
  for (const result of scenarioResults) {
    const worst = Object.entries(result.grades)
      .filter(([, g]) => g.score === 0)
      .map(([metric, g]) => ({ metric, reason: g.reason }));
    if (!worst.length) continue;
    failures.push({
      scenarioId: result.scenario.id,
      category: result.scenario.category,
      input: result.scenario.turns.join(' | '),
      output: result.replies.join(' ⏎ ').slice(0, 400),
      violations: worst.slice(0, 3),
    });
  }
  return failures.sort((a, b) => (a.violations.some((v) => v.metric.includes('price') || v.metric.includes('policy') || v.metric.includes('restricted')) ? -1 : 1)).slice(0, 15);
}

/** Guarda transcripción por escenario (sin secretos ni CoT). */
export function saveTranscripts({ runId, scenarioResults }) {
  const dir = path.join(RESULTS_DIR, runId);
  mkdirSync(dir, { recursive: true });
  for (const result of scenarioResults) {
    const safe = {
      scenarioId: result.scenario.id,
      category: result.scenario.category,
      channel: result.scenario.channel,
      turns: result.scenario.turns,
      replies: result.replies,
      toolsCalled: result.toolsCalled,
      toolsPerTurn: result.toolsPerTurn,
      toolCalls: result.toolsWithArgs ?? [],
      finalState: result.finalState,
      nextAction: result.nextAction,
      grades: Object.fromEntries(Object.entries(result.grades).map(([k, g]) => [k, { score: g.score, reason: g.reason, violations: g.violations }])),
      critical: result.critical,
      errors: result.errors,
      usage: result.usage,
      latencies: { turnMs: result.latencies?.turnMs ?? [] },
    };
    writeFileSync(path.join(dir, `${result.scenario.id}.json`), JSON.stringify(safe, null, 2));
  }
}

/** Reporte Markdown legible (sección 25). */
export function renderMarkdown(report) {
  const m = report.model;
  const lines = [];
  lines.push(`# Reporte de evaluación — ${m.label}`);
  lines.push('');
  lines.push(`- **Run**: ${report.runId}`);
  lines.push(`- **Fecha**: ${report.timestamp}`);
  lines.push(`- **Commit**: ${report.commitSha}`);
  lines.push(`- **Dataset**: v${report.evalDatasetVersion} — ${report.scenariosTotal} escenarios (${report.scenariosWithErrors} con errores de ejecución)`);
  lines.push(`- **Grader**: v${report.evalGraderVersion} (re-grado del mismo transcript, sin nueva llamada API)`);
  lines.push(`- **Modelo**: ${m.label} (${m.provider} / ${m.modelId})`);
  lines.push(`- **Score global**: ${report.globalScore ?? 'n/d'} / 100`);
  lines.push(`- **Critical failures**: ${report.criticalFailures.length}`);
  lines.push('');
  lines.push('## Métricas');
  lines.push('');
  lines.push('| Métrica | % | Pass/Total | Umbral | ¿Cumple? |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const [metric, s] of Object.entries(report.summary)) {
    if (s.total === 0) continue;
    lines.push(`| ${metric} | ${s.pct ?? '-'} | ${s.pass}/${s.total} | ${s.threshold}% | ${s.met === null ? 'n/a' : s.met ? '✅' : '❌'} |`);
  }
  lines.push('');
  lines.push('## Matriz por categoría');
  lines.push('');
  lines.push('| Categoría | Pass | Partial | Fail | Critical |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [category, v] of Object.entries(report.categoryMatrix)) {
    lines.push(`| ${category} | ${v.pass} | ${v.partial} | ${v.fail} | ${v.critical} |`);
  }
  lines.push('');
  lines.push('## Latencia (ms)');
  lines.push('');
  lines.push(`- Turno (p50/p90/p95): ${report.latency.turnMs.p50 ?? '-'} / ${report.latency.turnMs.p90 ?? '-'} / ${report.latency.turnMs.p95 ?? '-'} (mean ${report.latency.turnMs.mean ?? '-'})`);
  lines.push(`- AI por turno (p50/p90/p95): ${report.latency.aiMs.p50 ?? '-'} / ${report.latency.aiMs.p90 ?? '-'} / ${report.latency.aiMs.p95 ?? '-'} (mean ${report.latency.aiMs.mean ?? '-'})`);
  lines.push('');
  lines.push('## Uso y costo');
  lines.push('');
  lines.push(`- Requests: ${report.usage.requests}`);
  lines.push(`- Tokens: ${report.usage.inputTokens} in / ${report.usage.outputTokens} out (${report.usage.totalTokens} total)`);
  lines.push(`- Costo estimado: USD ${report.usage.estimatedCostUSD}`);
  lines.push(`- Tokens/turno: ${report.tokenization.tokensPerTurn} · Tokens/conversación: ${report.tokenization.tokensPerConversation}`);
  lines.push(`- Costo/conversación: USD ${report.tokenization.costPerConversation} · Costo/1000 conversaciones: USD ${report.tokenization.costPer1000Conversations}`);
  lines.push('');
  if (report.criticalFailures.length) {
    lines.push('## Critical failures');
    lines.push('');
    for (const f of report.criticalFailures) {
      lines.push(`- **${f.scenarioId}** (${f.category} · ${f.metric}): ${f.reason}`);
      lines.push(`  - Input: ${f.input}`);
      lines.push(`  - Output: ${f.output.slice(0, 300)}`);
    }
    lines.push('');
  }
  if (report.topFailures.length) {
    lines.push('## Peores respuestas');
    lines.push('');
    for (const f of report.topFailures) {
      lines.push(`- **${f.scenarioId}** (${f.category})`);
      lines.push(`  - Input: ${f.input}`);
      lines.push(`  - Output: ${f.output.slice(0, 300)}`);
      lines.push(`  - Violaciones: ${f.violations.map((v) => `${v.metric} — ${v.reason}`).join(' | ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Escribe eval/reports/latest.json y latest.md. */
export function writeReports(report, markdown) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(path.join(REPORTS_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(REPORTS_DIR, 'latest.md'), markdown);
  return { json: path.join(REPORTS_DIR, 'latest.json'), md: path.join(REPORTS_DIR, 'latest.md') };
}

export function readLatestReport() {
  const file = path.join(REPORTS_DIR, 'latest.json');
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}
