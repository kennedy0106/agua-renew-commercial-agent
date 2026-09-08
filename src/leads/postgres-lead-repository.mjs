import { LeadRepository } from './lead-repository.mjs';
import { isValidTransition } from './lead-states.mjs';

/** Mapeo de columnas SQL → campos del dominio (solo claves permitidas en UPDATE). */
const LEAD_COLUMNS = {
  sourceChannel: 'source_channel',
  sourceOrigin: 'source_origin',
  sourceAdId: 'source_ad_id',
  sourceContext: 'source_context',
  sourceConversationId: 'source_conversation_id',
  metaUserId: 'meta_user_id',
  metaUsername: 'meta_username',
  conversationType: 'conversation_type',
  classificationConfidence: 'classification_confidence',
  automationTriggered: 'automation_triggered',
  phoneRaw: 'phone_raw',
  phoneE164: 'phone_e164',
  product: 'product',
  modality: 'modality',
  status: 'status',
  controlMode: 'control_mode',
  initialSocialMessageSent: 'initial_social_message_sent',
  clarificationCount: 'clarification_count',
  lastReplyAt: 'last_reply_at',
  modalityAskCount: 'modality_ask_count',
  lastInboundAt: 'last_inbound_at',
  whatsappOpenedAt: 'whatsapp_opened_at',
  contactedAt: 'contacted_at',
  metaConfirmationSentAt: 'meta_confirmation_sent_at',
  metaConfirmationBlocked: 'meta_confirmation_blocked',
  processingVersion: 'processing_version',
  lastProcessedAt: 'last_processed_at',
  analysisSummary: 'analysis_summary',
  suggestedWhatsappMessage: 'suggested_whatsapp_message',
  analysisSource: 'analysis_source',
  analysisProvider: 'analysis_provider',
  analysisModel: 'analysis_model',
  aiAnalysis: 'ai_analysis',
  aiAnalyzedAt: 'ai_analyzed_at',
};

