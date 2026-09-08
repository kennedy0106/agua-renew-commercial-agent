import { existsSync, readFileSync } from 'node:fs';

/** Minimal .env loader; process environment retains precedence and secrets are never logged. */
export function loadEnvironment(file = '.env') {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[2].startsWith('#') || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    process.env[match[1]] = value;
  }
}

export function aiConfigurationFromEnvironment() {
  const provider = process.env.AI_PROVIDER ?? null;
  return {
    enabled: process.env.AI_ENABLED === 'true',
    conversationArchitecture: process.env.CONVERSATION_ARCHITECTURE === 'legacy' ? 'legacy' : 'agent',
    provider,
    compatible: {
      providerName: provider,
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL,
      baseUrl: process.env.AI_BASE_URL,
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
      maxTokens: Number(process.env.AI_MAX_TOKENS ?? 4_096),
      thinkingMode: process.env.AI_THINKING_MODE ?? null,
    },
  };
}

export function validateObserverConfiguration(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const errors = [];
  if (production && !env.DATABASE_URL) errors.push('DATABASE_URL es obligatoria en producción');
  if (production && !env.META_APP_SECRET) errors.push('META_APP_SECRET es obligatorio en producción');
  if (production && (!env.META_VERIFY_TOKEN || env.META_VERIFY_TOKEN === 'agua-renew-dev')) errors.push('META_VERIFY_TOKEN debe configurarse explícitamente en producción');
  if (production && String(env.ADMIN_API_TOKEN ?? '').length < 32) errors.push('ADMIN_API_TOKEN debe tener al menos 32 caracteres en producción');
  if (production && env.DATABASE_URL) {
    try { if (new URL(env.DATABASE_URL).searchParams.get('sslmode') !== 'verify-full') errors.push('DATABASE_URL debe configurar sslmode=verify-full en producción'); }
    catch { errors.push('DATABASE_URL no es una URL válida'); }
  }
  if (env.AI_ENABLED === 'true') {
    const missing = ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL'].filter((key) => !env[key]);
    if (missing.length) errors.push(`Configuración IA incompleta: ${missing.join(', ')}`);
    if (env.AI_BASE_URL) {
      try {
        const destination = new URL(env.AI_BASE_URL);
        const allowed = String(env.AI_ALLOWED_BASE_URLS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
        if (production && !allowed.some((value) => new URL(value).origin === destination.origin)) errors.push('AI_BASE_URL no pertenece a un destino aprobado');
      } catch { errors.push('AI_BASE_URL no es una URL válida'); }
    }
  }
  if (errors.length) { const error = new Error(`Configuración inválida: ${errors.join('; ')}`); error.code = 'INVALID_CONFIGURATION'; throw error; }
  return { production };
}
