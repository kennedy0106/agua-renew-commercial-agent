/** Carga y validación del dataset de evaluación (Bloque D). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATASETS_DIR = path.join(__dirname, '..', 'datasets');

export const ALLOWED_CATEGORIES = [
  'first_contact', 'discovery', 'maquila', 'distribution', 'quotation', 'objections',
  'memory', 'topic_change', 'payment', 'delivery', 'brand_logo', 'restricted',
  'close_handoff', 'multi_turn', 'naturalness_channel',
];

const EXPECT_KEYS = new Set([
  'tools', 'forbiddenTools', 'text', 'forbidden', 'forbiddenInLastTurn', 'paymentTransfer',
  'finalState', 'nextAction', 'noRepeatOf', 'noPrematureClose', 'maxWords', 'channelCompliance', 'critical',
  'expectedModality', 'expectedProductId', 'expectedPurchaseType', 'expectedCommercialMove',
  'forbiddenGroundedClaims', 'allowedClaims', 'forbiddenProtocolTerms',
]);

export function validateScenario(scenario, index) {
  const problems = [];
  const at = (field) => `escenario[${index}] (${scenario?.id ?? '?'}) ${field}`;
  if (!scenario.id || typeof scenario.id !== 'string') problems.push(at('id'));
  if (!ALLOWED_CATEGORIES.includes(scenario.category)) problems.push(at(`category inválida: ${scenario.category}`));
  if (!['local', 'instagram', 'messenger', 'whatsapp'].includes(scenario.channel)) problems.push(at(`channel inválido: ${scenario.channel}`));
  if (!Array.isArray(scenario.turns) || scenario.turns.length === 0 || !scenario.turns.every((t) => typeof t === 'string' && t.trim())) problems.push(at('turns'));
  if (scenario.turns.length > 10) problems.push(at('máximo 10 turnos por escenario'));
  if (scenario.displayName !== undefined && scenario.displayName !== null && typeof scenario.displayName !== 'string') problems.push(at('displayName'));
  if (scenario.expect && typeof scenario.expect === 'object') {
    for (const key of Object.keys(scenario.expect)) {
      if (!EXPECT_KEYS.has(key)) problems.push(at(`expect key desconocida: ${key}`));
    }
    const { tools, forbiddenTools, text, forbidden, noRepeatOf } = scenario.expect;
    for (const [key, value] of [['tools', tools], ['forbiddenTools', forbiddenTools], ['text', text], ['forbidden', forbidden], ['noRepeatOf', noRepeatOf]]) {
      if (value !== undefined && (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))) problems.push(at(`${key} debe ser string[]`));
    }
    if (scenario.expect.finalState !== undefined && (typeof scenario.expect.finalState !== 'object' || Array.isArray(scenario.expect.finalState))) problems.push(at('finalState debe ser objeto'));
    for (const key of ['noPrematureClose', 'channelCompliance', 'critical']) {
      if (scenario.expect[key] !== undefined && typeof scenario.expect[key] !== 'boolean') problems.push(at(`${key} debe ser boolean`));
    }
    if (scenario.expect.maxWords !== undefined && !Number.isInteger(scenario.expect.maxWords)) problems.push(at('maxWords debe ser entero'));
  }
  return problems;
}

export function loadDataset({ path: datasetPath = path.join(DATASETS_DIR, 'scenarios.v1.json') } = {}) {
  const raw = JSON.parse(readFileSync(datasetPath, 'utf8'));
  const version = raw.eval_dataset_version;
  if (!Number.isInteger(version) || version < 1) throw new Error('dataset inválido: falta eval_dataset_version');
  const problems = [];
  raw.scenarios.forEach((scenario, index) => problems.push(...validateScenario(scenario, index)));
  if (problems.length) throw new Error(`dataset inválido:\n${problems.join('\n')}`);
  const ids = new Set();
  for (const scenario of raw.scenarios) {
    if (ids.has(scenario.id)) throw new Error(`id duplicado: ${scenario.id}`);
    ids.add(scenario.id);
  }
  return { version, scenarios: raw.scenarios, description: raw.description ?? '' };
}

export function filterScenarios(scenarios, { limit, category, scenarioId } = {}) {
  let filtered = scenarios;
  if (category) {
    const cats = String(category).split(',').map((c) => c.trim());
    filtered = filtered.filter((s) => cats.includes(s.category));
  }
  if (scenarioId) {
    const ids = String(scenarioId).split(',').map((s) => s.trim());
    filtered = filtered.filter((s) => ids.includes(s.id));
  }
  if (limit && Number.isInteger(Number(limit)) && Number(limit) > 0) filtered = filtered.slice(0, Number(limit));
  return filtered;
}

export function categoryBreakdown(scenarios) {
  const counts = {};
  for (const scenario of scenarios) counts[scenario.category] = (counts[scenario.category] ?? 0) + 1;
  return counts;
}