function mapLead(row) {
  return {
    id: row.id,
    sourceChannel: row.source_channel,
    sourceOrigin: row.source_origin,
    sourceAdId: row.source_ad_id,
    sourceContext: row.source_context ?? {},
    sourceConversationId: row.source_conversation_id,
    metaUserId: row.meta_user_id,
    metaUsername: row.meta_username,
    conversationType: row.conversation_type,
    classificationConfidence: row.classification_confidence === null ? null : Number(row.classification_confidence),
    automationTriggered: row.automation_triggered,
    phoneRaw: row.phone_raw,
    phoneE164: row.phone_e164,
    product: row.product,
    modality: row.modality,
    status: row.status,
    controlMode: row.control_mode,
    initialSocialMessageSent: row.initial_social_message_sent,
    clarificationCount: Number(row.clarification_count),
    lastReplyAt: row.last_reply_at ? new Date(row.last_reply_at).toISOString() : null,
    modalityAskCount: Number(row.modality_ask_count ?? 0),
    lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at).toISOString() : null,
    whatsappOpenedAt: row.whatsapp_opened_at ? new Date(row.whatsapp_opened_at).toISOString() : null,
    contactedAt: row.contacted_at ? new Date(row.contacted_at).toISOString() : null,
    metaConfirmationSentAt: row.meta_confirmation_sent_at ? new Date(row.meta_confirmation_sent_at).toISOString() : null,
    metaConfirmationBlocked: row.meta_confirmation_blocked,
    processingVersion: row.processing_version,
    lastProcessedAt: row.last_processed_at ? new Date(row.last_processed_at).toISOString() : null,
    analysisSummary: row.analysis_summary,
    suggestedWhatsappMessage: row.suggested_whatsapp_message,
    analysisSource: row.analysis_source,
    analysisProvider: row.analysis_provider,
    analysisModel: row.analysis_model,
    aiAnalysis: row.ai_analysis ?? {},
    aiAnalyzedAt: row.ai_analyzed_at ? new Date(row.ai_analyzed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Adaptador PostgreSQL para leads (compatible con local y Neon). */
export class PostgresLeadRepository extends LeadRepository {
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

  async createLead(data) {
    const { randomUUID } = await import('node:crypto');
    const result = await this.pool.query(
      `INSERT INTO leads
        (id, source_channel, source_origin, source_ad_id, source_context, source_conversation_id,
         meta_user_id, meta_username, automation_triggered)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source_channel, source_conversation_id) DO UPDATE SET
         meta_username = COALESCE(leads.meta_username, EXCLUDED.meta_username),
         meta_user_id = COALESCE(leads.meta_user_id, EXCLUDED.meta_user_id),
         source_ad_id = COALESCE(leads.source_ad_id, EXCLUDED.source_ad_id),
         source_context = CASE WHEN leads.source_context = '{}'::jsonb THEN EXCLUDED.source_context ELSE leads.source_context END
       RETURNING *`,
      [randomUUID(), data.sourceChannel, data.sourceOrigin ?? null, data.sourceAdId ?? null,
        JSON.stringify(data.sourceContext ?? {}), data.sourceConversationId, data.metaUserId ?? null,
        data.metaUsername ?? null, data.automationTriggered === true],
    );
    return mapLead(result.rows[0]);
  }

  async findLeadById(id) {
    const result = await this.pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    return result.rows[0] ? mapLead(result.rows[0]) : null;
  }

  async findLeadByExternalConversation({ channel, sourceConversationId }) {
    const result = await this.pool.query(
      'SELECT * FROM leads WHERE source_channel = $1 AND source_conversation_id = $2 ORDER BY created_at DESC LIMIT 1',
      [channel, sourceConversationId],
    );
    return result.rows[0] ? mapLead(result.rows[0]) : null;
  }

  async findLeadByPhone(phoneE164) {
    const result = await this.pool.query(
      'SELECT * FROM leads WHERE phone_e164 = $1 ORDER BY updated_at DESC LIMIT 1',
      [phoneE164],
    );
    return result.rows[0] ? mapLead(result.rows[0]) : null;
  }

  async updateLead(id, patch) {
    const unknown = Object.keys(patch).filter((key) => !LEAD_COLUMNS[key]);
    if (unknown.length) throw new Error(`Campos de lead no soportados: ${unknown.join(', ')}`);
    const entries = Object.entries(patch);
    if (!entries.length) return this.findLeadById(id);
    if (patch.status !== undefined) {
      const current = await this.findLeadById(id);
      if (!current) throw new Error('Lead not found');
      if (!isValidTransition(current.status, patch.status)) {
        throw new Error(`Transición de lead inválida: ${current.status} → ${patch.status}`);
      }
    }
    const sets = entries.map(([key], index) => `${LEAD_COLUMNS[key]} = $${index + 2}`);
    const values = entries.map(([, value]) => value);
    const result = await this.pool.query(
      `UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...values],
    );
    if (!result.rows[0]) throw new Error('Lead not found');
    return mapLead(result.rows[0]);
  }

  async appendMessage({ leadId, channel, direction, actorType = null, actorId = null, externalMessageId = null, content,
    deliveryStatus = direction === 'inbound' ? 'RECEIVED' : 'PENDING', purpose = null,
    providerMessageId = null, sourceCreatedAt = null }) {
    const result = await this.pool.query(
      `INSERT INTO lead_messages
        (lead_id, channel, direction, actor_type, actor_id, external_message_id, content,
         delivery_status, purpose, provider_message_id, source_created_at, next_attempt_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, now()),
         CASE WHEN $8 = 'PENDING' THEN now() ELSE NULL END,
         CASE WHEN $8 = 'SENT' THEN COALESCE($11, now()) ELSE NULL END)
       ON CONFLICT (external_message_id) WHERE external_message_id IS NOT NULL DO UPDATE SET
         source_created_at = COALESCE(EXCLUDED.source_created_at, lead_messages.source_created_at),
         actor_type = COALESCE(EXCLUDED.actor_type, lead_messages.actor_type)
       RETURNING *, (xmax = 0) AS was_inserted`,
      [leadId, channel, direction, actorType, actorId, externalMessageId, content,
        deliveryStatus, purpose, providerMessageId, sourceCreatedAt],
    );
    return result.rows[0] ? mapMessage(result.rows[0]) : null;
  }

  async listMessages(leadId) {
    const result = await this.pool.query(
      'SELECT * FROM lead_messages WHERE lead_id = $1 ORDER BY COALESCE(source_created_at, created_at) ASC, sequence_no ASC',
      [leadId],
    );
    return result.rows.map(mapMessage);
  }

  async enqueueOutbound({ leadId, channel, actorType, actorId = null, content, purpose,
    eventType = 'OUTBOUND_QUEUED', eventPayload = {}, leadPatch = {} }) {
    const unknown = Object.keys(leadPatch).filter((key) => !LEAD_COLUMNS[key]);
    if (unknown.length) throw new Error(`Campos de lead no soportados: ${unknown.join(', ')}`);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [leadId]);
      const current = currentResult.rows[0] ? mapLead(currentResult.rows[0]) : null;
      if (!current) throw new Error('Lead not found');
      if (leadPatch.status !== undefined && !isValidTransition(current.status, leadPatch.status)) {
        throw new Error(`Transición de lead inválida: ${current.status} → ${leadPatch.status}`);
      }
      const inserted = await client.query(
        `INSERT INTO lead_messages
          (lead_id, channel, direction, actor_type, actor_id, content, delivery_status, purpose,
           source_created_at, next_attempt_at)
         VALUES ($1,$2,'outbound',$3,$4,$5,'PENDING',$6,now(),now()) RETURNING *`,
        [leadId, channel, actorType, actorId, content, purpose],
      );
      const message = mapMessage(inserted.rows[0]);
      await client.query(
        'INSERT INTO lead_events (lead_id, event_type, payload) VALUES ($1,$2,$3::jsonb)',
        [leadId, eventType, JSON.stringify({ ...eventPayload, messageId: message.id, purpose })],
      );
      const entries = Object.entries(leadPatch);
      if (entries.length) {
        const sets = entries.map(([key], index) => `${LEAD_COLUMNS[key]} = $${index + 2}`);
        await client.query(
          `UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
          [leadId, ...entries.map(([, value]) => value)],
        );
      }
      await client.query('COMMIT');
      return message;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async appendEvent({ leadId, eventType, payload = {} }) {
    const result = await this.pool.query(
      'INSERT INTO lead_events (lead_id, event_type, payload) VALUES ($1, $2, $3::jsonb) RETURNING *',
      [leadId, eventType, JSON.stringify(payload)],
    );
    return mapEvent(result.rows[0]);
  }

  async listEvents(leadId) {
    const result = await this.pool.query(
      'SELECT * FROM lead_events WHERE lead_id = $1 ORDER BY created_at ASC',
      [leadId],
    );
    return result.rows.map(mapEvent);
  }

  async recordPhoneHistory({ leadId, previousPhone, newPhone, reason }) {
    const result = await this.pool.query(
      'INSERT INTO lead_phone_history (lead_id, previous_phone, new_phone, reason) VALUES ($1, $2, $3, $4) RETURNING *',
      [leadId, previousPhone, newPhone, reason],
    );
    return mapPhoneHistory(result.rows[0]);
  }

  async listPhoneHistory(leadId) {
    const result = await this.pool.query(
      'SELECT * FROM lead_phone_history WHERE lead_id = $1 ORDER BY created_at ASC',
      [leadId],
    );
    return result.rows.map(mapPhoneHistory);
  }

  #leadFilter({ status = null, channel = null, conversationType = null, from = null, to = null, search = null } = {}) {
    const conditions = [];
    const values = [];
    if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
    if (channel) { values.push(channel); conditions.push(`source_channel = $${values.length}`); }
    if (conversationType) { values.push(conversationType); conditions.push(`conversation_type = $${values.length}`); }
    if (from) { values.push(new Date(from)); conditions.push(`created_at >= $${values.length}`); }
    if (to) { values.push(new Date(to)); conditions.push(`created_at <= $${values.length}`); }
    if (search) {
      values.push(`%${String(search).trim()}%`);
      conditions.push(`(meta_username ILIKE $${values.length} OR phone_e164 ILIKE $${values.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, values };
  }

  async listLeads({ limit = 100, offset = 0, sort = 'createdAt', direction = 'desc', ...filters } = {}) {
    const { where, values } = this.#leadFilter(filters);
    const sortColumn = { createdAt: 'created_at', metaUsername: 'meta_username', status: 'status', product: 'product' }[sort] ?? 'created_at';
    const sortDirection = direction === 'asc' ? 'ASC' : 'DESC';
    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT * FROM leads ${where} ORDER BY ${sortColumn} ${sortDirection} NULLS LAST LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return result.rows.map(mapLead);
  }

  async countLeads(filters = {}) {
    const { where, values } = this.#leadFilter(filters);
    const result = await this.pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE phone_e164 IS NULL)::int AS missing_phone,
              count(*) FILTER (WHERE status = 'READY_FOR_WHATSAPP')::int AS ready,
              count(*) FILTER (WHERE status IN ('CONTACT_OPENED','CONTACTED_MANUALLY'))::int AS contacted
       FROM leads ${where}`,
      values,
    );
    return {
      total: result.rows[0].total,
      missingPhone: result.rows[0].missing_phone,
      ready: result.rows[0].ready,
      contacted: result.rows[0].contacted,
    };
  }

  async countLeadsByStatus() {
    const result = await this.pool.query('SELECT status, count(*)::int AS total FROM leads GROUP BY status');
    const counts = {};
    for (const row of result.rows) counts[row.status] = row.total;
    return counts;
  }

  async deleteLead(id) {
    await this.pool.query('DELETE FROM leads WHERE id = $1', [id]);
  }

  async claimDueOutbound({ limit = 10, leaseMs = 120_000 } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE lead_messages SET delivery_status = 'RETRY_WAIT', next_attempt_at = now(), locked_at = NULL,
           last_error_code = COALESCE(last_error_code, 'STALE_LEASE')
         WHERE delivery_status = 'SENDING' AND locked_at < now() - ($1::int * interval '1 millisecond')`,
        [leaseMs],
      );
      const result = await client.query(
        `WITH due AS (
           SELECT id FROM lead_messages
           WHERE direction = 'outbound' AND delivery_status IN ('PENDING','RETRY_WAIT')
             AND (next_attempt_at IS NULL OR next_attempt_at <= now())
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED LIMIT $1
         )
         UPDATE lead_messages m SET delivery_status = 'SENDING', attempt_count = attempt_count + 1,
           last_attempt_at = now(), locked_at = now()
         FROM due WHERE m.id = due.id RETURNING m.*`,
        [limit],
      );
      await client.query('COMMIT');
      return result.rows.map(mapMessage);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markOutboundSent(messageId, { providerMessageId = null, sentAt = new Date() } = {}) {
    return this.#updateDelivery(messageId,
      `delivery_status = 'SENT', provider_message_id = $2, sent_at = $3, next_attempt_at = NULL,
       locked_at = NULL, last_error_code = NULL, last_error_message = NULL`,
      [providerMessageId, sentAt]);
  }

  async markOutboundRetry(messageId, { nextAttemptAt, errorCode = null, errorMessage = null } = {}) {
    return this.#updateDelivery(messageId,
      `delivery_status = 'RETRY_WAIT', next_attempt_at = $2, locked_at = NULL,
       last_error_code = $3, last_error_message = $4`,
      [nextAttemptAt, errorCode, errorMessage]);
  }

  async markOutboundFailed(messageId, { status = 'FAILED', errorCode = null, errorMessage = null } = {}) {
    if (!['FAILED', 'UNKNOWN'].includes(status)) throw new Error('Estado de entrega inválido');
    return this.#updateDelivery(messageId,
      `delivery_status = $2, next_attempt_at = NULL, locked_at = NULL,
       last_error_code = $3, last_error_message = $4`,
      [status, errorCode, errorMessage]);
  }

  async recordOutboundOutcome({ messageId, status, providerMessageId = null, sentAt = null,
    nextAttemptAt = null, errorCode = null, errorMessage = null, leadPatch = {}, events = [] }) {
    if (!['SENT', 'RETRY_WAIT', 'FAILED', 'UNKNOWN'].includes(status)) throw new Error('Estado de entrega inválido');
    const unknown = Object.keys(leadPatch).filter((key) => !LEAD_COLUMNS[key]);
    if (unknown.length) throw new Error(`Campos de lead no soportados: ${unknown.join(', ')}`);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE lead_messages SET delivery_status = $2,
           provider_message_id = CASE WHEN $2 = 'SENT' THEN $3 ELSE provider_message_id END,
           sent_at = CASE WHEN $2 = 'SENT' THEN $4 ELSE sent_at END,
           next_attempt_at = $5, locked_at = NULL,
           last_error_code = $6, last_error_message = $7
         WHERE id = $1 RETURNING *`,
        [messageId, status, providerMessageId, sentAt, nextAttemptAt, errorCode, errorMessage],
      );
      if (!result.rows[0]) throw new Error('Mensaje no encontrado');
      const message = mapMessage(result.rows[0]);
      const entries = Object.entries(leadPatch);
      if (entries.length) {
        const currentResult = await client.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [message.leadId]);
        const current = currentResult.rows[0] ? mapLead(currentResult.rows[0]) : null;
        if (!current) throw new Error('Lead not found');
        if (leadPatch.status !== undefined && !isValidTransition(current.status, leadPatch.status)) {
          throw new Error(`Transición de lead inválida: ${current.status} → ${leadPatch.status}`);
        }
        const sets = entries.map(([key], index) => `${LEAD_COLUMNS[key]} = $${index + 2}`);
        await client.query(
          `UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
          [message.leadId, ...entries.map(([, value]) => value)],
        );
      }
      for (const event of events) {
        await client.query(
          'INSERT INTO lead_events (lead_id, event_type, payload) VALUES ($1,$2,$3::jsonb)',
          [message.leadId, event.eventType, JSON.stringify(event.payload ?? {})],
        );
      }
      await client.query('COMMIT');
      return message;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async applyHistoricalAnalysis({ leadId, before, after, payload = {} }) {
    const unknown = Object.keys(after).filter((key) => !LEAD_COLUMNS[key]);
    if (unknown.length) throw new Error(`Campos de lead no soportados: ${unknown.join(', ')}`);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [leadId]);
      const current = currentResult.rows[0] ? mapLead(currentResult.rows[0]) : null;
      const unchanged = current && Object.entries(before).every(([key, value]) => (current[key] ?? null) === (value ?? null));
      if (!unchanged) {
        await client.query('ROLLBACK');
        return false;
      }
      if (after.status !== undefined && !isValidTransition(current.status, after.status)) {
        throw new Error(`Transición de lead inválida: ${current.status} → ${after.status}`);
      }
      const entries = Object.entries(after);
      const sets = entries.map(([key], index) => `${LEAD_COLUMNS[key]} = $${index + 2}`);
      await client.query(
        `UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
        [leadId, ...entries.map(([, value]) => value)],
      );
      await client.query(
        'INSERT INTO lead_events (lead_id, event_type, payload) VALUES ($1,$2,$3::jsonb)',
        [leadId, 'HISTORY_ANALYZED', JSON.stringify({ before, after, ...payload })],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async retryOutbound(messageId) {
    const result = await this.pool.query(
      `UPDATE lead_messages SET delivery_status = 'PENDING', attempt_count = 0, next_attempt_at = now(),
         locked_at = NULL, last_error_code = NULL, last_error_message = NULL
       WHERE id = $1 AND delivery_status IN ('FAILED','UNKNOWN') RETURNING *`,
      [messageId],
    );
    if (!result.rows[0]) throw new Error('Mensaje no disponible para reintento');
    return mapMessage(result.rows[0]);
  }

  async #updateDelivery(messageId, setSql, values) {
    const result = await this.pool.query(
      `UPDATE lead_messages SET ${setSql} WHERE id = $1 RETURNING *`,
      [messageId, ...values],
    );
    if (!result.rows[0]) throw new Error('Mensaje no encontrado');
    return mapMessage(result.rows[0]);
  }

  async close() {
    await this.pool?.end();
    this.pool = null;
  }
}

function mapMessage(row) {
  return {
    id: row.id,
    sequenceNo: Number(row.sequence_no),
    leadId: row.lead_id,
    channel: row.channel,
    direction: row.direction,
    actorType: row.actor_type,
    actorId: row.actor_id,
    externalMessageId: row.external_message_id,
    content: row.content,
    createdAt: new Date(row.created_at).toISOString(),
    deliveryStatus: row.delivery_status,
    purpose: row.purpose,
    providerMessageId: row.provider_message_id,
    attemptCount: Number(row.attempt_count ?? 0),
    nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at).toISOString() : null,
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at).toISOString() : null,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    sourceCreatedAt: row.source_created_at ? new Date(row.source_created_at).toISOString() : null,
    lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
    wasInserted: row.was_inserted === undefined ? undefined : row.was_inserted === true,
  };
}

function mapEvent(row) {
  return { id: row.id, leadId: row.lead_id, eventType: row.event_type, payload: row.payload, createdAt: new Date(row.created_at).toISOString() };
}

function mapPhoneHistory(row) {
  return {
    id: row.id, leadId: row.lead_id, previousPhone: row.previous_phone,
    newPhone: row.new_phone, reason: row.reason, createdAt: new Date(row.created_at).toISOString(),
  };
}
