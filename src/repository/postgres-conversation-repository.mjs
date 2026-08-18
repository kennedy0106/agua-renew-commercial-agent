import { ConversationRepository } from './conversation-repository.mjs';

function mapCustomer(row) {
  return { id: row.id, channel: row.channel, externalId: row.external_id, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

function mapConversation(row) {
  return {
    id: row.id,
    sequenceNo: Number(row.sequence_no),
    customerId: row.customer_id,
    channel: row.channel,
    status: row.status,
    currentFlow: row.current_flow,
    currentStep: row.current_step,
    assignedAgent: row.assigned_agent,
    state: row.state_json,
    lastMessageAt: row.last_message_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    externalId: row.external_id,
    direction: row.direction,
    type: row.type,
    content: row.content,
    metadata: row.metadata_json,
    createdAt: row.created_at.toISOString(),
  };
}

/** PostgreSQL adapter. It works with local PostgreSQL and Neon-compatible URLs. */
export class PostgresConversationRepository extends ConversationRepository {
  constructor({ connectionString }) {
    super();
    this.connectionString = connectionString;
    this.pool = null;
  }

  async connect() {
    if (this.pool) return;
    const { Pool } = await import('pg');
    this.pool = new Pool({ connectionString: this.connectionString, max: 10 });
    await this.pool.query('SELECT 1');
  }

  async getOrCreateCustomer({ channel, externalId }) {
    const result = await this.pool.query(
      `INSERT INTO customers (channel, external_id)
       VALUES ($1, $2)
       ON CONFLICT (channel, external_id)
       DO UPDATE SET updated_at = now()
       RETURNING *`,
      [channel, externalId],
    );
    return mapCustomer(result.rows[0]);
  }

  async findLatestConversation({ customerId, channel }) {
    const result = await this.pool.query(
      `SELECT * FROM conversations
       WHERE customer_id = $1 AND channel = $2
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [customerId, channel],
    );
    return result.rows[0] ? mapConversation(result.rows[0]) : null;
  }

  async createConversation({ customerId, channel, status, currentFlow, currentStep, assignedAgent = null, state, lastMessageAt }) {
    const result = await this.pool.query(
      `INSERT INTO conversations
        (customer_id, channel, status, current_flow, current_step, assigned_agent, state_json, last_message_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [customerId, channel, status, currentFlow, currentStep, assignedAgent, JSON.stringify(state), lastMessageAt],
    );
    return mapConversation(result.rows[0]);
  }

  async saveConversationState({ conversationId, status, currentFlow, currentStep, assignedAgent = null, state, lastMessageAt }) {
    const result = await this.pool.query(
      `UPDATE conversations
       SET status = $2,
           current_flow = $3,
           current_step = $4,
           assigned_agent = $5,
           state_json = $6::jsonb,
           last_message_at = $7,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [conversationId, status, currentFlow, currentStep, assignedAgent, JSON.stringify(state), lastMessageAt],
    );
    if (!result.rows[0]) throw new Error('Conversation not found');
    return mapConversation(result.rows[0]);
  }

  async appendMessage({ conversationId, externalId = null, direction, type, content, metadata = {} }) {
    const result = await this.pool.query(
      `INSERT INTO messages (conversation_id, external_id, direction, type, content, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [conversationId, externalId, direction, type, content, JSON.stringify(metadata)],
    );
    return mapMessage(result.rows[0]);
  }

  async listMessages(conversationId) {
    const result = await this.pool.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sequence_no ASC`,
      [conversationId],
    );
    return result.rows.map(mapMessage);
  }

  async createQuoteRequest({ customerId, conversationId, productId, quantity, status = 'completed', validatedData = {} }) {
    const result = await this.pool.query(
      `INSERT INTO quote_requests
        (customer_id, conversation_id, product_id, quantity, status, validated_data_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [customerId, conversationId, productId, quantity, status, JSON.stringify(validatedData)],
    );
    return result.rows[0];
  }

  async listQuoteRequests(conversationId) {
    const result = await this.pool.query(
      `SELECT * FROM quote_requests WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );
    return result.rows;
  }

  async createHumanHandoff({ customerId, conversationId, reason, sourceResultStatus, ambiguityIds = [], leadSummary = null, category = null }) {
    const result = await this.pool.query(
      `INSERT INTO human_handoffs
        (customer_id, conversation_id, reason, source_result_status, ambiguity_ids, lead_summary_json, category)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING *`,
      [customerId, conversationId, reason, sourceResultStatus, JSON.stringify(ambiguityIds), leadSummary === null ? null : JSON.stringify(leadSummary), category],
    );
    return result.rows[0];
  }

  async listHumanHandoffs(conversationId) {
    const result = await this.pool.query(
      `SELECT * FROM human_handoffs WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );
    return result.rows;
  }

  async createAIUsageLog({ conversationId, provider = null, model = null, latencyMs = null, inputTokens = null, outputTokens = null, intent = null, operation = null, success, fallbackUsed = false, errorType = null, rawResponse = null, parsedResponse = null, parserRejection = null, fallbackReason = null }) {
    const result = await this.pool.query(
      `INSERT INTO ai_usage_logs
        (conversation_id, provider, model, latency_ms, input_tokens, output_tokens, intent, operation, success, fallback_used, error_type, raw_response, parsed_response_json, parser_rejection, fallback_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
       RETURNING *`,
      [conversationId, provider, model, latencyMs, inputTokens, outputTokens, intent, operation, success, fallbackUsed, errorType, rawResponse, parsedResponse === null ? null : JSON.stringify(parsedResponse), parserRejection, fallbackReason],
    );
    return result.rows[0];
  }

  async listAIUsageLogs(conversationId) {
    const result = await this.pool.query(
      `SELECT * FROM ai_usage_logs WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );
    return result.rows;
  }

  async createTurnMetric({ conversationId, eventType, resolution, intent = null, commercialIntent = intent, dialogueAct = null, fallbackReason = null, technicalFallback = false, clarificationRequired = false, aiCallCount = 0, totalLatencyMs, aiLatencyMs = 0, commercialServiceLatencyMs = 0, repositoryReadLatencyMs = 0, repositoryWriteLatencyMs = 0, responseComposerLatencyMs = 0, toolLatencyMs = 0 }) {
    const result = await this.pool.query(
      `INSERT INTO conversation_turn_metrics
        (conversation_id, event_type, resolution, intent, commercial_intent, dialogue_act, fallback_reason, technical_fallback, clarification_required, ai_call_count, total_latency_ms, ai_latency_ms, commercial_service_latency_ms, repository_read_latency_ms, repository_write_latency_ms, response_composer_latency_ms, tool_latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [conversationId, eventType, resolution, intent, commercialIntent, dialogueAct, fallbackReason, technicalFallback, clarificationRequired, aiCallCount, totalLatencyMs, aiLatencyMs, commercialServiceLatencyMs, repositoryReadLatencyMs, repositoryWriteLatencyMs, responseComposerLatencyMs, toolLatencyMs],
    );
    return result.rows[0];
  }

  async listTurnMetrics(conversationId) {
    const result = await this.pool.query(
      `SELECT * FROM conversation_turn_metrics WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC`,
      [conversationId],
    );
    return result.rows;
  }

  async close() {
    await this.pool?.end();
    this.pool = null;
  }
}
