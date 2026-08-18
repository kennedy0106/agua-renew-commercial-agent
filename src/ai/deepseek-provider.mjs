import { AIProvider } from './ai-provider.mjs';

function parseDsmlToolCalls(content) {
  if (typeof content !== 'string' || !content.includes('<｜｜DSML｜｜tool_calls>')) return [];
  const calls = [];
  const invokePattern = /<｜｜DSML｜｜invoke name="([^"]+)">([\s\S]*?)<\/｜｜DSML｜｜invoke>/g;
  let invoke;
  while ((invoke = invokePattern.exec(content)) !== null) {
    const args = {};
    const parameterPattern = /<｜｜DSML｜｜parameter name="([^"]+)" string="(true|false)">([\s\S]*?)<\/｜｜DSML｜｜parameter>/g;
    let parameter;
    while ((parameter = parameterPattern.exec(invoke[2])) !== null) {
      const [, name, stringValue, rawValue] = parameter;
      const value = rawValue.trim();
      args[name] = stringValue === 'true'
        ? value
        : value === 'true' || value === 'false'
          ? value === 'true'
          : Number.isFinite(Number(value)) ? Number(value) : value;
    }
    calls.push({ id: `dsml_${calls.length + 1}`, type: 'function', function: { name: invoke[1], arguments: JSON.stringify(args) } });
  }
  return calls;
}

function removeDsmlToolMarkup(content) {
  return typeof content === 'string'
    ? content.replace(/\s*<｜｜DSML｜｜tool_calls>[\s\S]*?<\/｜｜DSML｜｜tool_calls>\s*/g, '\n').trim() || null
    : content;
}

export class AIProviderError extends Error {
  constructor(type, message, diagnostics = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.type = type;
    Object.assign(this, diagnostics);
  }
}

/** DeepSeek OpenAI-compatible Chat Completions adapter. */
export class DeepSeekProvider extends AIProvider {
  constructor({ apiKey, model, baseUrl, timeoutMs = 60_000, maxTokens = 4_096, thinkingMode = null, emptyResponseRetries = 1, fetchImpl = fetch }) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl?.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.maxTokens = maxTokens;
    this.thinkingMode = thinkingMode;
    // This is a technical reliability retry only. It never changes the
    // commercial prompt, catalog, or the user's message.
    this.emptyResponseRetries = emptyResponseRetries;
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.model && this.baseUrl);
  }

  async interpret({ systemPrompt, userMessage }) {
    const result = await this.complete({
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      responseFormat: { type: 'json_object' },
    });
    if (typeof result.content === 'string' && result.content.trim()) return result;
    throw new AIProviderError('empty_response', 'DeepSeek returned no JSON content.', result);
  }

  async complete({ messages, tools = undefined, toolChoice = undefined, responseFormat = undefined }) {
    if (!this.isConfigured()) {
      throw new AIProviderError('not_configured', 'DeepSeek no está configurado.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = performance.now();
    try {
      let emptyResponse = null;
      for (let attempt = 0; attempt <= this.emptyResponseRetries; attempt += 1) {
        const requestMessages = attempt > 0
          ? messages.map((message, index) => index === 0 && message.role === 'system'
            ? { ...message, content: `${message.content}\n\nLa respuesta anterior no incluyó contenido visible. Devuelve ahora la respuesta solicitada.` }
            : message)
          : messages;
        const payload = {
          model: this.model,
          messages: requestMessages,
          temperature: 0,
          max_tokens: this.maxTokens,
        };
        if (responseFormat) payload.response_format = responseFormat;
        if (tools?.length) payload.tools = tools;
        if (toolChoice) payload.tool_choice = toolChoice;
        if (this.thinkingMode) payload.thinking = { type: this.thinkingMode };
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        });
        if (!response.ok) {
          throw new AIProviderError('http_error', `DeepSeek respondió HTTP ${response.status}.`);
        }
        const body = await response.json();
        const choice = body.choices?.[0];
        const message = choice?.message ?? {};
        const rawContent = message.content ?? null;
        const nativeToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        const compatibilityToolCalls = nativeToolCalls.length ? [] : parseDsmlToolCalls(rawContent);
        const toolCalls = nativeToolCalls.length ? nativeToolCalls : compatibilityToolCalls;
        const content = compatibilityToolCalls.length ? removeDsmlToolMarkup(rawContent) : rawContent;
        if ((typeof content === 'string' && content.trim()) || toolCalls.length) {
          return {
            provider: 'deepseek',
            model: this.model,
            content,
            latencyMs: Math.round(performance.now() - startedAt),
            inputTokens: body.usage?.prompt_tokens ?? null,
            outputTokens: body.usage?.completion_tokens ?? null,
            retryCount: attempt,
            finishReason: choice?.finish_reason ?? null,
            toolCalls,
            toolCallFormat: compatibilityToolCalls.length ? 'deepseek_dsml_compat' : nativeToolCalls.length ? 'native' : null,
          };
        }
        emptyResponse = new AIProviderError('empty_response', 'DeepSeek returned no JSON content.', {
          provider: 'deepseek',
          model: this.model,
          latencyMs: Math.round(performance.now() - startedAt),
          inputTokens: body.usage?.prompt_tokens ?? null,
          outputTokens: body.usage?.completion_tokens ?? null,
          // Keep an auditable summary without retaining hidden reasoning or
          // credentials.
          rawResponse: JSON.stringify({
            finishReason: choice?.finish_reason ?? null,
            content: content ?? null,
          }),
          responseDiagnostics: {
            finishReason: choice?.finish_reason ?? null,
            hasReasoningContent: typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0,
            reasoningContentLength: typeof message.reasoning_content === 'string' ? message.reasoning_content.length : 0,
            attempt,
          },
        });
        // A stopped completion with no visible content is transient in some
        // compatible endpoints. Retrying a length-limited completion would
        // not be useful, so keep its original error immediately.
        if (choice?.finish_reason !== 'stop' || attempt === this.emptyResponseRetries) throw emptyResponse;
      }
      throw emptyResponse;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error?.name === 'AbortError') {
        throw new AIProviderError('timeout', 'La llamada a DeepSeek excedió el tiempo máximo.');
      }
      throw new AIProviderError('network_error', 'No fue posible comunicarse con DeepSeek.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
