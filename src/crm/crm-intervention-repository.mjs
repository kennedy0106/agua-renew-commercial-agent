import { ORGANIZATION_ID } from './crm-auth.mjs';
import { CrmRevenueRepository } from './crm-revenue-repository.mjs';

const QUALIFICATION = new Set(['UNREVIEWED','NEEDS_DATA','READY','HANDED_OFF']);
const INTENT = new Set(['EXPLORING','INTERESTED','QUALIFIED','READY_TO_BUY']);
const DATA_QUALITY = new Set(['INSUFFICIENT','PARTIAL','COMPLETE']);
const MODALITIES = new Set(['maquila','distribution_agua_renew','final_customer']);
const PRODUCTS = new Set(['20l','1l','625ml','10_5l']);

function conflict(message) { const error = new Error(message); error.code = 'VERSION_CONFLICT'; return error; }
function clean(value) { return value === undefined || value === null || value === '' ? null : String(value).trim(); }
function paging(page, pageSize) { return { page: Math.max(1, Number(page) || 1), pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)) }; }
function priorityLabel(score) { return score >= 80 ? 'URGENT' : score >= 55 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW'; }
function missingFields(row) {
  const missing = [];
  if (!row.phone_e164) missing.push('Teléfono');
  if (!row.product) missing.push('Producto');
  if (!row.modality) missing.push('Modalidad');
  return missing;
}
function factualSummary(row) {
  if (row.analysis_summary) return row.analysis_summary;
  if (row.automation_summary) return row.automation_summary;
  const facts = [];
  if (row.conversation_type === 'commercial_lead') facts.push('La automatización detectó intención comercial');
  if (row.product) facts.push(`producto ${row.product}`);
  if (row.modality) facts.push(`modalidad ${row.modality}`);
  return facts.length ? `${facts.join(', ')}.` : 'La conversación aún no tiene suficiente información estructurada.';
}
function item(row) {
  const missing = missingFields(row);
  return {
    id: row.id, version: Number(row.version), contactId: row.contact_id, contactName: row.contact_name,
    phoneE164: row.phone_e164, consentStatus: row.consent_status, sourceChannel: row.source_channel,
    sourceOrigin: row.source_origin, sourceAdId: row.source_ad_id, sourceContext: row.source_context ?? {},
    ownerId: row.owner_id, ownerName: row.owner_name, stageKey: row.stage_key, stageName: row.stage_name,
    product: row.product, modality: row.modality, conversationType: row.conversation_type,
    classificationConfidence: row.classification_confidence === null ? null : Number(row.classification_confidence),
    qualificationStatus: row.qualification_status, intentLevel: row.intent_level, dataQuality: row.data_quality,
    priorityScore: Number(row.priority_score), priority: priorityLabel(Number(row.priority_score)),
    automationSummary: factualSummary(row), reviewReason: row.review_reason, extractedFields: row.extracted_fields ?? {},
    suggestedWhatsappMessage: row.suggested_whatsapp_message ?? row.extracted_fields?.suggestedWhatsappMessage ?? null,
    analysisSource: row.analysis_source ?? row.extracted_fields?.analysisSource ?? null,
    analysisProvider: row.analysis_provider ?? row.extracted_fields?.provider ?? null,
    analysisModel: row.analysis_model ?? row.extracted_fields?.model ?? null,
    classificationSource: row.classification_source, classifiedAt: row.classified_at, claimedAt: row.claimed_at,
    whatsappHandoffAt: row.whatsapp_handoff_at, lastMetaMessageAt: row.last_meta_message_at,
    lastMessage: row.last_message, messageCount: Number(row.message_count ?? 0), missingFields: missing,
    updatedAt: row.updated_at,
  };
}
async function audit(client, actor, action, entityId, changes, requestMeta) {
  await client.query(`INSERT INTO crm_audit_log
    (organization_id,actor_user_id,action,entity_type,entity_id,changes,ip_address,user_agent)
    VALUES ($1,$2,$3,'opportunity',$4,$5,$6,$7)`,
  [ORGANIZATION_ID,actor.id,action,String(entityId),JSON.stringify(changes),requestMeta.ipAddress??null,requestMeta.userAgent??null]);
}

export class CrmInterventionRepository extends CrmRevenueRepository {
  async listInterventionInbox({ bucket = 'ACTIONABLE', ownerId = null, q = '', page = 1, pageSize = 20, sort = 'RECENT', days = null } = {}, actor) {
    await this.ensureLeadMirror();
    const size = paging(page, pageSize); const values = [ORGANIZATION_ID];
    const scope = ['o.organization_id=$1', "o.lifecycle_status='OPEN'", 'o.deleted_at IS NULL'];
    if (actor.role === 'ADVISOR') { values.push(actor.id); scope.push(`(o.owner_id IS NULL OR o.owner_id=$${values.length})`); }
    else if (ownerId) { values.push(ownerId); scope.push(`o.owner_id=$${values.length}`); }
    const scopedWhere = scope.join(' AND ');
    const scopeValues = [...values];
    let bucketCondition = {
      ACTIONABLE: "o.qualification_status<>'HANDED_OFF'", READY: "o.qualification_status='READY'",
      NEEDS_DATA: "o.qualification_status IN ('NEEDS_DATA','UNREVIEWED')", UNASSIGNED: 'o.owner_id IS NULL',
      HANDED_OFF: "o.qualification_status='HANDED_OFF'",
    }[String(bucket).toUpperCase()] ?? "o.qualification_status<>'HANDED_OFF'";
    if (String(bucket).toUpperCase()==='MINE') { values.push(actor.id); bucketCondition=`o.owner_id=$${values.length}`; }
    const conditions = [...scope, bucketCondition];
    if (q) { values.push(`%${String(q).trim()}%`); conditions.push(`(c.display_name ILIKE $${values.length} OR c.phone_e164 ILIKE $${values.length} OR o.automation_summary ILIKE $${values.length} OR last_message.content ILIKE $${values.length} OR l.source_ad_id ILIKE $${values.length} OR l.source_context::text ILIKE $${values.length})`); }
    const requestedDays = Number(days);
    const dayWindow = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : null;
    if (dayWindow) { values.push(dayWindow); conditions.push(`o.last_meta_message_at >= now() - ($${values.length}::int * interval '1 day')`); }
    const orderBy = String(sort).toUpperCase() === 'PRIORITY'
      ? 'o.priority_score DESC,o.last_meta_message_at DESC NULLS LAST,o.updated_at DESC'
      : 'o.last_meta_message_at DESC NULLS LAST,o.priority_score DESC,o.updated_at DESC';
    const from = `FROM crm_opportunities o JOIN crm_contacts c ON c.id=o.contact_id
      JOIN crm_pipeline_stages s ON s.id=o.stage_id LEFT JOIN crm_users u ON u.id=o.owner_id
      LEFT JOIN leads l ON l.id=o.source_lead_id
      LEFT JOIN LATERAL (SELECT content,COALESCE(source_created_at,created_at) sent_at FROM lead_messages WHERE lead_id=o.source_lead_id AND direction='inbound' ORDER BY COALESCE(source_created_at,created_at) DESC, sequence_no DESC LIMIT 1) last_message ON TRUE
      LEFT JOIN LATERAL (SELECT count(*)::int total FROM lead_messages WHERE lead_id=o.source_lead_id) message_stats ON TRUE`;
    const count = await this.pool.query(`SELECT count(*)::int total ${from} WHERE ${conditions.join(' AND ')}`, values);
    const countValues = [...scopeValues];
    const counts = await this.pool.query(`SELECT
      count(*) FILTER (WHERE o.qualification_status<>'HANDED_OFF')::int actionable,
      count(*) FILTER (WHERE o.qualification_status='READY')::int ready,
      count(*) FILTER (WHERE o.qualification_status IN ('NEEDS_DATA','UNREVIEWED'))::int needs_data,
      count(*) FILTER (WHERE o.owner_id IS NULL)::int unassigned,
      count(*) FILTER (WHERE o.owner_id=$${countValues.push(actor.id)})::int mine,
      count(*) FILTER (WHERE o.qualification_status='HANDED_OFF')::int handed_off
      ${from} WHERE ${scopedWhere}`, countValues);
    values.push(size.pageSize, (size.page - 1) * size.pageSize);
    const rows = await this.pool.query(`SELECT o.*,c.display_name contact_name,c.phone_e164,c.consent_status,c.source_channel,
      s.stage_key,s.name stage_name,u.display_name owner_name,l.conversation_type,l.classification_confidence,
      l.source_origin,l.source_ad_id,l.source_context,l.analysis_summary,l.suggested_whatsapp_message,
      l.analysis_source,l.analysis_provider,l.analysis_model,
      last_message.content last_message,message_stats.total message_count ${from}
      WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}
      LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { items: rows.rows.map(item), total: count.rows[0].total, counts: counts.rows[0], ...size };
  }

  async claimOpportunity(id, version, actor, requestMeta = {}) {
    const assignee = actor.id;
    const result = await this.pool.query(`UPDATE crm_opportunities SET owner_id=$3,claimed_at=COALESCE(claimed_at,now()),version=version+1,updated_at=now()
      WHERE id=$1 AND version=$2 AND lifecycle_status='OPEN' AND deleted_at IS NULL
      AND (owner_id IS NULL OR owner_id=$3 OR $4::boolean) RETURNING id`, [id,Number(version),assignee,actor.role!=='ADVISOR']);
    if (!result.rowCount) throw conflict('La oportunidad ya fue asumida o cambió en otra sesión');
    await this.audit({actor,action:'OPPORTUNITY_CLAIMED',entityType:'opportunity',entityId:id,changes:{ownerId:assignee},...requestMeta});
    return this.findOpportunity(id, actor);
  }

  async qualifyOpportunity(id, version, input, actor, requestMeta = {}) {
    const qualificationStatus = String(input.qualificationStatus ?? 'NEEDS_DATA').toUpperCase();
    const intentLevel = String(input.intentLevel ?? 'EXPLORING').toUpperCase();
    const dataQuality = String(input.dataQuality ?? 'INSUFFICIENT').toUpperCase();
    let product = clean(input.product); let modality = clean(input.modality);
    const productProvided = Object.hasOwn(input, 'product'); const modalityProvided = Object.hasOwn(input, 'modality');
    if (!QUALIFICATION.has(qualificationStatus) || qualificationStatus === 'HANDED_OFF') throw new Error('Estado de calificación inválido');
    if (!INTENT.has(intentLevel) || !DATA_QUALITY.has(dataQuality)) throw new Error('Clasificación inválida');
    if (product && !PRODUCTS.has(product)) throw new Error('Producto inválido');
    if (modality && !MODALITIES.has(modality)) throw new Error('Modalidad inválida');
    const priorityScore = Math.min(100,Math.max(0,Number(input.priorityScore)||0));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(`SELECT o.*,c.phone_e164 FROM crm_opportunities o JOIN crm_contacts c ON c.id=o.contact_id
        WHERE o.id=$1 AND o.organization_id=$2 AND o.lifecycle_status='OPEN' AND o.deleted_at IS NULL FOR UPDATE OF o`,[id,ORGANIZATION_ID]);
      if (!current.rowCount) throw new Error('Oportunidad no encontrada');
      const row = current.rows[0];
      if (actor.role === 'ADVISOR' && row.owner_id !== actor.id) throw new Error('No autorizado: debe asumir la oportunidad antes de modificarla');
      if (Number(row.version) !== Number(version)) throw conflict('La clasificación cambió en otra sesión');
      if (!productProvided) product = row.product;
      if (!modalityProvided) modality = row.modality;
      if (qualificationStatus==='READY' && (!row.phone_e164 || !product || !modality)) throw new Error('Para dejar listo para WhatsApp confirme teléfono, producto y modalidad');
      const provenance = {};
      const confirmedAt = new Date().toISOString();
      if (productProvided) provenance.product={source:'HUMAN',confirmedAt,actorId:actor.id};
      if (modalityProvided) provenance.modality={source:'HUMAN',confirmedAt,actorId:actor.id};
      await client.query(`UPDATE crm_opportunities SET product=$2,modality=$3,qualification_status=$4,intent_level=$5,data_quality=$6,
        priority_score=$7,automation_summary=$8,review_reason=$9,field_provenance=field_provenance || $10::jsonb,
        classification_source='HUMAN',classified_at=now(),version=version+1,updated_at=now()
        WHERE id=$1`, [id,product,modality,qualificationStatus,intentLevel,dataQuality,priorityScore,clean(input.summary),clean(input.reviewReason),JSON.stringify(provenance)]);
      await audit(client,actor,'OPPORTUNITY_QUALIFIED',id,{qualificationStatus,intentLevel,dataQuality,priorityScore,product,modality},requestMeta);
      await client.query('COMMIT');
      return this.findOpportunity(id, actor);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async prepareWhatsAppHandoff(id, version, { message, consentConfirmed = false } = {}, actor, requestMeta = {}) {
    const body = clean(message); if (!body) throw new Error('El mensaje revisado es obligatorio');
    if (!consentConfirmed) throw new Error('Confirme el consentimiento antes de abrir WhatsApp');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(`SELECT o.*,c.phone_e164,c.display_name FROM crm_opportunities o JOIN crm_contacts c ON c.id=o.contact_id
        WHERE o.id=$1 AND o.deleted_at IS NULL FOR UPDATE OF o`,[id]);
      if (!current.rowCount) throw new Error('Oportunidad no encontrada');
      const row=current.rows[0];
      if (!row.owner_id) throw new Error('Debe asumir la oportunidad antes del handoff');
      if (actor.role==='ADVISOR' && row.owner_id!==actor.id) throw new Error('Debe asumir la oportunidad antes del handoff');
      if (Number(row.version)!==Number(version)) throw conflict('La oportunidad cambió en otra sesión');
      if (row.qualification_status!=='READY') throw new Error('La oportunidad debe estar lista para WhatsApp');
      if (!row.phone_e164) throw new Error('El contacto no tiene un teléfono válido');
      const communication = await client.query(`INSERT INTO crm_communications
        (organization_id,opportunity_id,contact_id,actor_user_id,channel,recipient,body,status)
        VALUES ($1,$2,$3,$4,'WHATSAPP',$5,$6,'HANDED_OFF') RETURNING *`,
      [ORGANIZATION_ID,id,row.contact_id,actor.id,row.phone_e164,body]);
      await client.query("UPDATE crm_contacts SET consent_status='GRANTED',updated_at=now(),version=version+1 WHERE id=$1",[row.contact_id]);
      await client.query("UPDATE crm_opportunities SET qualification_status='HANDED_OFF',classification_source='HUMAN',whatsapp_handoff_at=now(),version=version+1,updated_at=now() WHERE id=$1",[id]);
      await client.query(`INSERT INTO crm_activities (organization_id,opportunity_id,contact_id,actor_user_id,activity_type,summary,metadata)
        VALUES ($1,$2,$3,$4,'WHATSAPP_HANDOFF','Handoff manual preparado para WhatsApp',$5)`,
      [ORGANIZATION_ID,id,row.contact_id,actor.id,JSON.stringify({communicationId:communication.rows[0].id})]);
      await audit(client,actor,'WHATSAPP_HANDOFF_PREPARED',id,{communicationId:communication.rows[0].id},requestMeta);
      await client.query('COMMIT');
      const recipient=String(row.phone_e164).replace(/\D/g,'');
      const detail=await this.findOpportunity(id,actor);
      return { communication: communication.rows[0], opportunity:detail.opportunity, url:`https://wa.me/${recipient}?text=${encodeURIComponent(body)}` };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
