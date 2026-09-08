import pg from 'pg';
import { loadEnvironment } from '../src/config/environment.mjs';

loadEnvironment();
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED no está configurada');
const requested = process.argv[2] ?? `snapshot_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
if (!/^[a-z][a-z0-9_]{2,62}$/.test(requested)) throw new Error('Nombre de snapshot inválido');
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA ${quote(requested)}`);
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
  const manifest = [];
  for (const { table_name: table } of tables.rows) {
    await client.query(`CREATE TABLE ${quote(requested)}.${quote(table)} AS TABLE public.${quote(table)}`);
    const count = await client.query(`SELECT count(*)::int total FROM ${quote(requested)}.${quote(table)}`);
    manifest.push({ table, rows: count.rows[0].total });
  }
  await client.query(`CREATE TABLE ${quote(requested)}._snapshot_manifest (created_at timestamptz NOT NULL, source_schema text NOT NULL, table_counts jsonb NOT NULL)`);
  await client.query(`INSERT INTO ${quote(requested)}._snapshot_manifest VALUES (now(),'public',$1::jsonb)`, [JSON.stringify(manifest)]);
  await client.query('COMMIT');
  const critical = Object.fromEntries(manifest.filter(({ table }) => ['leads','lead_messages','crm_contacts','crm_opportunities','crm_tasks'].includes(table)).map(({ table, rows }) => [table, rows]));
  console.log(JSON.stringify({ snapshotSchema: requested, tables: manifest.length, critical }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
