import { AIProvider } from './ai-provider.mjs';

/** Test-only provider: queues structured JSON strings or errors without network use. */
export class FakeAIProvider extends AIProvider {
  constructor(results = []) {
    super();
    this.results = [...results];
    this.requests = [];
  }

  async interpret(input) {
    this.requests.push(input);
    const next = this.results.shift();
    if (next instanceof Error) throw next;
    if (next?.error) throw next.error;
    return {
      provider: 'fake',
      model: 'fake-model',
      latencyMs: 1,
      inputTokens: 10,
      outputTokens: 5,
      content: typeof next === 'string' ? next : JSON.stringify(next ?? { intent: 'unknown', confidence: 0 }),
    };
  }
}
