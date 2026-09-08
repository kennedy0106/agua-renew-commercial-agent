import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresConversationRepository } from '../src/repository/postgres-conversation-repository.mjs';
import { loadEnvironment } from '../src/config/environment.mjs';

loadEnvironment();
const root = fileURLToPath(new URL('..', import.meta.url));
const migrationDirectory = join(root, 'database', 'migrations');
// Conexión siempre desde entorno; el valor de desarrollo local va en .env
// (ver .env.example y docker-compose.yml).
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export async function runMigrations(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const filename of files) {
    const sql = await readFile(join(migrationDirectory, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializa el check y la aplicación cuando dos suites arrancan a la vez.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('agua_renew_schema_migrations'))");
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
      if (applied.rowCount) {
        await client.query('COMMIT');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied migration ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!connectionString) {
    console.error('DATABASE_URL no está definida. Copie .env.example a .env y configúrela antes de migrar.');
    process.exitCode = 1;
  } else {
    const databaseUrl = new URL(connectionString);
    const host = databaseUrl.hostname;
    if (host.includes('-pooler')) {
      console.error('Las migraciones requieren DATABASE_URL_UNPOOLED (endpoint Neon directo, sin -pooler).');
      process.exitCode = 1;
      process.exit();
    }
    if (databaseUrl.searchParams.get('sslmode') !== 'verify-full') {
      console.error('DATABASE_URL_UNPOOLED debe configurar sslmode=verify-full.');
      process.exitCode = 1;
      process.exit();
    }
    const repository = new PostgresConversationRepository({ connectionString });
    try {
      await repository.connect();
      await runMigrations(repository.pool);
    } finally {
      await repository.close();
    }
  }
}
