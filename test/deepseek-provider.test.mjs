import assert from 'node:assert/strict';
import test from 'node:test';
import { DeepSeekProvider, AIProviderError } from '../src/ai/deepseek-provider.mjs';

test('DeepSeekProvider usa configuración inyectada, JSON mode y no fija modelo ni URL', async () => {
  let request;
  const provider = new DeepSeekProvider({
    apiKey: 'test-key', model: 'model-from-env', baseUrl: 'https://example.deepseek.test/v1',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"intent":"greeting","confidence":0.9}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const result = await provider.interpret({ systemPrompt: 'Devuelve json', userMessage: 'Hola' });
  assert.equal(request.url, 'https://example.deepseek.test/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'model-from-env');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.max_tokens, 4096);
  assert.equal(body.thinking, undefined);
  assert.equal(result.inputTokens, 12);
  assert.equal(result.outputTokens, 4);
});

test('DeepSeekProvider puede desactivar explícitamente Thinking Mode', async () => {
  let request;
  const provider = new DeepSeekProvider({
    apiKey: 'test-key', model: 'deepseek-v4-flash', baseUrl: 'https://example.deepseek.test/v1',
    maxTokens: 512, thinkingMode: 'disabled',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"intent":"greeting","confidence":0.9}' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  await provider.interpret({ systemPrompt: 'Devuelve únicamente JSON', userMessage: 'Hola' });
  assert.deepEqual(request.thinking, { type: 'disabled' });
  assert.equal(request.max_tokens, 512);
  assert.deepEqual(request.response_format, { type: 'json_object' });
});

test('DeepSeekProvider reenvía herramientas nativas y tool calls sin convertirlos a JSON textual', async () => {
  let request;
  const provider = new DeepSeekProvider({
    apiKey: 'test-key', model: 'deepseek-v4-flash', baseUrl: 'https://example.deepseek.test',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_products', arguments: '{}' } }] } }] }), { status: 200 });
    },
  });
  const result = await provider.complete({
    messages: [{ role: 'system', content: 'Asesor' }, { role: 'user', content: '¿Qué tienen?' }],
    tools: [{ type: 'function', function: { name: 'list_products', description: 'lista', parameters: { type: 'object' } } }], toolChoice: 'auto',
  });
  assert.equal(request.tools[0].function.name, 'list_products');
  assert.equal(request.tool_choice, 'auto');
  assert.equal(result.toolCalls[0].function.name, 'list_products');
});

test('DeepSeekProvider normaliza el marcado DSML de herramientas sin mostrarlo al cliente', async () => {
  const provider = new DeepSeekProvider({
    apiKey: 'test-key', model: 'deepseek-v4-flash', baseUrl: 'https://example.deepseek.test',
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: {
      content: 'Revisaré tu cotización.\n<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="get_quote"><｜｜DSML｜｜parameter name="productId" string="true">distribution_botella_625ml_rosca</｜｜DSML｜｜parameter><｜｜DSML｜｜parameter name="quantity" string="false">20</｜｜DSML｜｜parameter></｜｜DSML｜｜invoke></｜｜DSML｜｜tool_calls>',
    } }] }), { status: 200 }),
  });
  const result = await provider.complete({ messages: [{ role: 'user', content: '20 paquetes de 625 ml' }], tools: [{ type: 'function', function: { name: 'get_quote', parameters: { type: 'object' } } }], toolChoice: 'auto' });
  assert.equal(result.content, 'Revisaré tu cotización.');
  assert.equal(result.toolCalls[0].function.name, 'get_quote');
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), { productId: 'distribution_botella_625ml_rosca', quantity: 20 });
  assert.equal(result.toolCallFormat, 'deepseek_dsml_compat');
});

test('DeepSeekProvider falla con error explícito si faltan variables de configuración', async () => {
  const provider = new DeepSeekProvider({ apiKey: '', model: '', baseUrl: '' });
  await assert.rejects(
    () => provider.interpret({ systemPrompt: 'json', userMessage: 'Hola' }),
    (error) => error instanceof AIProviderError && error.type === 'not_configured',
  );
});

test('DeepSeekProvider conserva diagnóstico seguro si termina sin JSON visible', async () => {
  const provider = new DeepSeekProvider({
    apiKey: 'test-key', model: 'model-from-env', baseUrl: 'https://example.deepseek.test/v1',
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 12, completion_tokens: 800 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  await assert.rejects(
    () => provider.interpret({ systemPrompt: 'Devuelve json', userMessage: 'soy distribuidor' }),
    (error) => error instanceof AIProviderError
      && error.type === 'empty_response'
      && error.model === 'model-from-env'
      && error.rawResponse === '{"finishReason":"length","content":""}',
  );
});

test('DeepSeekProvider reintenta una sola vez ante stop sin contenido visible', async () => {
  let calls = 0;
  const provider = new DeepSeekProvider({
    apiKey: 'test-key', model: 'model-from-env', baseUrl: 'https://example.deepseek.test/v1',
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: '', reasoning_content: 'internal-only' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const retryPayload = JSON.parse(options.body);
      assert.match(retryPayload.messages[0].content, /respuesta anterior no incluyó contenido visible/i);
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"intent":"greeting","confidence":0.9}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 13, completion_tokens: 5 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const result = await provider.interpret({ systemPrompt: 'Devuelve json', userMessage: 'Hola' });
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(result.content, '{"intent":"greeting","confidence":0.9}');
});
