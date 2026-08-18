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
  return {
    enabled: process.env.AI_ENABLED === 'true',
    conversationArchitecture: process.env.CONVERSATION_ARCHITECTURE === 'legacy' ? 'legacy' : 'agent',
    provider: process.env.AI_PROVIDER,
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 60_000),
      maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS ?? 30_000),
      thinkingMode: process.env.DEEPSEEK_THINKING_MODE ?? 'disabled',
    },
  };
}
