import { spawn } from 'node:child_process';
import pg from 'pg';
import { loadEnvironment } from '../src/config/environment.mjs';

loadEnvironment();

const integrationFiles = [
  'test/lead-postgres.integration.test.mjs',
  'test/postgres-persistence.integration.test.mjs',
];

function runIntegration(connectionString) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...integrationFiles], {
      env: { ...process.env, TEST_DATABASE_URL: connectionString },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`La suite PostgreSQL terminó por la señal ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

const configuredTestUrl = process.env.TEST_DATABASE_URL;
if (configuredTestUrl) {
  process.exitCode = await runIntegration(configuredTestUrl);
} else {
  const adminConnectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!adminConnectionString) {
    throw new Error('Configure TEST_DATABASE_URL o DATABASE_URL_UNPOOLED para ejecutar PostgreSQL de forma aislada.');
  }
  const adminUrl = new URL(adminConnectionString);
  if (adminUrl.hostname.includes('-pooler') || adminUrl.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('DATABASE_URL_UNPOOLED debe usar el endpoint directo y sslmode=verify-full.');
  }

  const databaseName = `crm_it_${process.pid}_${Date.now()}`;
  if (!/^crm_it_[0-9_]+$/.test(databaseName)) throw new Error('Nombre de base de pruebas inválido');
  const quotedName = `"${databaseName}"`;
  const adminPool = new pg.Pool({ connectionString: adminConnectionString, max: 1 });
  const testUrl = new URL(adminConnectionString);
  testUrl.pathname = `/${databaseName}`;

  try {
    await adminPool.query(`CREATE DATABASE ${quotedName}`);
    console.log(`Base PostgreSQL aislada creada: ${databaseName}`);
    process.exitCode = await runIntegration(testUrl.toString());
  } finally {
    await adminPool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
      [databaseName],
    ).catch(() => {});
    await adminPool.query(`DROP DATABASE IF EXISTS ${quotedName} WITH (FORCE)`);
    await adminPool.end();
    console.log(`Base PostgreSQL aislada eliminada: ${databaseName}`);
  }
}
