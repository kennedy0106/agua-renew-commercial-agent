/** Agregación de scores y umbrales de aprobación (Bloque D, secciones 11/24). */

export const METRICS = [
  'commercial_fact_accuracy', 'price_accuracy', 'minimum_accuracy', 'policy_accuracy',
  'memory_accuracy', 'no_repetition', 'tool_selection_accuracy', 'next_step_quality',
  'premature_close_avoidance', 'restricted_information_safety', 'channel_compliance',
  'tone_consistency', 'brevity', 'naturalness', 'sales_orientation', 'objection_handling',
];

/** Umbrales mínimos sugeridos (sección 11). */
export const THRESHOLDS = {
  price_accuracy: 100,
  policy_accuracy: 100,
  restricted_information_safety: 100,
  minimum_accuracy: 100,
  memory_accuracy: 100,
  no_repetition: 98,
  tool_selection_accuracy: 97,
  next_step_quality: 90,
  sales_orientation: 90,
  naturalness: 85,
  brevity: 90,
  premature_close_avoidance: 95,
  commercial_fact_accuracy: 100,
  channel_compliance: 100,
  tone_consistency: 90,
  objection_handling: 85,
};

/** Grupos ponderados para el score global (sección 24). */
export const GLOBAL_WEIGHTS = {
  integridad_comercial: { weight: 0.35, metrics: ['price_accuracy', 'minimum_accuracy', 'policy_accuracy', 'restricted_information_safety', 'commercial_fact_accuracy'] },
  memoria_contexto: { weight: 0.15, metrics: ['memory_accuracy', 'no_repetition', 'channel_compliance'] },
  venta_consultiva: { weight: 0.20, metrics: ['sales_orientation', 'objection_handling', 'premature_close_avoidance'] },
  naturalidad_tono: { weight: 0.15, metrics: ['naturalness', 'tone_consistency', 'brevity'] },
  siguiente_paso: { weight: 0.10, metrics: ['next_step_quality', 'tool_selection_accuracy'] },
  latencia_costo: { weight: 0.05, metrics: [] }, // se completa fuera con datos de ejecución
};

/** Convierte scores 0/1/2 a porcentaje. */
const pct = (value) => (value === 2 ? 100 : value === 1 ? 50 : 0);

/** Agrega los grades de todos los escenarios: { metric: { pct, pass, total, criticalFailures } }. */
export function aggregateGrades(scenarioResults) {
  const totals = {};
  const passes = {};
  const criticals = {};
  for (const metric of METRICS) { totals[metric] = 0; passes[metric] = 0; criticals[metric] = 0; }
  for (const result of scenarioResults) {
    for (const metric of METRICS) {
      const grade = result.grades[metric];
      if (!grade) continue;
      totals[metric] += 1;
      const value = pct(grade.score);
      if (value >= 100) passes[metric] += 1;
      if (grade.critical === true && grade.score === 0) criticals[metric] += 1;
    }
  }
  const summary = {};
  for (const metric of METRICS) {
    const total = totals[metric] ?? 0;
    summary[metric] = {
      pct: total ? Math.round((passes[metric] / total) * 1000) / 10 : null,
      pass: passes[metric],
      total,
      criticalFailures: criticals[metric] ?? 0,
      threshold: THRESHOLDS[metric],
      met: total ? passes[metric] / total >= THRESHOLDS[metric] / 100 : null,
    };
  }
  return summary;
}

/** Score global ponderado 0-100 (con latencia/costo si se provee; sin él se
 * renormaliza sobre el resto de pesos). */
export function globalScore(summary, { latencyCostScore = null } = {}) {
  let total = 0;
  let weightSum = 0;
  for (const [group, { weight, metrics }] of Object.entries(GLOBAL_WEIGHTS)) {
    let groupScore = null;
    if (group === 'latencia_costo') {
      groupScore = latencyCostScore;
    } else {
      const values = metrics.map((m) => summary[m]?.pct).filter((v) => v !== null && v !== undefined);
      if (values.length) groupScore = values.reduce((a, b) => a + b, 0) / values.length;
    }
    if (groupScore !== null) {
      total += weight * groupScore;
      weightSum += weight;
    }
  }
  return weightSum ? Math.round((total / weightSum) * 10) / 10 : null;
}

/** Detecta corrida con fallos críticos (sección 24). */
export function criticalFailureSummary(scenarioResults) {
  const failures = [];
  for (const result of scenarioResults) {
    if (!result.critical) continue;
    for (const [metric, grade] of Object.entries(result.grades)) {
      if (grade.critical === true && grade.score === 0) {
        failures.push({
          scenarioId: result.scenario.id,
          category: result.scenario.category,
          metric,
          input: result.scenario.turns.join(' | '),
          output: result.replies.join(' ⏎ ').slice(0, 400),
          reason: grade.reason,
        });
      }
    }
  }
  return failures;
}

/** Matriz de fallos por categoría (sección 26). */
export function categoryMatrix(scenarioResults) {
  const matrix = {};
  for (const result of scenarioResults) {
    const cat = result.scenario.category;
    matrix[cat] ??= { pass: 0, partial: 0, fail: 0, critical: 0 };
    const worst = Math.min(...Object.values(result.grades).map((g) => g.score));
    if (result.critical) matrix[cat].critical += 1;
    if (worst === 2) matrix[cat].pass += 1;
    else if (worst === 1) matrix[cat].partial += 1;
    else matrix[cat].fail += 1;
  }
  return matrix;
}
