import pg from 'pg';
import { loadEnvironment } from '../src/config/environment.mjs';
import { CrmOperationsRepository } from '../src/crm/crm-operations-repository.mjs';

loadEnvironment();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL, max: 2 });
try {
  const actorResult = await pool.query("SELECT id,email,display_name AS \"displayName\",role FROM crm_users WHERE role='ADMIN' AND active=TRUE ORDER BY created_at LIMIT 1");
  if (!actorResult.rowCount) throw new Error('No hay un administrador activo para verificar RBAC');
  const actor = actorResult.rows[0];
  const repository = new CrmOperationsRepository({ pool });
  const stages = await repository.listStages();
  const pages = [];
  for (const stage of stages) {
    const first = await repository.listStageOpportunities(stage.key, { limit: 20 }, actor);
    const second = first.nextCursor ? await repository.listStageOpportunities(stage.key, { limit: 20, cursor: first.nextCursor }, actor) : { items: [] };
    const firstIds = new Set(first.items.map((item) => item.id));
    const duplicates = second.items.filter((item) => firstIds.has(item.id));
    if (duplicates.length) throw new Error(`El cursor duplicó tarjetas en ${stage.key}`);
    pages.push({ stage: stage.key, total: first.total, firstPage: first.items.length, secondPage: second.items.length, duplicateIds: duplicates.length });
  }
  const activePipeline = await pool.query("SELECT count(*)::int total FROM crm_opportunities WHERE lifecycle_status='OPEN' AND deleted_at IS NULL");
  const openStageTotal = pages.filter((item) => !['WON','LOST'].includes(item.stage)).reduce((sum, item) => sum + item.total, 0);
  if (openStageTotal !== activePipeline.rows[0].total) throw new Error(`Kanban ${openStageTotal} no coincide con pipeline ${activePipeline.rows[0].total}`);
  console.log(JSON.stringify({ activePipeline: openStageTotal, stages: pages }, null, 2));
} finally {
  await pool.end();
}
