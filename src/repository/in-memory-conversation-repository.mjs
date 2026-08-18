import { randomUUID } from 'node:crypto';
import { ConversationRepository } from './conversation-repository.mjs';

function copy(value) { return structuredClone(value); }

export class InMemoryConversationRepository extends ConversationRepository {
  constructor() {
    super();
    this.customers = [];
    this.conversations = [];
    this.messages = [];
    this.quoteRequests = [];
    this.humanHandoffs = [];
    this.aiUsageLogs = [];
    this.turnMetrics = [];
    this.messageSequence = 0;
  }

  async getOrCreateCustomer({ channel, externalId }) {
    let customer = this.customers.find((item) => item.channel === channel && item.externalId === externalId);
    if (!customer) {
      customer = { id: randomUUID(), channel, externalId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      this.customers.push(customer);
    }
    return copy(customer);
  }

  async findLatestConversation({ customerId, channel }) {
    const conversations = this.conversations
      .filter((item) => item.customerId === customerId && item.channel === channel)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return conversations[0] ? copy(conversations[0]) : null;
  }

  async createConversation(input) {
    const timestamp = new Date().toISOString();
    const conversation = { id: randomUUID(), createdAt: timestamp, updatedAt: timestamp, ...copy(input) };
    this.conversations.push(conversation);
    return copy(conversation);
  }

  async saveConversationState({ conversationId, ...updates }) {
    const conversation = this.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error('Conversation not found');
    Object.assign(conversation, copy(updates), { updatedAt: new Date().toISOString() });
    return copy(conversation);
  }

  async appendMessage(input) {
    const message = { id: randomUUID(), sequenceNo: ++this.messageSequence, createdAt: new Date().toISOString(), ...copy(input) };
    this.messages.push(message);
    return copy(message);
  }

  async listMessages(conversationId) {
    return copy(this.messages
      .filter((item) => item.conversationId === conversationId)
      .sort((a, b) => a.sequenceNo - b.sequenceNo));
  }

  async createQuoteRequest(input) {
    const record = { id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...copy(input) };
    this.quoteRequests.push(record);
    return copy(record);
  }

  async listQuoteRequests(conversationId) {
    return copy(this.quoteRequests.filter((item) => item.conversationId === conversationId));
  }

  async createHumanHandoff(input) {
    const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...copy(input) };
    this.humanHandoffs.push(record);
    return copy(record);
  }

  async listHumanHandoffs(conversationId) {
    return copy(this.humanHandoffs.filter((item) => item.conversationId === conversationId));
  }

  async createAIUsageLog(input) {
    const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...copy(input) };
    this.aiUsageLogs.push(record);
    return copy(record);
  }

  async listAIUsageLogs(conversationId) {
    return copy(this.aiUsageLogs.filter((item) => item.conversationId === conversationId));
  }

  async createTurnMetric(input) {
    const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...copy(input) };
    this.turnMetrics.push(record);
    return copy(record);
  }

  async listTurnMetrics(conversationId) {
    return copy(this.turnMetrics.filter((item) => item.conversationId === conversationId));
  }
}
