import { randomUUID } from 'node:crypto';
import { ORGANIZATION_ID, hashPassword, publicUser } from './crm-auth.mjs';
import { presentConversationMessages } from './conversation-message-presenter.mjs';

const PIPELINE_ID = '00000000-0000-4000-8000-000000000010';
const STAGE_IDS = {
  NEW: '00000000-0000-4000-8000-000000000101',
  QUALIFICATION: '00000000-0000-4000-8000-000000000102',
  READY_WHATSAPP: '00000000-0000-4000-8000-000000000103',
  CONTACTED: '00000000-0000-4000-8000-000000000104',
  QUOTATION: '00000000-0000-4000-8000-000000000105',
  NEGOTIATION: '00000000-0000-4000-8000-000000000106',
  WON: '00000000-0000-4000-8000-000000000107',
  LOST: '00000000-0000-4000-8000-000000000108',
};

const STAGE_AUTOMATIONS = {
  NEW: { title: 'Revisar nuevo prospecto', hours: 2, priority: 'HIGH' },
  QUALIFICATION: { title: 'Completar calificación comercial', hours: 4, priority: 'HIGH' },
  READY_WHATSAPP: { title: 'Contactar por WhatsApp', minutes: 30, priority: 'URGENT' },
  CONTACTED: { title: 'Registrar resultado del contacto', hours: 4, priority: 'HIGH' },
  QUOTATION: { title: 'Dar seguimiento a la cotización', hours: 24, priority: 'HIGH' },
  NEGOTIATION: { title: 'Definir próxima acción de negociación', hours: 48, priority: 'HIGH' },
};

function dueDate(rule, now = new Date()) {
  const milliseconds = (rule.minutes ?? (rule.hours * 60)) * 60_000;
  return new Date(now.getTime() + milliseconds);
}

