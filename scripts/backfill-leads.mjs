import { loadEnvironment, aiConfigurationFromEnvironment } from '../src/config/environment.mjs';
import { PostgresLeadRepository } from '../src/leads/postgres-lead-repository.mjs';
import { IntakeClassifier } from '../src/ai/intake-classifier.mjs';
import { DeepSeekProvider } from '../src/ai/deepseek-provider.mjs';
import { analyzeHistoricalLeads } from '../src/meta/historical-lead-analyzer.mjs';
import { applyHistoricalLeadPlan } from '../src/meta/historical-lead-analyzer.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

loadEnvironment();
const apply = process.argv.includes('--apply');
const planFile = resolve(process.env.BACKFILL_PLAN_FILE ?? '.backfill/historical-leads-plan.json');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL es requerida');

const ai = aiConfigurationFromEnvironment();
const provider = ai.enabled && ai.deepseek.apiKey
  ? new DeepSeekProvider({ apiKey: ai.deepseek.apiKey, model: ai.deepseek.model, baseUrl: ai.deepseek.baseUrl, timeoutMs: ai.deepseek.timeoutMs, thinkingMode: ai.deepseek.thinkingMode })
  : null;
const repository = new PostgresLeadRepository({ connectionString });
try {
  await repository.connect();
  let summary;
  if (apply) {
    const plan = JSON.parse(await readFile(planFile, 'utf8'));
    summary = await applyHistoricalLeadPlan({ repository, plan });
  } else {
    const result = await analyzeHistoricalLeads({ repository, classifier: new IntakeClassifier({ provider }), apply: false, returnPlan: true });
    const plan = { version: 1, createdAt: new Date().toISOString(), summary: result.summary, operations: result.operations };
    await mkdir(dirname(planFile), { recursive: true });
    await writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    summary = { ...result.summary, planFile };
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await repository.close();
}
