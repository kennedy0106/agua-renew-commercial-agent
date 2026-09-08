import assert from 'node:assert/strict';
import test from 'node:test';
import { aiConfigurationFromEnvironment, validateObserverConfiguration } from '../src/config/environment.mjs';

test('producción exige base, secretos y token explícito antes de escuchar', () => {
  assert.throws(() => validateObserverConfiguration({ NODE_ENV:'production' }), /DATABASE_URL.*META_APP_SECRET.*META_VERIFY_TOKEN/);
});

test('variables DEEPSEEK legacy no configuran el observador', () => {
  const before = { ...process.env };
  try {
    for (const key of ['AI_PROVIDER','AI_API_KEY','AI_MODEL','AI_BASE_URL']) delete process.env[key];
    process.env.DEEPSEEK_API_KEY='legacy'; process.env.DEEPSEEK_MODEL='legacy'; process.env.DEEPSEEK_BASE_URL='https://api.deepseek.com';
    const config=aiConfigurationFromEnvironment();
    assert.equal(config.compatible.apiKey, undefined); assert.equal(config.compatible.baseUrl, undefined); assert.equal(config.compatible.providerName, null);
  } finally { process.env=before; }
});

test('producción rechaza destino IA no aprobado', () => {
  const env={NODE_ENV:'production',DATABASE_URL:'postgres://x:y@db/x?sslmode=verify-full',META_APP_SECRET:'s',META_VERIFY_TOKEN:'custom',ADMIN_API_TOKEN:'x'.repeat(32),AI_ENABLED:'true',AI_PROVIDER:'compatible',AI_API_KEY:'k',AI_MODEL:'m',AI_BASE_URL:'https://unapproved.example/v1',AI_ALLOWED_BASE_URLS:'https://approved.example/v1'};
  assert.throws(()=>validateObserverConfiguration(env),/destino aprobado/);
});
