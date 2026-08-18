/**
 * Provider port. A provider only returns raw structured interpretation and
 * telemetry; it never receives commercial prices or makes business decisions.
 */
export class AIProvider {
  async interpret(_input) {
    throw new Error('Not implemented');
  }

  /** OpenAI-compatible chat completion port, including native tool calls. */
  async complete(_input) {
    throw new Error('Not implemented');
  }
}
