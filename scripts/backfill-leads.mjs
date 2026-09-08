import { loadEnvironment } from '../src/config/environment.mjs';
import { PostgresLeadRepository } from '../src/leads/postgres-lead-repository.mjs';
import { LeadProcessor } from '../src/meta/lead-processor.mjs';
import { analyzeHistoricalLeads } from '../src/meta/historical-lead-analyzer.mjs';
import { applyHistoricalLeadPlan } from '../src/meta/historical-lead-analyzer.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

loadEnvironment();
const apply = process.argv.includes('--apply');
const planFile = resolve(process.env.BACKFILL_PLAN_FILE ?? '.backfill/historical-leads-plan.json');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL es requerida');

const repository = new PostgresLeadRepository({ connectionString });
try {
  await repository.connect();
  let summary;
  if (apply) {
    const plan = JSON.parse(await readFile(planFile, 'utf8'));
    summary = await applyHistoricalLeadPlan({ repository, plan });
  } else {
    const result = await analyzeHistoricalLeads({ repository, processor: new LeadProcessor({ repository }), apply: false, returnPlan: true });
    const plan = { version: 1, createdAt: new Date().toISOString(), summary: result.summary, operations: result.operations };
    await mkdir(dirname(planFile), { recursive: true });
    await writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    summary = { ...result.summary, planFile };
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await repository.close();
}
