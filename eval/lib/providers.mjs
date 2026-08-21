/** Fábrica de proveedores de evaluación (Bloque D, sección 17).
 * El runner no está acoplado a DeepSeek: cada modelo de eval/models.json
 * declara su provider. Los adaptadores openai-compat reutilizan
 * DeepSeekProvider (cliente OpenAI-compatible). */

import { DeepSeekProvider } from '../../src/ai/deepseek-provider.mjs';
import { aiConfigurationFromEnvironment } from '../../src/config/environment.mjs';

/** Provider scripted (dry-run/tests): responde sin herramientas con un texto
 * corto; registra las llamadas. */
export function createScriptedProvider({ reply = 'Perfecto, revisemos esa opción. ¿Qué presentación le interesa?' } = {}) {
  const calls = [];
  return {
    model: 'scripted',
    async complete(input) {
      calls.push(input);
      return { latencyMs: 1, inputTokens: 10, outputTokens: 5, finishReason: 'stop', toolCalls: [], content: reply };
    },
    calls,
  };
}

/** Provider real según la config del modelo. modelId "env" usa el modelo
 * configurado en el entorno (DeepSeek actual); otros modelIds se pasan
 * explícitos al proveedor. */
export function createEvalProvider(modelConfig, { scripted = false } = {}) {
  if (scripted || modelConfig.provider === 'scripted') return createScriptedProvider();
  if (modelConfig.provider === 'deepseek') {
    const env = aiConfigurationFromEnvironment();
    if (!env.enabled || env.provider !== 'deepseek') throw new Error('DeepSeek no está configurado en el entorno (AI_ENABLED/DEEPSEEK_API_KEY)');
    const base = { ...env.deepseek };
    if (modelConfig.modelId && modelConfig.modelId !== 'env') base.model = modelConfig.modelId;
    return new DeepSeekProvider(base);
  }
  if (modelConfig.provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error(`OPENAI_API_KEY no disponible para ${modelConfig.label}`);
    return new DeepSeekProvider({
      apiKey, baseUrl: 'https://api.openai.com/v1', model: modelConfig.modelId,
      timeoutMs: 60000, maxTokens: 1200,
    });
  }
  throw new Error(`provider desconocido: ${modelConfig.provider}`);
}

export function providerAvailable(modelConfig) {
  if (modelConfig.provider === 'scripted') return true;
  if (modelConfig.provider === 'deepseek') {
    try {
      const env = aiConfigurationFromEnvironment();
      return Boolean(env.enabled && env.provider === 'deepseek');
    } catch { return false; }
  }
  if (modelConfig.provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  return false;
}
