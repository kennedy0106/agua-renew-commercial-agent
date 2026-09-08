import test from 'node:test';
import assert from 'node:assert/strict';

import { CrmRepository } from '../src/crm/crm-repository.mjs';

const admin = { id: 'admin-1', role: 'ADMIN' };
const advisor = { id: 'advisor-1', role: 'ADVISOR' };

function dashboardPool(queries) {
  return {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('AS open') && sql.includes('pipeline_value')) return { rows: [{ open: 7, won: 3, lost: 2, pipeline_value: '42000', overdue: 1 }] };
      if (sql.includes('FROM crm_pipeline_stages s LEFT JOIN')) return { rows: [{ id: 'stage-1', stageKey: 'NEW', name: 'Nueva', color: '#07535a', position: 1, total: 4, value: '21000' }] };
      if (sql.includes('FROM crm_tasks WHERE')) return { rows: [{ open: 5, overdue: 2 }] };
      if (sql.includes('ORDER BY (o.next_action_at < now())')) return { rows: [{ id: 'priority-1', title: 'Tratamiento', contactName: 'Ana', stageKey: 'NEW' }] };
      if (sql.includes('ORDER BY o.updated_at DESC,o.id DESC')) return { rows: [{ id: 'recent-1', title: 'Pozo', contactName: 'Luis' }] };
      if (sql.includes(') agenda ORDER BY')) return { rows: [] };
      if (sql.includes('AS "unassigned"')) return { rows: [{ unassigned: 1, needsReview: 2, readyForHandoff: 3 }] };
      if (sql.includes('WITH buckets AS')) return { rows: [
        { bucketStart: '2026-08-24 00:00:00', created: 4, won: 2, lost: 1 },
        { bucketStart: '2026-08-31 00:00:00', created: 2, won: 1, lost: 1 },
      ] };
      throw new Error(`Consulta inesperada: ${sql.slice(0, 80)}`);
    },
  };
}

test('dashboard amplía el contrato, calcula conversión y fija metadatos del período', async () => {
  const queries = [];
  const repository = new CrmRepository({ pool: dashboardPool(queries) });
  const result = await repository.dashboard(admin, { period: '6m' });

  assert.equal(result.conversionRate, 60);
  assert.deepEqual(result.period, { key: '6m', label: 'Últimos 6 meses', bucket: 'month' });
  assert.equal(result.priorityOpportunity.id, 'priority-1');
  assert.equal(result.recentOpportunities.length, 1);
  assert.deepEqual(result.operationalSummary, { unassigned: 1, needsReview: 2, readyForHandoff: 3, openTasks: 5, overdueTasks: 2 });
  assert.equal(result.stages[0].value, 21000);
  assert.equal(result.trend.length, 2);

  const trendSql = queries.find(({ sql }) => sql.includes('WITH buckets AS')).sql;
  assert.match(trendSql, /count\(DISTINCT s\.id\).*created/s);
  assert.match(trendSql, /min\(h\.created_at\).*stage_key='WON'/s);
  assert.match(trendSql, /min\(h\.created_at\).*stage_key='LOST'/s);
  assert.match(trendSql, /America\/Lima/);
});

test('dashboard aplica el alcance de asesor en todas las consultas comerciales', async () => {
  const queries = [];
  const repository = new CrmRepository({ pool: dashboardPool(queries) });
  await repository.dashboard(advisor, { period: '8w' });

  const opportunityQueries = queries.filter(({ sql }) => sql.includes('crm_opportunities o'));
  assert.ok(opportunityQueries.length >= 5);
  for (const query of opportunityQueries) {
    assert.match(query.sql, /o\.owner_id\s*=\s*\$2/);
    assert.equal(query.values[1], advisor.id);
  }
});

test('búsqueda global normaliza resultados y delega el RBAC a los listados existentes', async () => {
  const repository = new CrmRepository({ pool: { query: async () => ({ rows: [] }) } });
  const calls = [];
  repository.listOpportunities = async (options, actor) => {
    calls.push(['opportunities', options, actor]);
    return { items: [{ id: 'o-1', contactName: 'Aguas del Sur', title: 'Planta', stageName: 'Propuesta' }] };
  };
  repository.listContacts = async (options, actor) => {
    calls.push(['contacts', options, actor]);
    return { items: [{ id: 'c-1', displayName: 'María', companyName: 'Aguas del Sur' }] };
  };
  repository.listCompanies = async (options, actor) => {
    calls.push(['companies', options, actor]);
    return { items: [{ id: 'co-1', name: 'Aguas del Sur', contacts: 2, opportunities: 1 }] };
  };

  const result = await repository.globalSearch({ q: ' agua ', limit: 8 }, advisor);
  assert.deepEqual(result.items.map(({ type, destination }) => [type, destination]), [
    ['opportunity', 'opportunities'], ['contact', 'contacts'], ['company', 'companies'],
  ]);
  assert.equal(result.query, 'agua');
  assert.ok(calls.every((call) => call[2] === advisor));
  assert.equal(calls[0][1].q, 'agua');
  assert.deepEqual(await repository.globalSearch({ q: 'a' }, advisor), { items: [], query: 'a' });
});