function opportunity(row) {
  return {
    id: row.id,
    sourceLeadId: row.source_lead_id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    phoneE164: row.phone_e164,
    consentStatus: row.consent_status,
    sourceChannel: row.source_channel,
    sourceOrigin: row.source_origin,
    sourceAdId: row.source_ad_id,
    sourceContext: row.source_context ?? {},
    conversationType: row.conversation_type,
    analysisSummary: row.analysis_summary,
    suggestedWhatsappMessage: row.suggested_whatsapp_message,
    analysisSource: row.analysis_source,
    analysisProvider: row.analysis_provider,
    analysisModel: row.analysis_model,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    stageKey: row.stage_key,
    stageName: row.stage_name,
    stageColor: row.stage_color,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    title: row.title,
    product: row.product,
    modality: row.modality,
    quantity: row.quantity === null ? null : Number(row.quantity),
    estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
    currency: row.currency,
    probability: Number(row.probability),
    expectedCloseDate: row.expected_close_date,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    lifecycleStatus: row.lifecycle_status,
    lossReason: row.loss_reason,
    qualificationStatus: row.qualification_status,
    intentLevel: row.intent_level,
    dataQuality: row.data_quality,
    priorityScore: Number(row.priority_score ?? 0),
    automationSummary: row.automation_summary,
    reviewReason: row.review_reason,
    extractedFields: row.extracted_fields ?? {},
    classificationSource: row.classification_source,
    classifiedAt: row.classified_at,
    claimedAt: row.claimed_at,
    whatsappHandoffAt: row.whatsapp_handoff_at,
    whatsappMessage: row.whatsapp_message,
    lastMetaMessageAt: row.last_meta_message_at,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export class CrmRepository {
  constructor({ pool, clock = () => new Date() }) {
    this.pool = pool;
    this.clock = clock;
  }

  async ensureLeadMirror() {
    await this.pool.query(
      `INSERT INTO crm_contacts
        (organization_id, source_lead_id, display_name, phone_e164, source_channel, source_external_id, created_at, updated_at)
       SELECT $1, l.id, COALESCE(NULLIF(btrim(l.meta_username), ''), 'Prospecto de Meta'),
              l.phone_e164, l.source_channel, l.source_conversation_id, l.created_at, l.updated_at
       FROM leads l ON CONFLICT (source_lead_id) DO UPDATE SET
         display_name = CASE WHEN crm_contacts.field_provenance ? 'displayName' THEN crm_contacts.display_name ELSE EXCLUDED.display_name END,
         phone_e164 = CASE WHEN crm_contacts.field_provenance ? 'phoneE164' THEN crm_contacts.phone_e164 ELSE COALESCE(EXCLUDED.phone_e164, crm_contacts.phone_e164) END,
         updated_at = GREATEST(EXCLUDED.updated_at, crm_contacts.updated_at)`,
      [ORGANIZATION_ID],
    );
    await this.pool.query(
      `INSERT INTO crm_opportunities
        (organization_id, source_lead_id, contact_id, pipeline_id, stage_id, title, product, modality,
         probability, lifecycle_status, loss_reason, qualification_status, intent_level, data_quality,
         priority_score, automation_summary, review_reason, extracted_fields, classification_source, classified_at,
         last_meta_message_at, created_at, updated_at)
       SELECT $1, l.id, c.id, $2,
         CASE
           WHEN l.status = 'READY_FOR_WHATSAPP' THEN $3::uuid
           WHEN l.status = 'CONTACTED_MANUALLY' THEN $4::uuid
           WHEN l.status = 'CONTACT_OPENED' THEN $3::uuid
           WHEN l.status IN ('COLLECTING','WAITING_PHONE') THEN $5::uuid
           WHEN l.status = 'CLOSED' AND l.conversation_type = 'commercial_lead' THEN $6::uuid
           ELSE $7::uuid END,
         'Oportunidad · ' || c.display_name, l.product, l.modality,
         CASE WHEN l.status = 'READY_FOR_WHATSAPP' THEN 30 WHEN l.status IN ('COLLECTING','WAITING_PHONE') THEN 15 ELSE 5 END,
         CASE
           WHEN l.conversation_type IN ('spam_or_irrelevant','support_or_complaint','service_provider','existing_customer','employment_or_job') THEN 'ARCHIVED'
           WHEN l.status = 'CLOSED' THEN 'LOST' ELSE 'OPEN' END,
         CASE WHEN l.status = 'CLOSED' THEN 'Cierre histórico importado' ELSE NULL END,
         CASE
           WHEN l.status = 'CONTACTED_MANUALLY' THEN 'HANDED_OFF'
           WHEN l.status = 'CONTACT_OPENED' THEN 'READY'
           WHEN l.status = 'READY_FOR_WHATSAPP' AND l.phone_e164 IS NOT NULL THEN 'READY'
           WHEN l.status IN ('COLLECTING','WAITING_PHONE','WAITING_MODALITY') THEN 'NEEDS_DATA'
           ELSE 'UNREVIEWED' END,
         CASE WHEN l.status='READY_FOR_WHATSAPP' THEN 'INTERESTED'
           WHEN l.conversation_type='commercial_lead' AND l.product IS NOT NULL AND l.modality IS NOT NULL THEN 'QUALIFIED'
           WHEN l.conversation_type='commercial_lead' OR l.product IS NOT NULL OR l.modality IS NOT NULL THEN 'INTERESTED'
           ELSE 'EXPLORING' END,
         CASE WHEN l.phone_e164 IS NOT NULL AND l.product IS NOT NULL AND l.modality IS NOT NULL THEN 'COMPLETE'
           WHEN l.phone_e164 IS NOT NULL OR l.product IS NOT NULL OR l.modality IS NOT NULL THEN 'PARTIAL' ELSE 'INSUFFICIENT' END,
         LEAST(100,CASE WHEN l.phone_e164 IS NOT NULL THEN 25 ELSE 0 END + CASE WHEN l.product IS NOT NULL THEN 20 ELSE 0 END +
           CASE WHEN l.modality IS NOT NULL THEN 20 ELSE 0 END + CASE WHEN l.conversation_type='commercial_lead' THEN 20 ELSE 0 END +
           CASE WHEN l.status='READY_FOR_WHATSAPP' THEN 15 ELSE 0 END),
         l.analysis_summary,
         CASE WHEN l.phone_e164 IS NULL THEN 'Falta un teléfono válido' WHEN l.modality IS NULL THEN 'Falta confirmar la modalidad comercial'
           WHEN l.product IS NULL THEN 'Falta confirmar el producto de interés' ELSE 'Información suficiente para revisión humana' END,
         jsonb_strip_nulls(jsonb_build_object('phone',l.phone_e164,'product',l.product,'modality',l.modality,
           'conversationType',l.conversation_type,'confidence',l.classification_confidence,
           'analysisSource',l.analysis_source,'provider',l.analysis_provider,'model',l.analysis_model,
           'suggestedWhatsappMessage',l.suggested_whatsapp_message,'ai',l.ai_analysis)),
         CASE WHEN l.last_processed_at IS NOT NULL THEN 'AUTOMATION' ELSE 'IMPORTED' END,
         COALESCE(l.last_processed_at,l.updated_at),
         (SELECT max(COALESCE(m.source_created_at,m.created_at)) FROM lead_messages m WHERE m.lead_id=l.id AND m.direction='inbound'),
         l.created_at, l.updated_at
       FROM leads l JOIN crm_contacts c ON c.source_lead_id = l.id
       ON CONFLICT (source_lead_id) DO UPDATE SET
         product = CASE WHEN crm_opportunities.field_provenance ? 'product' THEN crm_opportunities.product ELSE COALESCE(EXCLUDED.product,crm_opportunities.product) END,
         modality = CASE WHEN crm_opportunities.field_provenance ? 'modality' THEN crm_opportunities.modality ELSE COALESCE(EXCLUDED.modality,crm_opportunities.modality) END,
         lifecycle_status = CASE
           WHEN crm_opportunities.classification_source='HUMAN' OR crm_opportunities.lifecycle_status IN ('WON','LOST') THEN crm_opportunities.lifecycle_status
           WHEN EXCLUDED.lifecycle_status='ARCHIVED' THEN 'ARCHIVED'
           WHEN crm_opportunities.lifecycle_status='ARCHIVED' AND EXCLUDED.lifecycle_status='OPEN' THEN 'OPEN'
           ELSE crm_opportunities.lifecycle_status END,
         loss_reason = CASE
           WHEN crm_opportunities.classification_source='HUMAN' OR crm_opportunities.lifecycle_status IN ('WON','LOST') THEN crm_opportunities.loss_reason
           WHEN EXCLUDED.lifecycle_status='ARCHIVED' THEN 'Conversación ajena al negocio'
           WHEN crm_opportunities.lifecycle_status='ARCHIVED' AND EXCLUDED.lifecycle_status='OPEN' THEN NULL
           ELSE crm_opportunities.loss_reason END,
         qualification_status = CASE
           WHEN crm_opportunities.whatsapp_handoff_at IS NOT NULL OR crm_opportunities.qualification_status='HANDED_OFF' THEN 'HANDED_OFF'
           WHEN crm_opportunities.classification_source='HUMAN' THEN crm_opportunities.qualification_status
           ELSE EXCLUDED.qualification_status END,
         intent_level = CASE WHEN crm_opportunities.classification_source='HUMAN' THEN crm_opportunities.intent_level ELSE EXCLUDED.intent_level END,
         data_quality = CASE WHEN crm_opportunities.classification_source='HUMAN' THEN crm_opportunities.data_quality ELSE EXCLUDED.data_quality END,
         priority_score = CASE WHEN crm_opportunities.classification_source='HUMAN' THEN crm_opportunities.priority_score ELSE EXCLUDED.priority_score END,
         automation_summary = CASE WHEN crm_opportunities.classification_source='HUMAN' THEN crm_opportunities.automation_summary ELSE EXCLUDED.automation_summary END,
         review_reason = CASE WHEN crm_opportunities.classification_source='HUMAN' THEN crm_opportunities.review_reason ELSE EXCLUDED.review_reason END,
         extracted_fields = EXCLUDED.extracted_fields,
         classification_source = CASE WHEN crm_opportunities.classification_source='HUMAN' THEN 'HUMAN' ELSE EXCLUDED.classification_source END,
         classified_at = CASE WHEN crm_opportunities.classification_source='HUMAN' THEN crm_opportunities.classified_at ELSE EXCLUDED.classified_at END,
         last_meta_message_at = GREATEST(crm_opportunities.last_meta_message_at,EXCLUDED.last_meta_message_at)`,
      [ORGANIZATION_ID, PIPELINE_ID, STAGE_IDS.READY_WHATSAPP, STAGE_IDS.CONTACTED, STAGE_IDS.QUALIFICATION, STAGE_IDS.LOST, STAGE_IDS.NEW],
    );
    await this.pool.query(`INSERT INTO crm_data_conflicts (organization_id,entity_type,entity_id,field_name,canonical_value,observed_value)
      SELECT $1,'contact',c.id,'phoneE164',c.phone_e164,l.phone_e164 FROM crm_contacts c JOIN leads l ON l.id=c.source_lead_id
      WHERE c.field_provenance ? 'phoneE164' AND l.phone_e164 IS NOT NULL AND c.phone_e164 IS DISTINCT FROM l.phone_e164 ON CONFLICT DO NOTHING`, [ORGANIZATION_ID]);
    await this.pool.query(`INSERT INTO crm_data_conflicts (organization_id,entity_type,entity_id,field_name,canonical_value,observed_value)
      SELECT $1,'opportunity',o.id,v.field_name,v.canonical_value,v.observed_value FROM crm_opportunities o JOIN leads l ON l.id=o.source_lead_id
      CROSS JOIN LATERAL (VALUES ('product',o.product,l.product),('modality',o.modality,l.modality)) v(field_name,canonical_value,observed_value)
      WHERE o.field_provenance ? v.field_name AND v.observed_value IS NOT NULL AND v.canonical_value IS DISTINCT FROM v.observed_value ON CONFLICT DO NOTHING`, [ORGANIZATION_ID]);
  }

  async assignUnownedRoundRobin() {
    const advisors = await this.pool.query(
      `SELECT id FROM crm_users WHERE organization_id = $1 AND role = 'ADVISOR' AND active = TRUE AND deleted_at IS NULL ORDER BY created_at, id`,
      [ORGANIZATION_ID],
    );
    if (!advisors.rowCount) return 0;
    const pending = await this.pool.query(
      `SELECT id FROM crm_opportunities WHERE organization_id = $1 AND owner_id IS NULL
       AND lifecycle_status = 'OPEN' AND deleted_at IS NULL ORDER BY created_at LIMIT 200`,
      [ORGANIZATION_ID],
    );
    for (let index = 0; index < pending.rows.length; index += 1) {
      const ownerId = advisors.rows[index % advisors.rows.length].id;
      await this.pool.query('UPDATE crm_opportunities SET owner_id = $2, updated_at = now(), version = version + 1 WHERE id = $1 AND owner_id IS NULL', [pending.rows[index].id, ownerId]);
    }
    return pending.rowCount;
  }

  async listStages() {
    const result = await this.pool.query(
      `SELECT id, stage_key AS "key", name, position, probability, color, terminal_kind AS "terminalKind"
       FROM crm_pipeline_stages WHERE pipeline_id = $1 AND active = TRUE ORDER BY position`,
      [PIPELINE_ID],
    );
    return result.rows;
  }

  async listUsers() {
    const result = await this.pool.query(
      `SELECT * FROM crm_users WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY active DESC, display_name`,
      [ORGANIZATION_ID],
    );
    return result.rows.map(publicUser);
  }

  async createUser({ email, displayName, password, role }, actor) {
    const normalizedName = String(displayName ?? '').trim();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (!normalizedName) throw new Error('El nombre es obligatorio');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Correo inválido');
    if (!['ADMIN', 'SUPERVISOR', 'ADVISOR'].includes(role)) throw new Error('Rol inválido');
    const passwordHash = await hashPassword(password);
    const result = await this.pool.query(
      `INSERT INTO crm_users (organization_id, email, display_name, password_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ORGANIZATION_ID, normalizedEmail, normalizedName, passwordHash, role],
    );
    await this.audit({ actor, action: 'USER_CREATED', entityType: 'user', entityId: result.rows[0].id, changes: { email, displayName, role } });
    return publicUser(result.rows[0]);
  }

  async listOpportunities({ page = 1, pageSize = 25, q = '', stage = null, ownerId = null, lifecycle = 'OPEN', sort = 'updated_desc', includeDeleted = false }, actor) {
    await this.ensureLeadMirror();
    const conditions = ['o.organization_id = $1'];
    const values = [ORGANIZATION_ID];
    const add = (condition, value) => { values.push(value); conditions.push(condition.replace('?', `$${values.length}`)); };
    if (!includeDeleted) conditions.push('o.deleted_at IS NULL');
    if (lifecycle) add('o.lifecycle_status = ?', lifecycle);
    if (stage) add('s.stage_key = ?', stage);
    if (ownerId) add('o.owner_id = ?', ownerId);
    if (actor.role === 'ADVISOR') add('o.owner_id = ?', actor.id);
    if (q) {
      values.push(`%${String(q).trim()}%`);
      conditions.push(`(c.display_name ILIKE $${values.length} OR c.phone_e164 ILIKE $${values.length} OR o.title ILIKE $${values.length})`);
    }
    const where = conditions.join(' AND ');
    const order = {
      created_asc: 'o.created_at ASC', created_desc: 'o.created_at DESC',
      value_desc: 'o.estimated_value DESC NULLS LAST', next_action: 'o.next_action_at ASC NULLS LAST',
    }[sort] ?? 'o.updated_at DESC';
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safePageSize;
    const count = await this.pool.query(
      `SELECT count(*)::int AS total FROM crm_opportunities o
       JOIN crm_contacts c ON c.id = o.contact_id JOIN crm_pipeline_stages s ON s.id = o.stage_id WHERE ${where}`,
      values,
    );
    values.push(safePageSize, offset);
    const rows = await this.pool.query(
      `SELECT o.*, c.display_name AS contact_name, c.phone_e164, c.consent_status, c.source_channel,
              l.conversation_type, l.source_origin, l.source_ad_id, l.source_context,
              l.analysis_summary, l.suggested_whatsapp_message, l.analysis_source, l.analysis_provider, l.analysis_model,
              (SELECT body FROM crm_communications WHERE opportunity_id=o.id AND channel='WHATSAPP' AND status='HANDED_OFF' ORDER BY created_at DESC LIMIT 1) AS whatsapp_message,
              s.stage_key, s.name AS stage_name, s.color AS stage_color,
              u.display_name AS owner_name
       FROM crm_opportunities o JOIN crm_contacts c ON c.id = o.contact_id
       JOIN crm_pipeline_stages s ON s.id = o.stage_id
       LEFT JOIN crm_users u ON u.id = o.owner_id LEFT JOIN leads l ON l.id = o.source_lead_id
       WHERE ${where} ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const aggregates = await this.dashboard(actor, { compact: true });
    return { items: rows.rows.map(opportunity), page: safePage, pageSize: safePageSize, total: count.rows[0].total, aggregates };
  }

  async dashboard(actor, { compact = false, period = '8w' } = {}) {
    const ownerFilter = actor.role === 'ADVISOR' ? 'AND o.owner_id = $2' : '';
    const values = actor.role === 'ADVISOR' ? [ORGANIZATION_ID, actor.id] : [ORGANIZATION_ID];
    const totals = await this.pool.query(
      `SELECT count(*) FILTER (WHERE o.lifecycle_status = 'OPEN' AND o.deleted_at IS NULL)::int AS open,
              count(*) FILTER (WHERE o.lifecycle_status = 'WON' AND o.deleted_at IS NULL)::int AS won,
              count(*) FILTER (WHERE o.lifecycle_status = 'LOST' AND o.deleted_at IS NULL)::int AS lost,
              COALESCE(sum(o.estimated_value) FILTER (WHERE o.lifecycle_status = 'OPEN' AND o.deleted_at IS NULL),0)::numeric AS pipeline_value,
              count(*) FILTER (WHERE o.next_action_at < now() AND o.lifecycle_status = 'OPEN' AND o.deleted_at IS NULL)::int AS overdue
       FROM crm_opportunities o WHERE o.organization_id = $1 ${ownerFilter}`,
      values,
    );
    if (compact) return {
      open: totals.rows[0].open,
      won: totals.rows[0].won,
      lost: totals.rows[0].lost,
      pipelineValue: Number(totals.rows[0].pipeline_value),
      overdue: totals.rows[0].overdue,
    };
    const stages = await this.pool.query(
      `SELECT s.id, s.stage_key AS "stageKey", s.name, s.color, s.position,
              count(o.id) FILTER (WHERE o.deleted_at IS NULL AND o.lifecycle_status = 'OPEN')::int AS total,
              COALESCE(sum(o.estimated_value) FILTER (WHERE o.deleted_at IS NULL AND o.lifecycle_status = 'OPEN'),0)::numeric AS value
       FROM crm_pipeline_stages s LEFT JOIN crm_opportunities o ON o.stage_id = s.id ${actor.role === 'ADVISOR' ? 'AND o.owner_id = $2' : ''}
       WHERE s.pipeline_id = $1 GROUP BY s.id ORDER BY s.position`,
      actor.role === 'ADVISOR' ? [PIPELINE_ID, actor.id] : [PIPELINE_ID],
    );
    const tasks = await this.pool.query(
      `SELECT count(*)::int AS open,
              count(*) FILTER (WHERE due_at < now())::int AS overdue
       FROM crm_tasks WHERE organization_id = $1 AND status = 'OPEN' AND deleted_at IS NULL
       ${actor.role === 'ADVISOR' ? 'AND assigned_to = $2' : ''}`,
      values,
    );
    const periodConfig = {
      '8w': { bucket: 'week', step: '1 week', span: '7 weeks', label: 'Últimas 8 semanas' },
      '6m': { bucket: 'month', step: '1 month', span: '5 months', label: 'Últimos 6 meses' },
      '12m': { bucket: 'month', step: '1 month', span: '11 months', label: 'Últimos 12 meses' },
    }[period] ?? { bucket: 'week', step: '1 week', span: '7 weeks', label: 'Últimas 8 semanas' };
    const selectedPeriod = ['8w', '6m', '12m'].includes(period) ? period : '8w';
    const [priority, recent, agenda, operational, trend] = await Promise.all([
      this.pool.query(
        `SELECT o.id,o.title,o.estimated_value AS "estimatedValue",o.next_action AS "nextAction",o.next_action_at AS "nextActionAt",
                o.expected_close_date AS "expectedCloseDate",o.probability,c.display_name AS "contactName",c.phone_e164 AS "phoneE164",
                c.source_channel AS "sourceChannel",s.stage_key AS "stageKey",s.name AS "stageName",s.color AS "stageColor",u.display_name AS "ownerName"
         FROM crm_opportunities o JOIN crm_contacts c ON c.id=o.contact_id JOIN crm_pipeline_stages s ON s.id=o.stage_id
         LEFT JOIN crm_users u ON u.id=o.owner_id
         WHERE o.organization_id=$1 AND o.lifecycle_status='OPEN' AND o.deleted_at IS NULL ${ownerFilter}
         ORDER BY (o.next_action_at < now()) DESC,o.next_action_at ASC NULLS LAST,o.estimated_value DESC NULLS LAST,o.updated_at DESC LIMIT 1`,
        values,
      ),
      this.pool.query(
        `SELECT o.id,o.title,o.estimated_value AS "estimatedValue",o.expected_close_date AS "expectedCloseDate",o.probability,
                o.updated_at AS "updatedAt",c.display_name AS "contactName",s.stage_key AS "stageKey",s.name AS "stageName",s.color AS "stageColor",u.display_name AS "ownerName"
         FROM crm_opportunities o JOIN crm_contacts c ON c.id=o.contact_id JOIN crm_pipeline_stages s ON s.id=o.stage_id
         LEFT JOIN crm_users u ON u.id=o.owner_id
         WHERE o.organization_id=$1 AND o.deleted_at IS NULL ${ownerFilter}
         ORDER BY o.updated_at DESC,o.id DESC LIMIT 5`,
        values,
      ),
      this.pool.query(
        `SELECT * FROM (
           SELECT 'event'::text AS kind,e.id,e.title,e.starts_at AS "startsAt",e.event_type AS "eventType",c.display_name AS "contactName"
           FROM crm_calendar_events e LEFT JOIN crm_contacts c ON c.id=e.contact_id
           WHERE e.organization_id=$1 AND e.deleted_at IS NULL AND e.starts_at>=now() ${actor.role === 'ADVISOR' ? 'AND e.assigned_to=$2' : ''}
           UNION ALL
           SELECT 'task'::text AS kind,t.id,t.title,t.due_at AS "startsAt",'TASK'::text AS "eventType",c.display_name AS "contactName"
           FROM crm_tasks t LEFT JOIN crm_contacts c ON c.id=t.contact_id
           WHERE t.organization_id=$1 AND t.deleted_at IS NULL AND t.status='OPEN' AND t.due_at>=now() ${actor.role === 'ADVISOR' ? 'AND t.assigned_to=$2' : ''}
         ) agenda ORDER BY "startsAt" LIMIT 5`,
        values,
      ),
      this.pool.query(
        `SELECT
           count(*) FILTER (WHERE o.lifecycle_status='OPEN' AND o.owner_id IS NULL)::int AS "unassigned",
           count(*) FILTER (WHERE o.lifecycle_status='OPEN' AND o.qualification_status IN ('UNREVIEWED','NEEDS_DATA'))::int AS "needsReview",
           count(*) FILTER (WHERE o.lifecycle_status='OPEN' AND o.qualification_status IN ('READY','CLAIMED'))::int AS "readyForHandoff"
         FROM crm_opportunities o WHERE o.organization_id=$1 AND o.deleted_at IS NULL ${ownerFilter}`,
        values,
      ),
      this.pool.query(
        `WITH buckets AS (
           SELECT generate_series(
             date_trunc('${periodConfig.bucket}',now() AT TIME ZONE 'America/Lima')-interval '${periodConfig.span}',
             date_trunc('${periodConfig.bucket}',now() AT TIME ZONE 'America/Lima'),interval '${periodConfig.step}'
           ) AS bucket
         ), scoped AS (
           SELECT o.id,o.created_at,o.won_at,
             (SELECT min(h.created_at) FROM crm_stage_history h JOIN crm_pipeline_stages hs ON hs.id=h.to_stage_id WHERE h.opportunity_id=o.id AND hs.stage_key='WON') AS won_history_at,
             (SELECT min(h.created_at) FROM crm_stage_history h JOIN crm_pipeline_stages hs ON hs.id=h.to_stage_id WHERE h.opportunity_id=o.id AND hs.stage_key='LOST') AS lost_at
           FROM crm_opportunities o WHERE o.organization_id=$1 AND o.deleted_at IS NULL ${ownerFilter}
         )
         SELECT b.bucket::text AS "bucketStart",
           count(DISTINCT s.id) FILTER (WHERE date_trunc('${periodConfig.bucket}',s.created_at AT TIME ZONE 'America/Lima')=b.bucket)::int AS created,
           count(DISTINCT s.id) FILTER (WHERE date_trunc('${periodConfig.bucket}',COALESCE(s.won_at,s.won_history_at) AT TIME ZONE 'America/Lima')=b.bucket)::int AS won,
           count(DISTINCT s.id) FILTER (WHERE date_trunc('${periodConfig.bucket}',s.lost_at AT TIME ZONE 'America/Lima')=b.bucket)::int AS lost
         FROM buckets b LEFT JOIN scoped s ON TRUE GROUP BY b.bucket ORDER BY b.bucket`,
        values,
      ),
    ]);
    const trendRows = trend.rows.map((row) => ({ ...row, created: Number(row.created), won: Number(row.won), lost: Number(row.lost) }));
    const wonInPeriod = trendRows.reduce((sum, row) => sum + row.won, 0);
    const lostInPeriod = trendRows.reduce((sum, row) => sum + row.lost, 0);
    return {
      ...await this.dashboard(actor, { compact: true }),
      stages: stages.rows.map((row) => ({ ...row, value: Number(row.value) })),
      tasks: tasks.rows[0],
      conversionRate: wonInPeriod + lostInPeriod ? Math.round((wonInPeriod / (wonInPeriod + lostInPeriod)) * 1000) / 10 : null,
      priorityOpportunity: priority.rows[0] ?? null,
      recentOpportunities: recent.rows,
      upcomingAgenda: agenda.rows,
      operationalSummary: { ...operational.rows[0], openTasks: tasks.rows[0].open, overdueTasks: tasks.rows[0].overdue },
      trend: trendRows,
      period: { key: selectedPeriod, label: periodConfig.label, bucket: periodConfig.bucket },
    };
  }

  async globalSearch({ q = '', limit = 8 } = {}, actor) {
    const term = String(q ?? '').trim();
    if (term.length < 2) return { items: [], query: term };
    const size = Math.min(12, Math.max(1, Number(limit) || 8));
    const perType = Math.max(2, Math.ceil(size / 3));
    const [opportunities, contacts, companies] = await Promise.all([
      this.listOpportunities({ page: 1, pageSize: perType, q: term, lifecycle: null, sort: 'updated_desc' }, actor),
      this.listContacts({ page: 1, pageSize: perType, q: term }, actor),
      this.listCompanies({ page: 1, pageSize: perType, q: term }, actor),
    ]);
    const items = [
      ...opportunities.items.map((item) => ({ type: 'opportunity', id: item.id, title: item.contactName || item.title, subtitle: `${item.stageName} · ${item.title}`, destination: 'opportunities' })),
      ...contacts.items.map((item) => ({ type: 'contact', id: item.id, title: item.displayName, subtitle: item.companyName || item.email || item.phoneE164 || 'Contacto', destination: 'contacts' })),
      ...companies.items.map((item) => ({ type: 'company', id: item.id, title: item.name, subtitle: `${item.contacts} contacto(s) · ${item.opportunities} oportunidad(es)`, destination: 'companies' })),
    ].slice(0, size);
    return { items, query: term };
  }

  async findOpportunity(id, actor) {
    const ownerFilter = actor.role === 'ADVISOR' ? 'AND (o.owner_id = $2 OR o.owner_id IS NULL)' : '';
    const values = actor.role === 'ADVISOR' ? [id, actor.id] : [id];
    const result = await this.pool.query(
      `SELECT o.*, c.display_name AS contact_name, c.phone_e164, c.source_channel,
              l.conversation_type, l.source_origin, l.source_ad_id, l.source_context,
              l.analysis_summary, l.suggested_whatsapp_message, l.analysis_source, l.analysis_provider, l.analysis_model,
              s.stage_key, s.name AS stage_name, s.color AS stage_color,
              u.display_name AS owner_name
       FROM crm_opportunities o JOIN crm_contacts c ON c.id = o.contact_id
       JOIN crm_pipeline_stages s ON s.id = o.stage_id LEFT JOIN crm_users u ON u.id = o.owner_id
       LEFT JOIN leads l ON l.id = o.source_lead_id WHERE o.id = $1 ${ownerFilter}`,
      values,
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    const [messages, activities, tasks, notes, quotes] = await Promise.all([
      row.source_lead_id ? this.pool.query('SELECT id, sequence_no AS "sequenceNo", direction, actor_type AS "actorType", content, source_created_at AS "sourceCreatedAt", created_at AS "createdAt" FROM lead_messages WHERE lead_id = $1 ORDER BY COALESCE(source_created_at, created_at), sequence_no', [row.source_lead_id]) : { rows: [] },
      this.pool.query('SELECT a.*, u.display_name AS actor_name FROM crm_activities a LEFT JOIN crm_users u ON u.id = a.actor_user_id WHERE opportunity_id = $1 ORDER BY occurred_at DESC LIMIT 100', [id]),
      this.pool.query('SELECT t.*, u.display_name AS assignee_name FROM crm_tasks t LEFT JOIN crm_users u ON u.id = t.assigned_to WHERE opportunity_id = $1 AND t.deleted_at IS NULL ORDER BY status, due_at NULLS LAST', [id]),
      this.pool.query('SELECT n.*, u.display_name AS author_name FROM crm_notes n LEFT JOIN crm_users u ON u.id = n.author_id WHERE opportunity_id = $1 AND n.deleted_at IS NULL ORDER BY n.created_at DESC', [id]),
      this.pool.query('SELECT * FROM crm_quotes WHERE opportunity_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC', [id]),
    ]);
    return { opportunity: opportunity(row), messages: presentConversationMessages(messages.rows), activities: activities.rows, tasks: tasks.rows, notes: notes.rows, quotes: quotes.rows };
  }

  async moveOpportunity({ id, stageKey, version, reason = null }, actor, requestMeta = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM crm_opportunities WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!current.rowCount) throw new Error('Oportunidad no encontrada');
      if (actor.role === 'ADVISOR' && current.rows[0].owner_id !== actor.id) throw new Error('No autorizado');
      if (Number(current.rows[0].version) !== Number(version)) {
        const conflict = new Error('La oportunidad cambió en otra sesión. Actualice y vuelva a intentar.');
        conflict.code = 'VERSION_CONFLICT';
        throw conflict;
      }
      const stage = await client.query('SELECT * FROM crm_pipeline_stages WHERE pipeline_id = $1 AND stage_key = $2 AND active = TRUE', [PIPELINE_ID, stageKey]);
      if (!stage.rowCount) throw new Error('Etapa inválida');
      if (stageKey === 'LOST' && !String(reason ?? '').trim()) throw new Error('Indique el motivo de pérdida');
      const lifecycle = stageKey === 'WON' ? 'WON' : stageKey === 'LOST' ? 'LOST' : 'OPEN';
      const updated = await client.query(
        `UPDATE crm_opportunities SET stage_id = $2, probability = $3, lifecycle_status = $4,
         loss_reason = CASE WHEN $4 = 'LOST' THEN $5 ELSE NULL END, version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, stage.rows[0].id, stage.rows[0].probability, lifecycle, reason],
      );
      await client.query(
        'INSERT INTO crm_stage_history (opportunity_id, from_stage_id, to_stage_id, actor_user_id, reason) VALUES ($1,$2,$3,$4,$5)',
        [id, current.rows[0].stage_id, stage.rows[0].id, actor.id, reason],
      );
      await client.query(
        `INSERT INTO crm_activities (organization_id, opportunity_id, contact_id, actor_user_id, activity_type, summary, metadata)
         VALUES ($1,$2,$3,$4,'STAGE_CHANGED',$5,$6)`,
        [ORGANIZATION_ID, id, current.rows[0].contact_id, actor.id, `Etapa actualizada a ${stage.rows[0].name}`, JSON.stringify({ from: current.rows[0].stage_id, to: stage.rows[0].id, reason })],
      );
      await client.query("UPDATE crm_tasks SET status = 'CANCELLED', updated_at = now() WHERE opportunity_id = $1 AND status = 'OPEN' AND automation_key LIKE 'stage:%'", [id]);
      await this.#createStageTask(client, { opportunity: updated.rows[0], stage: stage.rows[0], actor });
      await this.#audit(client, { actor, action: 'OPPORTUNITY_STAGE_CHANGED', entityType: 'opportunity', entityId: id, changes: { stageKey, reason }, ...requestMeta });
      await client.query('COMMIT');
      return this.findOpportunity(id, actor);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async updateOpportunity({ id, version, patch }, actor, requestMeta = {}) {
    const allowed = {
      ownerId: 'owner_id', estimatedValue: 'estimated_value', quantity: 'quantity',
      expectedCloseDate: 'expected_close_date', nextAction: 'next_action', nextActionAt: 'next_action_at',
      product: 'product', modality: 'modality', title: 'title',
    };
    const entries = Object.entries(patch ?? {}).filter(([key]) => allowed[key]);
    if (!entries.length) throw new Error('No hay cambios válidos');
    if (actor.role === 'ADVISOR' && entries.some(([key]) => key === 'ownerId')) throw new Error('No autorizado');
    const values = [id, Number(version)];
    const sets = entries.map(([key, value]) => { values.push(value === '' ? null : value); return `${allowed[key]} = $${values.length}`; });
    const protectedFields = entries.filter(([key]) => ['product','modality'].includes(key));
    if (protectedFields.length) {
      values.push(JSON.stringify(Object.fromEntries(protectedFields.map(([key]) => [key,{source:'HUMAN',confirmedAt:new Date().toISOString(),actorId:actor.id}]))));
      sets.push(`field_provenance=field_provenance || $${values.length}::jsonb`);
    }
    const ownerRestriction = actor.role === 'ADVISOR' ? `AND owner_id = $${values.push(actor.id)}` : '';
    const result = await this.pool.query(
      `UPDATE crm_opportunities SET ${sets.join(', ')}, version = version + 1, updated_at = now()
       WHERE id = $1 AND version = $2 AND deleted_at IS NULL ${ownerRestriction} RETURNING id`,
      values,
    );
    if (!result.rowCount) {
      const conflict = new Error('La oportunidad cambió o no está disponible');
      conflict.code = 'VERSION_CONFLICT';
      throw conflict;
    }
    await this.audit({ actor, action: 'OPPORTUNITY_UPDATED', entityType: 'opportunity', entityId: id, changes: patch, ...requestMeta });
    return this.findOpportunity(id, actor);
  }

  async createTask({ opportunityId, title, description = null, dueAt = null, priority = 'MEDIUM', assignedTo = null }, actor, requestMeta = {}) {
    if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) throw new Error('Prioridad inválida');
    const detail = await this.findOpportunity(opportunityId, actor);
    if (!detail) throw new Error('Oportunidad no encontrada');
    const result = await this.pool.query(
      `INSERT INTO crm_tasks (organization_id, opportunity_id, contact_id, assigned_to, created_by, title, description, due_at, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [ORGANIZATION_ID, opportunityId, detail.opportunity.contactId, assignedTo || detail.opportunity.ownerId || actor.id, actor.id, String(title).trim(), description, dueAt, priority],
    );
    await this.audit({ actor, action: 'TASK_CREATED', entityType: 'task', entityId: result.rows[0].id, changes: { opportunityId, title, dueAt, priority }, ...requestMeta });
    return result.rows[0];
  }

  async completeTask(id, version, actor, requestMeta = {}) {
    const ownerRestriction = actor.role === 'ADVISOR' ? 'AND assigned_to = $4' : '';
    const values = actor.role === 'ADVISOR' ? [id, version, actor.id, actor.id] : [id, version];
    const result = await this.pool.query(
      `UPDATE crm_tasks SET status = 'DONE', completed_at = now(), updated_at = now(), version = version + 1
       WHERE id = $1 AND version = $2 AND status = 'OPEN' AND deleted_at IS NULL ${ownerRestriction} RETURNING *`, values,
    );
    if (!result.rowCount) { const error = new Error('La tarea cambió o no está disponible'); error.code = 'VERSION_CONFLICT'; throw error; }
    await this.pool.query("UPDATE crm_notifications SET read_at=COALESCE(read_at,now()) WHERE entity_type='task' AND entity_id=$1 AND read_at IS NULL", [id]);
    await this.audit({ actor, action: 'TASK_COMPLETED', entityType: 'task', entityId: id, changes: {}, ...requestMeta });
    return result.rows[0];
  }

  async addNote({ opportunityId, body }, actor, requestMeta = {}) {
    const detail = await this.findOpportunity(opportunityId, actor);
    if (!detail) throw new Error('Oportunidad no encontrada');
    const result = await this.pool.query(
      `INSERT INTO crm_notes (organization_id, opportunity_id, contact_id, author_id, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ORGANIZATION_ID, opportunityId, detail.opportunity.contactId, actor.id, String(body).trim()],
    );
    await this.audit({ actor, action: 'NOTE_CREATED', entityType: 'note', entityId: result.rows[0].id, changes: { opportunityId }, ...requestMeta });
    return result.rows[0];
  }

  async createQuote({ opportunityId, items, commercialSnapshot, validUntil = null }, actor, requestMeta = {}) {
    const detail = await this.findOpportunity(opportunityId, actor);
    if (!detail) throw new Error('Oportunidad no encontrada');
    if (!Array.isArray(items) || !items.length) throw new Error('Agregue al menos un producto');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sequence = await client.query("SELECT nextval('crm_quote_number_seq') AS value");
      const quoteNumber = `AR-${this.clock().getFullYear()}-${String(sequence.rows[0].value).padStart(6, '0')}`;
      const normalized = items.map((item, index) => ({
        productId: String(item.productId), description: String(item.description), quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice), lineTotal: Math.round(Number(item.quantity) * Number(item.unitPrice) * 100) / 100, position: index + 1,
      }));
      const total = normalized.reduce((sum, item) => sum + item.lineTotal, 0);
      const quote = await client.query(
        `INSERT INTO crm_quotes (organization_id, opportunity_id, quote_number, subtotal, total, commercial_snapshot, valid_until, created_by)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7) RETURNING *`,
        [ORGANIZATION_ID, opportunityId, quoteNumber, total, JSON.stringify(commercialSnapshot), validUntil, actor.id],
      );
      for (const item of normalized) {
        await client.query(
          `INSERT INTO crm_quote_items (quote_id, product_id, description, quantity, unit_price, line_total, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [quote.rows[0].id, item.productId, item.description, item.quantity, item.unitPrice, item.lineTotal, item.position],
        );
      }
      await client.query(
        `UPDATE crm_opportunities SET estimated_value = $2, stage_id = $3, probability = 60, version = version + 1, updated_at = now() WHERE id = $1`,
        [opportunityId, total, STAGE_IDS.QUOTATION],
      );
      await this.#audit(client, { actor, action: 'QUOTE_CREATED', entityType: 'quote', entityId: quote.rows[0].id, changes: { quoteNumber, total }, ...requestMeta });
      await client.query('COMMIT');
      return { ...quote.rows[0], items: normalized };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async setQuoteStatus({ id, status, version }, actor, requestMeta = {}) {
    if (!['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(status)) throw new Error('Estado de cotización inválido');
    if (!await this.getQuote(id, actor)) throw new Error('Cotización no encontrada');
    const result = await this.pool.query(
      `UPDATE crm_quotes SET status = $3, sent_at = CASE WHEN $3 = 'SENT' THEN COALESCE(sent_at, now()) ELSE sent_at END,
       accepted_at = CASE WHEN $3 = 'ACCEPTED' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
       version = version + 1, updated_at = now() WHERE id = $1 AND version = $2 AND deleted_at IS NULL RETURNING *`,
      [id, version, status],
    );
    if (!result.rowCount) throw new Error('La cotización cambió o no está disponible');
    await this.audit({ actor, action: 'QUOTE_STATUS_CHANGED', entityType: 'quote', entityId: id, changes: { status }, ...requestMeta });
    return result.rows[0];
  }

  async getQuote(id, actor) {
    const ownerRestriction = actor.role === 'ADVISOR' ? 'AND o.owner_id = $2' : '';
    const values = actor.role === 'ADVISOR' ? [id, actor.id] : [id];
    const quote = await this.pool.query(
      `SELECT q.*, o.title AS opportunity_title, o.owner_id, c.display_name AS contact_name,
              c.phone_e164, c.email, u.display_name AS created_by_name
       FROM crm_quotes q
       JOIN crm_opportunities o ON o.id = q.opportunity_id
       JOIN crm_contacts c ON c.id = o.contact_id
       LEFT JOIN crm_users u ON u.id = q.created_by
       WHERE q.id = $1 AND q.deleted_at IS NULL ${ownerRestriction}`,
      values,
    );
    if (!quote.rowCount) return null;
    const items = await this.pool.query(
      'SELECT * FROM crm_quote_items WHERE quote_id = $1 ORDER BY position, id',
      [id],
    );
    return { ...quote.rows[0], items: items.rows };
  }

  async softDeleteOpportunity(id, actor, requestMeta = {}) {
    if (actor.role !== 'ADMIN') throw new Error('No autorizado');
    const result = await this.pool.query("UPDATE crm_opportunities SET deleted_at = now(), lifecycle_status = 'ARCHIVED', version = version + 1 WHERE id = $1 AND deleted_at IS NULL RETURNING id", [id]);
    if (!result.rowCount) throw new Error('Oportunidad no encontrada');
    await this.audit({ actor, action: 'OPPORTUNITY_TRASHED', entityType: 'opportunity', entityId: id, changes: {}, ...requestMeta });
    return { deleted: true, recoverableForDays: 90 };
  }

  async restoreOpportunity(id, actor, requestMeta = {}) {
    if (actor.role !== 'ADMIN') throw new Error('No autorizado');
    const result = await this.pool.query("UPDATE crm_opportunities SET deleted_at = NULL, lifecycle_status = 'OPEN', version = version + 1, updated_at = now() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id", [id]);
    if (!result.rowCount) throw new Error('Oportunidad no encontrada en papelera');
    await this.audit({ actor, action: 'OPPORTUNITY_RESTORED', entityType: 'opportunity', entityId: id, changes: {}, ...requestMeta });
    return { restored: true };
  }

  async listNotifications(actor) {
    const result = await this.pool.query(
      `SELECT * FROM crm_notifications WHERE user_id = $1 ORDER BY read_at NULLS FIRST, created_at DESC LIMIT 100`, [actor.id],
    );
    return result.rows;
  }

  async markNotificationRead(id, actor) {
    const result = await this.pool.query('UPDATE crm_notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING *', [id, actor.id]);
    if (!result.rowCount) throw new Error('Notificación no encontrada');
    return result.rows[0];
  }

  async runSlaAutomation() {
    const result = await this.pool.query(
      `INSERT INTO crm_notifications (user_id, notification_type, title, body, entity_type, entity_id)
       SELECT DISTINCT t.assigned_to, 'SLA_OVERDUE', 'Seguimiento vencido', t.title, 'task', t.id
       FROM crm_tasks t WHERE t.status = 'OPEN' AND t.due_at < now() AND t.assigned_to IS NOT NULL AND t.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM crm_notifications n WHERE n.user_id = t.assigned_to AND n.entity_type = 'task' AND n.entity_id = t.id AND n.notification_type = 'SLA_OVERDUE')`,
    );
    return result.rowCount;
  }

  async report(actor, { from = null, to = null } = {}) {
    const conditions = ['o.organization_id = $1', 'o.deleted_at IS NULL'];
    const values = [ORGANIZATION_ID];
    if (actor.role === 'ADVISOR') { values.push(actor.id); conditions.push(`o.owner_id = $${values.length}`); }
    if (from) { values.push(from); conditions.push(`o.created_at >= $${values.length}`); }
    if (to) { values.push(to); conditions.push(`o.created_at < ($${values.length}::date + interval '1 day')`); }
    const where = conditions.join(' AND ');
    const [byStage, byOwner, byChannel, sla] = await Promise.all([
      this.pool.query(`SELECT s.stage_key, s.name, count(*)::int total, COALESCE(sum(o.estimated_value),0)::numeric value FROM crm_opportunities o JOIN crm_pipeline_stages s ON s.id = o.stage_id WHERE ${where} GROUP BY s.id ORDER BY s.position`, values),
      this.pool.query(`SELECT COALESCE(u.display_name,'Sin asignar') owner, count(*)::int total, count(*) FILTER (WHERE o.lifecycle_status='WON')::int won, COALESCE(sum(o.estimated_value),0)::numeric value FROM crm_opportunities o LEFT JOIN crm_users u ON u.id=o.owner_id WHERE ${where} GROUP BY u.display_name ORDER BY total DESC`, values),
      this.pool.query(`SELECT COALESCE(c.source_channel,'Sin canal') channel, count(*)::int total FROM crm_opportunities o JOIN crm_contacts c ON c.id=o.contact_id WHERE ${where} GROUP BY c.source_channel ORDER BY total DESC`, values),
      this.pool.query(`SELECT count(*)::int total, count(*) FILTER (WHERE t.due_at < now() AND t.status='OPEN')::int overdue, count(*) FILTER (WHERE t.status='DONE')::int completed FROM crm_tasks t LEFT JOIN crm_opportunities o ON o.id=t.opportunity_id WHERE ${where.replaceAll('o.', 'o.')} AND t.deleted_at IS NULL`, values),
    ]);
    return {
      byStage: byStage.rows.map((row) => ({ ...row, value: Number(row.value) })),
      byOwner: byOwner.rows.map((row) => ({ ...row, value: Number(row.value) })),
      byChannel: byChannel.rows,
      sla: sla.rows[0],
    };
  }

  async audit({ actor, action, entityType, entityId, changes = {}, ipAddress = null, userAgent = null }) {
    return this.#audit(this.pool, { actor, action, entityType, entityId, changes, ipAddress, userAgent });
  }

  async #audit(client, { actor, action, entityType, entityId, changes = {}, ipAddress = null, userAgent = null }) {
    await client.query(
      `INSERT INTO crm_audit_log (organization_id, actor_user_id, action, entity_type, entity_id, changes, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [ORGANIZATION_ID, actor?.id ?? null, action, entityType, String(entityId ?? ''), JSON.stringify(changes), ipAddress, userAgent],
    );
  }

  async #createStageTask(client, { opportunity, stage, actor }) {
    const rule = STAGE_AUTOMATIONS[stage.stage_key];
    if (!rule || !opportunity.owner_id) return;
    const task = await client.query(
      `INSERT INTO crm_tasks (organization_id, opportunity_id, contact_id, assigned_to, created_by, title, due_at, priority, automation_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING id`,
      [ORGANIZATION_ID, opportunity.id, opportunity.contact_id, opportunity.owner_id, actor.id, rule.title, dueDate(rule, this.clock()), rule.priority, `stage:${stage.stage_key}`],
    );
    if (!task.rowCount) return;
    await client.query(
      `INSERT INTO crm_notifications (user_id, notification_type, title, body, entity_type, entity_id)
       VALUES ($1,'TASK_ASSIGNED','Nueva tarea asignada',$2,'task',$3)`,
      [opportunity.owner_id, rule.title, task.rows[0].id],
    );
  }
}

export { PIPELINE_ID, STAGE_IDS };
