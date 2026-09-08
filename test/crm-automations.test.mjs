import assert from 'node:assert/strict';
import test from 'node:test';
import { CrmRevenueRepository } from '../src/crm/crm-revenue-repository.mjs';

test('automatizaciones: ejecuta únicamente reglas activas y respeta las horas configuradas', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('SELECT id,trigger_type')) return {
        rowCount: 2,
        rows: [
          { id: 'rule-overdue', trigger_type: 'TASK_OVERDUE', trigger_config: {}, action_type: 'NOTIFY_OWNER' },
          { id: 'rule-idle', trigger_type: 'OPPORTUNITY_IDLE', trigger_config: { hours: 36 }, action_type: 'NOTIFY_OWNER' },
        ],
      };
      if (sql.includes("'OPPORTUNITY_IDLE'")) return { rowCount: 3, rows: [] };
      return { rowCount: 1, rows: [] };
    },
  };
  const repository = new CrmRevenueRepository({ pool });
  repository.runSlaAutomation = async () => 2;

  const result = await repository.runRevenueAutomations();

  assert.deepEqual(result, { overdue: 2, idle: 3, rules: 2 });
  assert.equal(calls.find((call) => call.sql.includes("INSERT INTO crm_notifications") && call.sql.includes("'OPPORTUNITY_IDLE'"))?.values[1], 36);
  assert.equal(calls.filter((call) => call.sql.includes('SET last_run_at=now()')).length, 2);
});

test('automatizaciones: rechaza combinaciones que el ejecutor no soporta', async () => {
  const repository = new CrmRevenueRepository({ pool: { query: async () => { throw new Error('No debe consultar la base'); } } });
  await assert.rejects(
    repository.createAutomationRule({ name: 'Asignar', triggerType: 'STAGE_ENTERED', actionType: 'ASSIGN_ROUND_ROBIN' }, { role: 'ADMIN' }),
    /combinación de condición y acción no está disponible/i,
  );
});
