import { loadEnvironment } from '../src/config/environment.mjs';

loadEnvironment();
export const connectionString = process.env.TEST_DATABASE_URL ?? null;
export const enabled = Boolean(connectionString);

if (enabled && process.env.DATABASE_URL && connectionString === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL no puede ser igual a DATABASE_URL; use una rama Neon aislada.');
}

if (enabled && new URL(connectionString).hostname.includes('-pooler')) {
  throw new Error('TEST_DATABASE_URL debe ser directa porque la suite aplica migraciones.');
}

const testUrl = enabled ? new URL(connectionString) : null;
const localTestDatabase = testUrl && ['localhost','127.0.0.1','::1'].includes(testUrl.hostname);
if (enabled && !localTestDatabase && testUrl.searchParams.get('sslmode') !== 'verify-full') {
  throw new Error('TEST_DATABASE_URL debe configurar sslmode=verify-full.');
}
