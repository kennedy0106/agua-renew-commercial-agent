/**
 * Storage port used by ConversationEngine. Implementations may target local
 * PostgreSQL, Neon PostgreSQL, or a test double without changing the engine.
 */
export class ConversationRepository {
  async getOrCreateCustomer(_input) { throw new Error('Not implemented'); }
  async findLatestConversation(_input) { throw new Error('Not implemented'); }
  async createConversation(_input) { throw new Error('Not implemented'); }
  async saveConversationState(_input) { throw new Error('Not implemented'); }
  async appendMessage(_input) { throw new Error('Not implemented'); }
  async listMessages(_conversationId) { throw new Error('Not implemented'); }
  async createQuoteRequest(_input) { throw new Error('Not implemented'); }
  async listQuoteRequests(_conversationId) { throw new Error('Not implemented'); }
  async createHumanHandoff(_input) { throw new Error('Not implemented'); }
  async listHumanHandoffs(_conversationId) { throw new Error('Not implemented'); }
  async createAIUsageLog(_input) { throw new Error('Not implemented'); }
  async listAIUsageLogs(_conversationId) { throw new Error('Not implemented'); }
  async createTurnMetric(_input) { throw new Error('Not implemented'); }
  async listTurnMetrics(_conversationId) { throw new Error('Not implemented'); }
  async close() {}
}
