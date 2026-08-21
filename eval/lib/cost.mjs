/** Estimación de costo por modelo (Bloque D, secciones 16/23).
 * Pricing en configuración externa (eval/models.json), no en código. */
import { readFileSync } from 'node:fs';

export function loadModels({ path = 'eval/models.json' } = {}) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function estimateCost({ usage, pricing }) {
  const inputCost = (usage.inputTokens / 1_000_000) * (pricing?.inputPer1M ?? 0);
  const outputCost = (usage.outputTokens / 1_000_000) * (pricing?.outputPer1M ?? 0);
  return inputCost + outputCost;
}

export function usageTotals(usages) {
  const total = { requests: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 };
  for (const usage of usages) {
    total.requests += usage.requests ?? 1;
    total.inputTokens += usage.inputTokens ?? 0;
    total.outputTokens += usage.outputTokens ?? 0;
    total.latencyMs += usage.latencyMs ?? 0;
  }
  total.totalTokens = total.inputTokens + total.outputTokens;
  return total;
}

export function estimateRunCost(modelConfig, scenariosCount, { turnsPerScenario = 3, tokensPerTurn = 2500 } = {}) {
  const requests = scenariosCount * turnsPerScenario * 2.5;
  const inputTokens = Math.round(requests * tokensPerTurn * 0.75);
  const outputTokens = Math.round(requests * tokensPerTurn * 0.25);
  const usage = { requests: Math.round(requests), inputTokens, outputTokens };
  const usd = estimateCost({ usage, pricing: modelConfig.pricing });
  return { usage, estimatedCostUSD: Number(usd.toFixed(4)) };
}
