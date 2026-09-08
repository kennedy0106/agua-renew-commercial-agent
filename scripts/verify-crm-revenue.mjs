import pg from 'pg';
import { loadEnvironment } from '../src/config/environment.mjs';
import { CrmRevenueRepository } from '../src/crm/crm-revenue-repository.mjs';

loadEnvironment();
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED no está configurada');
const pool = new pg.Pool({ connectionString, max: 2 });
const repository = new CrmRevenueRepository({ pool });
try {
  const user = await pool.query("SELECT id,role FROM crm_users WHERE role='ADMIN' AND active=TRUE AND deleted_at IS NULL ORDER BY created_at LIMIT 1");
  if (!user.rowCount) throw new Error('No hay administrador activo para la verificación');
  const actor = user.rows[0];
  const [counts, products, calendar, automations, communications, orders, report] = await Promise.all([
    pool.query(`SELECT (SELECT count(*)::int FROM leads) leads,(SELECT count(*)::int FROM crm_contacts) contacts,(SELECT count(*)::int FROM crm_opportunities) opportunities`),
    repository.listProducts(),
    repository.listCalendar({}, actor),
    repository.listAutomationRules(actor),
    repository.listCommunications({}, actor),
    repository.listOrders({}, actor),
    repository.advancedReport(actor, {}),
  ]);
  if (products.total < 11) throw new Error('El catálogo inicial está incompleto');
  if (!automations.total) throw new Error('No se creó la regla SLA inicial');
  console.log(JSON.stringify({
    preserved: counts.rows[0], products: products.total,
    calendar: { events: calendar.events.length, tasks: calendar.tasks.length, firstEvent: calendar.events[0] ? { title:calendar.events[0].title, startsAt:calendar.events[0].starts_at, endsAt:calendar.events[0].ends_at } : null },
    automations: automations.total, communications: communications.total,
    orders: orders.total, report: { quoted: report.quotes.quoted, ordered: report.revenue.ordered },
  }, null, 2));
} finally {
  await pool.end();
}
