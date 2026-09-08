import { ORGANIZATION_ID } from './crm-auth.mjs';
import { CrmOperationsRepository } from './crm-operations-repository.mjs';
import { STAGE_IDS } from './crm-repository.mjs';

const MANAGERS = new Set(['ADMIN', 'SUPERVISOR']);
const clean = (value) => value === undefined || value === null || value === '' ? null : String(value).trim();
const whatsappDigits = (value) => String(value ?? '').replace(/\D/g, '');
const validWhatsAppRecipient = (value) => {
  const digits = whatsappDigits(value);
  return digits.length >= 8 && digits.length <= 15;
};
const pageValues = (page, pageSize, maximum = 100) => ({
  page: Math.max(1, Number(page) || 1),
  pageSize: Math.min(maximum, Math.max(1, Number(pageSize) || 25)),
});
function versionConflict(message) { const error = new Error(message); error.code = 'VERSION_CONFLICT'; return error; }
function requireManager(actor) { if (!MANAGERS.has(actor.role)) throw new Error('No autorizado'); }

export function validateCalendarRange(startsAt, endsAt) {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  if (Number.isNaN(starts.valueOf()) || Number.isNaN(ends.valueOf())) {
    throw new Error('La fecha y hora del evento no son válidas');
  }
  if (ends < starts) throw new Error('La fecha de fin no puede ser anterior al inicio');
  return { starts, ends };
}

export class CrmRevenueRepository extends CrmOperationsRepository {
  async listProducts({ q = '', active = null } = {}) {
    const values = [ORGANIZATION_ID];
    const conditions = ['organization_id=$1', 'deleted_at IS NULL'];
    if (active !== null && active !== undefined && active !== '') { values.push(active === true || active === 'true'); conditions.push(`active=$${values.length}`); }
    if (q) { values.push(`%${String(q).trim()}%`); conditions.push(`(name ILIKE $${values.length} OR product_key ILIKE $${values.length} OR category ILIKE $${values.length})`); }
    const result = await this.pool.query(`SELECT * FROM crm_products WHERE ${conditions.join(' AND ')} ORDER BY active DESC,category,name`, values);
    return { items: result.rows, total: result.rowCount };
  }

  async createProduct(input, actor, requestMeta = {}) {
    requireManager(actor);
    const key = clean(input.productKey); const name = clean(input.name); const category = clean(input.category);
    if (!key || !/^[a-z0-9_]+$/.test(key)) throw new Error('Clave de producto inválida');
    if (!name || !category) throw new Error('Nombre y categoría son obligatorios');
    const result = await this.pool.query(`INSERT INTO crm_products (organization_id,product_key,name,category,description,created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [ORGANIZATION_ID,key,name,category,clean(input.description),actor.id]).catch(async (error) => {
      if (error.code === '42703') return this.pool.query(`INSERT INTO crm_products (organization_id,product_key,name,category,description) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [ORGANIZATION_ID,key,name,category,clean(input.description)]);
      throw error;
    });
    await this.audit({ actor, action:'PRODUCT_CREATED', entityType:'product', entityId:result.rows[0].id, changes:{ productKey:key,name }, ...requestMeta });
    return result.rows[0];
  }

  async updateProduct(id, version, patch, actor, requestMeta = {}) {
    requireManager(actor);
    const allowed = { name:'name', category:'category', description:'description', active:'active' };
    const entries = Object.entries(patch ?? {}).filter(([key]) => allowed[key]);
    if (!entries.length) throw new Error('No hay cambios válidos');
    const values = [id,Number(version)];
    const sets = entries.map(([key,value]) => { values.push(key === 'active' ? Boolean(value) : clean(value)); return `${allowed[key]}=$${values.length}`; });
    const result = await this.pool.query(`UPDATE crm_products SET ${sets.join(',')},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL RETURNING *`, values);
    if (!result.rowCount) throw versionConflict('El producto cambió en otra sesión');
    await this.audit({ actor, action:'PRODUCT_UPDATED', entityType:'product', entityId:id, changes:patch, ...requestMeta });
    return result.rows[0];
  }

  async createQuote({ opportunityId, items, commercialSnapshot, validUntil = null, notes = null, terms = null }, actor, requestMeta = {}) {
    if (!Array.isArray(items) || !items.length) throw new Error('Agregue al menos un producto');
    if (items.length > 10) throw new Error('Una cotización admite hasta 10 productos');
    const detail = await this.findOpportunity(opportunityId, actor);
    if (!detail) throw new Error('Oportunidad no encontrada');
    const normalized = items.map((item, index) => {
      const quantity = Number(item.quantity); const base = Number(item.unitPrice); const discount = Number(item.discountPercent ?? 0);
      if (!(quantity > 0) || !(base >= 0) || !(discount >= 0 && discount <= 100)) throw new Error('Partida de cotización inválida');
      if (actor.role === 'ADVISOR' && discount > 10) throw new Error('Los asesores pueden aplicar hasta 10% de descuento');
      const unitPrice = Math.round(base * (1 - discount / 100) * 10000) / 10000;
      return { productId:String(item.productId), description:clean(item.description) || String(item.productId), quantity, baseUnitPrice:base, discountPercent:discount, unitPrice, lineTotal:Math.round(quantity * unitPrice * 100) / 100, position:index + 1 };
    });
    const subtotal = normalized.reduce((sum,item) => sum + Math.round(item.quantity * item.baseUnitPrice * 100) / 100,0);
    const total = normalized.reduce((sum,item) => sum + item.lineTotal,0);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sequence = await client.query("SELECT nextval('crm_quote_number_seq') value");
      const number = `AR-${new Date().getFullYear()}-${String(sequence.rows[0].value).padStart(6,'0')}`;
      const quote = await client.query(`INSERT INTO crm_quotes (organization_id,opportunity_id,quote_number,subtotal,discount_total,total,commercial_snapshot,valid_until,notes,terms,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [ORGANIZATION_ID,opportunityId,number,subtotal,Math.max(0,subtotal-total),total,JSON.stringify(commercialSnapshot ?? {}),validUntil,clean(notes),clean(terms),actor.id]);
      for (const item of normalized) await client.query(`INSERT INTO crm_quote_items (quote_id,product_id,description,quantity,base_unit_price,discount_percent,unit_price,line_total,position)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [quote.rows[0].id,item.productId,item.description,item.quantity,item.baseUnitPrice,item.discountPercent,item.unitPrice,item.lineTotal,item.position]);
      await client.query(`UPDATE crm_opportunities SET estimated_value=$2,stage_id=$3,probability=60,version=version+1,updated_at=now() WHERE id=$1`, [opportunityId,total,STAGE_IDS.QUOTATION]);
      await client.query(`INSERT INTO crm_activities (organization_id,opportunity_id,contact_id,actor_user_id,activity_type,summary,metadata) VALUES ($1,$2,$3,$4,'QUOTE_CREATED',$5,$6)`, [ORGANIZATION_ID,opportunityId,detail.opportunity.contactId,actor.id,`Cotización ${number} creada`,JSON.stringify({total,items:normalized.length})]);
      await client.query(`INSERT INTO crm_audit_log (organization_id,actor_user_id,action,entity_type,entity_id,changes,ip_address,user_agent) VALUES ($1,$2,'QUOTE_CREATED','quote',$3,$4,$5,$6)`, [ORGANIZATION_ID,actor.id,quote.rows[0].id,JSON.stringify({number,total}),requestMeta.ipAddress??null,requestMeta.userAgent??null]);
      await client.query('COMMIT');
      return { ...quote.rows[0], items:normalized };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async listQuotes({ page=1,pageSize=25,status=null,q='' }={},actor) {
    const paging=pageValues(page,pageSize); const values=[ORGANIZATION_ID]; const conditions=['q.organization_id=$1','q.deleted_at IS NULL'];
    if (actor.role==='ADVISOR') { values.push(actor.id); conditions.push(`o.owner_id=$${values.length}`); }
    if (status) { values.push(status); conditions.push(`q.status=$${values.length}`); }
    if (q) { values.push(`%${String(q).trim()}%`); conditions.push(`(q.quote_number ILIKE $${values.length} OR c.display_name ILIKE $${values.length})`); }
    const where=conditions.join(' AND '); const total=await this.pool.query(`SELECT count(*)::int total FROM crm_quotes q JOIN crm_opportunities o ON o.id=q.opportunity_id JOIN crm_contacts c ON c.id=o.contact_id WHERE ${where}`,values);
    values.push(paging.pageSize,(paging.page-1)*paging.pageSize);
    const rows=await this.pool.query(`SELECT q.*,c.display_name contact_name,o.title opportunity_title,u.display_name owner_name FROM crm_quotes q JOIN crm_opportunities o ON o.id=q.opportunity_id JOIN crm_contacts c ON c.id=o.contact_id LEFT JOIN crm_users u ON u.id=o.owner_id WHERE ${where} ORDER BY q.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
    return {items:rows.rows,total:total.rows[0].total,...paging};
  }

  async setQuoteStatus({ id, status, version }, actor, requestMeta = {}) {
    if (!['DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED'].includes(status)) throw new Error('Estado de cotización inválido');
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current=await client.query(`SELECT q.*,o.contact_id,o.owner_id FROM crm_quotes q JOIN crm_opportunities o ON o.id=q.opportunity_id WHERE q.id=$1 AND q.deleted_at IS NULL FOR UPDATE OF q`,[id]);
      if(!current.rowCount || (actor.role==='ADVISOR' && current.rows[0].owner_id!==actor.id)) throw new Error('Cotización no encontrada');
      if(Number(current.rows[0].version)!==Number(version)) throw versionConflict('La cotización cambió en otra sesión');
      const quote=(await client.query(`UPDATE crm_quotes SET status=$2,sent_at=CASE WHEN $2='SENT' THEN COALESCE(sent_at,now()) ELSE sent_at END,accepted_at=CASE WHEN $2='ACCEPTED' THEN COALESCE(accepted_at,now()) ELSE accepted_at END,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,status])).rows[0];
      let order=null;
      if(status==='ACCEPTED'){
        await client.query(`UPDATE crm_opportunities SET stage_id=$2,lifecycle_status='WON',probability=100,won_at=COALESCE(won_at,now()),version=version+1,updated_at=now() WHERE id=$1`,[quote.opportunity_id,STAGE_IDS.WON]);
        const sequence=await client.query("SELECT nextval('crm_order_number_seq') value");
        const number=`PED-${new Date().getFullYear()}-${String(sequence.rows[0].value).padStart(6,'0')}`;
        const inserted=await client.query(`INSERT INTO crm_orders (organization_id,opportunity_id,quote_id,contact_id,order_number,total,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (quote_id) DO UPDATE SET updated_at=now() RETURNING *`,[ORGANIZATION_ID,quote.opportunity_id,id,current.rows[0].contact_id,number,quote.total,actor.id]); order=inserted.rows[0];
        await client.query(`INSERT INTO crm_order_items (order_id,product_id,description,quantity,unit_price,line_total,position) SELECT $1,product_id,description,quantity,unit_price,line_total,position FROM crm_quote_items WHERE quote_id=$2 ON CONFLICT DO NOTHING`,[order.id,id]);
      }
      await client.query(`INSERT INTO crm_audit_log (organization_id,actor_user_id,action,entity_type,entity_id,changes,ip_address,user_agent) VALUES ($1,$2,'QUOTE_STATUS_CHANGED','quote',$3,$4,$5,$6)`,[ORGANIZATION_ID,actor.id,id,JSON.stringify({status,orderId:order?.id}),requestMeta.ipAddress??null,requestMeta.userAgent??null]);
      await client.query('COMMIT'); return {quote,order};
    } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async listCalendar({ from,to,assignedTo=null }={},actor){
    const values=[ORGANIZATION_ID,from || new Date(Date.now()-7*86400000).toISOString(),to || new Date(Date.now()+35*86400000).toISOString()]; const conditions=['e.organization_id=$1','e.deleted_at IS NULL','e.starts_at<$3','e.ends_at>=$2'];
    if(actor.role==='ADVISOR'){values.push(actor.id);conditions.push(`e.assigned_to=$${values.length}`);}else if(assignedTo){values.push(assignedTo);conditions.push(`e.assigned_to=$${values.length}`);}
    const events=await this.pool.query(`SELECT e.*,c.display_name contact_name,o.title opportunity_title,u.display_name assignee_name FROM crm_calendar_events e LEFT JOIN crm_contacts c ON c.id=e.contact_id LEFT JOIN crm_opportunities o ON o.id=e.opportunity_id LEFT JOIN crm_users u ON u.id=e.assigned_to WHERE ${conditions.join(' AND ')} ORDER BY e.starts_at`,values);
    const taskValues=[ORGANIZATION_ID,values[1],values[2]];let taskRestriction='';if(actor.role==='ADVISOR'){taskValues.push(actor.id);taskRestriction=`AND t.assigned_to=$4`;}else if(assignedTo){taskValues.push(assignedTo);taskRestriction=`AND t.assigned_to=$4`;}
    const tasks=await this.pool.query(`SELECT t.id,t.title,t.due_at starts_at,t.due_at ends_at,t.status,t.priority,t.version,c.display_name contact_name,u.display_name assignee_name,'TASK' event_type FROM crm_tasks t LEFT JOIN crm_contacts c ON c.id=t.contact_id LEFT JOIN crm_users u ON u.id=t.assigned_to WHERE t.organization_id=$1 AND t.deleted_at IS NULL AND t.due_at>=$2 AND t.due_at<$3 ${taskRestriction} ORDER BY t.due_at`,taskValues);
    return {events:events.rows,tasks:tasks.rows};
  }

  async createCalendarEvent(input,actor,requestMeta={}){
    if(!clean(input.title))throw new Error('El título del evento es obligatorio');
    const {starts,ends}=validateCalendarRange(input.startsAt,input.endsAt);
    const assigned=actor.role==='ADVISOR'?actor.id:(clean(input.assignedTo)||actor.id);
    const result=await this.pool.query(`INSERT INTO crm_calendar_events (organization_id,opportunity_id,contact_id,assigned_to,created_by,event_type,title,description,location,starts_at,ends_at,all_day) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[ORGANIZATION_ID,clean(input.opportunityId),clean(input.contactId),assigned,actor.id,input.eventType||'FOLLOW_UP',clean(input.title),clean(input.description),clean(input.location),starts.toISOString(),ends.toISOString(),Boolean(input.allDay)]);
    await this.audit({actor,action:'CALENDAR_EVENT_CREATED',entityType:'calendar_event',entityId:result.rows[0].id,changes:{title:input.title},...requestMeta});return result.rows[0];
  }

  async updateCalendarEvent(id,version,patch,actor,requestMeta={}){
    const allowed={title:'title',description:'description',location:'location',startsAt:'starts_at',endsAt:'ends_at',eventType:'event_type',assignedTo:'assigned_to',status:'status',allDay:'all_day'};
    const entries=Object.entries(patch??{}).filter(([key])=>allowed[key]);
    if(!entries.length)throw new Error('No hay cambios válidos');
    if(patch.title!==undefined&&!clean(patch.title))throw new Error('El título del evento es obligatorio');
    if(actor.role==='ADVISOR'&&entries.some(([key])=>key==='assignedTo'))throw new Error('No autorizado');
    if(patch.startsAt!==undefined||patch.endsAt!==undefined){
      const currentValues=[id];let currentRestriction='';
      if(actor.role==='ADVISOR'){currentValues.push(actor.id);currentRestriction='AND assigned_to=$2';}
      const current=await this.pool.query(`SELECT starts_at,ends_at FROM crm_calendar_events WHERE id=$1 AND deleted_at IS NULL ${currentRestriction}`,currentValues);
      if(!current.rowCount)throw new Error('Evento no encontrado');
      validateCalendarRange(patch.startsAt??current.rows[0].starts_at,patch.endsAt??current.rows[0].ends_at);
    }
    const values=[id,Number(version)];
    const sets=entries.map(([key,value])=>{let normalized=key==='allDay'?Boolean(value):clean(value);if((key==='startsAt'||key==='endsAt')&&normalized)normalized=new Date(normalized).toISOString();values.push(normalized);return `${allowed[key]}=$${values.length}`;});
    let restriction='';if(actor.role==='ADVISOR'){values.push(actor.id);restriction=`AND assigned_to=$${values.length}`;}
    const result=await this.pool.query(`UPDATE crm_calendar_events SET ${sets.join(',')},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL ${restriction} RETURNING *`,values);
    if(!result.rowCount)throw versionConflict('El evento cambió o no está disponible');
    await this.audit({actor,action:'CALENDAR_EVENT_UPDATED',entityType:'calendar_event',entityId:id,changes:patch,...requestMeta});return result.rows[0];
  }

  async deleteCalendarEvent(id,version,actor,requestMeta={}){let values=[id,Number(version)];let restriction='';if(actor.role==='ADVISOR'){values.push(actor.id);restriction='AND assigned_to=$3';}const result=await this.pool.query(`UPDATE crm_calendar_events SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL ${restriction} RETURNING id`,values);if(!result.rowCount)throw versionConflict('El evento cambió o no está disponible');await this.audit({actor,action:'CALENDAR_EVENT_DELETED',entityType:'calendar_event',entityId:id,changes:{},...requestMeta});return {deleted:true};}

  async listAutomationRules(actor){requireManager(actor);const result=await this.pool.query(`SELECT r.*,u.display_name created_by_name FROM crm_automation_rules r LEFT JOIN crm_users u ON u.id=r.created_by WHERE r.organization_id=$1 AND r.deleted_at IS NULL ORDER BY r.active DESC,r.created_at DESC`,[ORGANIZATION_ID]);return {items:result.rows,total:result.rowCount};}
  async createAutomationRule(input,actor,requestMeta={}){requireManager(actor);if(!clean(input.name))throw new Error('El nombre de la regla es obligatorio');if(!['TASK_OVERDUE','OPPORTUNITY_IDLE'].includes(input.triggerType)||input.actionType!=='NOTIFY_OWNER')throw new Error('La combinación de condición y acción no está disponible');if(input.triggerType==='OPPORTUNITY_IDLE'){const hours=Number(input.triggerConfig?.hours);if(!Number.isInteger(hours)||hours<1||hours>8760)throw new Error('Las horas sin actividad deben estar entre 1 y 8760');}const result=await this.pool.query(`INSERT INTO crm_automation_rules (organization_id,name,trigger_type,trigger_config,action_type,action_config,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[ORGANIZATION_ID,clean(input.name),input.triggerType,JSON.stringify(input.triggerConfig??{}),input.actionType,JSON.stringify(input.actionConfig??{}),actor.id]);await this.audit({actor,action:'AUTOMATION_CREATED',entityType:'automation_rule',entityId:result.rows[0].id,changes:{name:input.name},...requestMeta});return result.rows[0];}
  async updateAutomationRule(id,version,patch,actor,requestMeta={}){requireManager(actor);const allowed={name:'name',active:'active',triggerConfig:'trigger_config',actionConfig:'action_config'};const entries=Object.entries(patch??{}).filter(([key])=>allowed[key]);if(!entries.length)throw new Error('No hay cambios válidos');const values=[id,Number(version)];const sets=entries.map(([key,value])=>{values.push(key.endsWith('Config')?JSON.stringify(value??{}):key==='active'?Boolean(value):clean(value));return `${allowed[key]}=$${values.length}`;});const result=await this.pool.query(`UPDATE crm_automation_rules SET ${sets.join(',')},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL RETURNING *`,values);if(!result.rowCount)throw versionConflict('La automatización cambió en otra sesión');await this.audit({actor,action:'AUTOMATION_UPDATED',entityType:'automation_rule',entityId:id,changes:patch,...requestMeta});return result.rows[0];}

  async runRevenueAutomations(){const configured=await this.pool.query(`SELECT id,trigger_type,trigger_config,action_type FROM crm_automation_rules WHERE organization_id=$1 AND active=TRUE AND deleted_at IS NULL AND trigger_type IN ('TASK_OVERDUE','OPPORTUNITY_IDLE') AND action_type='NOTIFY_OWNER' ORDER BY created_at`,[ORGANIZATION_ID]);let overdue=0;let idle=0;for(const rule of configured.rows){if(rule.trigger_type==='TASK_OVERDUE'){overdue+=await this.runSlaAutomation();}else{const hours=Math.min(8760,Math.max(1,Number(rule.trigger_config?.hours)||72));const result=await this.pool.query(`INSERT INTO crm_notifications (user_id,notification_type,title,body,entity_type,entity_id) SELECT o.owner_id,'OPPORTUNITY_IDLE','Oportunidad sin seguimiento',o.title,'opportunity',o.id FROM crm_opportunities o WHERE o.organization_id=$1 AND o.lifecycle_status='OPEN' AND o.deleted_at IS NULL AND o.owner_id IS NOT NULL AND o.updated_at<now()-($2::int*interval '1 hour') AND NOT EXISTS (SELECT 1 FROM crm_notifications n WHERE n.user_id=o.owner_id AND n.entity_type='opportunity' AND n.entity_id=o.id AND n.notification_type='OPPORTUNITY_IDLE' AND n.created_at>now()-interval '24 hours')`,[ORGANIZATION_ID,hours]);idle+=result.rowCount;}await this.pool.query(`UPDATE crm_automation_rules SET last_run_at=now(),updated_at=now() WHERE id=$1`,[rule.id]);}return {overdue,idle,rules:configured.rowCount};}

  async listTemplates(actor){const result=await this.pool.query(`SELECT * FROM crm_communication_templates WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY active DESC,name`,[ORGANIZATION_ID]);return {items:result.rows,total:result.rowCount};}
  async createTemplate(input,actor,requestMeta={}){requireManager(actor);if(!clean(input.name)||!clean(input.body))throw new Error('Nombre y contenido son obligatorios');const result=await this.pool.query(`INSERT INTO crm_communication_templates (organization_id,name,channel,subject,body,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[ORGANIZATION_ID,clean(input.name),input.channel,clean(input.subject),clean(input.body),actor.id]);await this.audit({actor,action:'COMMUNICATION_TEMPLATE_CREATED',entityType:'communication_template',entityId:result.rows[0].id,changes:{name:input.name},...requestMeta});return result.rows[0];}
  async listCommunications({page=1,pageSize=25,channel=null,status=null}={},actor){const paging=pageValues(page,pageSize);const values=[ORGANIZATION_ID];const conditions=['m.organization_id=$1','m.deleted_at IS NULL'];if(actor.role==='ADVISOR'){values.push(actor.id);conditions.push(`(m.actor_user_id=$${values.length} OR o.owner_id=$${values.length})`);}if(channel){values.push(channel);conditions.push(`m.channel=$${values.length}`);}if(status){values.push(status);conditions.push(`m.status=$${values.length}`);}const where=conditions.join(' AND ');const total=await this.pool.query(`SELECT count(*)::int total FROM crm_communications m LEFT JOIN crm_opportunities o ON o.id=m.opportunity_id WHERE ${where}`,values);values.push(paging.pageSize,(paging.page-1)*paging.pageSize);const rows=await this.pool.query(`SELECT m.*,c.display_name contact_name,o.title opportunity_title,u.display_name actor_name FROM crm_communications m LEFT JOIN crm_contacts c ON c.id=m.contact_id LEFT JOIN crm_opportunities o ON o.id=m.opportunity_id LEFT JOIN crm_users u ON u.id=m.actor_user_id WHERE ${where} ORDER BY m.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);return {items:rows.rows,total:total.rows[0].total,...paging};}
  async createCommunication(input,actor,requestMeta={}){if(!clean(input.body))throw new Error('El mensaje no puede estar vacío');if(input.channel==='EMAIL'&&!clean(input.recipient))throw new Error('El correo de destino es obligatorio');if(input.channel==='WHATSAPP'&&!validWhatsAppRecipient(input.recipient))throw new Error('Ingrese un teléfono de WhatsApp válido');const result=await this.pool.query(`INSERT INTO crm_communications (organization_id,opportunity_id,contact_id,template_id,actor_user_id,channel,recipient,subject,body,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT') RETURNING *`,[ORGANIZATION_ID,clean(input.opportunityId),clean(input.contactId),clean(input.templateId),actor.id,input.channel,clean(input.recipient),clean(input.subject),clean(input.body)]);await this.audit({actor,action:'COMMUNICATION_DRAFTED',entityType:'communication',entityId:result.rows[0].id,changes:{channel:input.channel},...requestMeta});return result.rows[0];}
  async handoffCommunication(id,version,actor,requestMeta={}){const values=[id,Number(version)];let restriction='';if(actor.role==='ADVISOR'){values.push(actor.id);restriction='AND actor_user_id=$3';}const current=await this.pool.query(`SELECT channel,recipient FROM crm_communications WHERE id=$1 AND version=$2 AND status='DRAFT' AND deleted_at IS NULL ${restriction}`,values);if(!current.rowCount)throw versionConflict('El borrador cambió o no está disponible');if(current.rows[0].channel==='EMAIL'&&!clean(current.rows[0].recipient))throw new Error('El correo de destino es obligatorio');if(current.rows[0].channel==='WHATSAPP'&&!validWhatsAppRecipient(current.rows[0].recipient))throw new Error('Ingrese un teléfono de WhatsApp válido');const result=await this.pool.query(`UPDATE crm_communications SET status='HANDED_OFF',version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND status='DRAFT' AND deleted_at IS NULL ${restriction} RETURNING *`,values);if(!result.rowCount)throw versionConflict('El borrador cambió o no está disponible');await this.audit({actor,action:'COMMUNICATION_HANDED_OFF',entityType:'communication',entityId:id,changes:{channel:result.rows[0].channel},...requestMeta});return result.rows[0];}

  async listOrders({page=1,pageSize=25,status=null,paymentStatus=null}={},actor){const paging=pageValues(page,pageSize);const values=[ORGANIZATION_ID];const conditions=['r.organization_id=$1','r.deleted_at IS NULL'];if(actor.role==='ADVISOR'){values.push(actor.id);conditions.push(`o.owner_id=$${values.length}`);}if(status){values.push(status);conditions.push(`r.status=$${values.length}`);}if(paymentStatus){values.push(paymentStatus);conditions.push(`r.payment_status=$${values.length}`);}const where=conditions.join(' AND ');const total=await this.pool.query(`SELECT count(*)::int total FROM crm_orders r JOIN crm_opportunities o ON o.id=r.opportunity_id WHERE ${where}`,values);values.push(paging.pageSize,(paging.page-1)*paging.pageSize);const rows=await this.pool.query(`SELECT r.*,c.display_name contact_name,o.title opportunity_title,u.display_name owner_name,COALESCE(sum(p.amount),0)::numeric paid FROM crm_orders r JOIN crm_opportunities o ON o.id=r.opportunity_id JOIN crm_contacts c ON c.id=r.contact_id LEFT JOIN crm_users u ON u.id=o.owner_id LEFT JOIN crm_payments p ON p.order_id=r.id WHERE ${where} GROUP BY r.id,c.display_name,o.title,u.display_name ORDER BY r.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);return {items:rows.rows.map(row=>({...row,paid:Number(row.paid)})),total:total.rows[0].total,...paging};}
  async updateOrder(id,version,patch,actor,requestMeta={}){requireManager(actor);const allowed={status:'status',deliveryAt:'delivery_at',deliveryAddress:'delivery_address',notes:'notes'};const entries=Object.entries(patch??{}).filter(([key])=>allowed[key]);if(!entries.length)throw new Error('No hay cambios válidos');const values=[id,Number(version)];const sets=entries.map(([key,value])=>{values.push(clean(value));return `${allowed[key]}=$${values.length}`;});const result=await this.pool.query(`UPDATE crm_orders SET ${sets.join(',')},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL RETURNING *`,values);if(!result.rowCount)throw versionConflict('El pedido cambió en otra sesión');await this.audit({actor,action:'ORDER_UPDATED',entityType:'order',entityId:id,changes:patch,...requestMeta});return result.rows[0];}
  async addPayment(orderId,input,actor,requestMeta={}){requireManager(actor);const amount=Number(input.amount);if(!(amount>0))throw new Error('Importe de pago inválido');const client=await this.pool.connect();try{await client.query('BEGIN');const order=await client.query(`SELECT * FROM crm_orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,[orderId]);if(!order.rowCount)throw new Error('Pedido no encontrado');const payment=await client.query(`INSERT INTO crm_payments (organization_id,order_id,amount,method,reference,paid_at,created_by) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()),$7) RETURNING *`,[ORGANIZATION_ID,orderId,amount,input.method,clean(input.reference),clean(input.paidAt),actor.id]);const paid=await client.query(`SELECT COALESCE(sum(amount),0)::numeric paid FROM crm_payments WHERE order_id=$1`,[orderId]);const state=Number(paid.rows[0].paid)>=Number(order.rows[0].total)?'PAID':'PARTIAL';await client.query(`UPDATE crm_orders SET payment_status=$2,version=version+1,updated_at=now() WHERE id=$1`,[orderId,state]);await client.query(`INSERT INTO crm_audit_log (organization_id,actor_user_id,action,entity_type,entity_id,changes,ip_address,user_agent) VALUES ($1,$2,'PAYMENT_RECORDED','order',$3,$4,$5,$6)`,[ORGANIZATION_ID,actor.id,orderId,JSON.stringify({amount,method:input.method}),requestMeta.ipAddress??null,requestMeta.userAgent??null]);await client.query('COMMIT');return payment.rows[0];}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}

  async advancedReport(actor,{from=null,to=null}={}){const base=await this.report(actor,{from,to});const values=[ORGANIZATION_ID];let owner='';if(actor.role==='ADVISOR'){values.push(actor.id);owner=`AND o.owner_id=$${values.length}`;}const date=[];if(from){values.push(from);date.push(`o.created_at>=$${values.length}`);}if(to){values.push(to);date.push(`o.created_at<($${values.length}::date+interval '1 day')`);}const extra=[owner,...date.map(item=>`AND ${item}`)].join(' ');const [funnel,losses,cycle,quotes,revenue]=await Promise.all([
      this.pool.query(`SELECT s.name,s.position,count(o.id)::int total,count(o.id) FILTER (WHERE o.lifecycle_status='WON')::int won FROM crm_pipeline_stages s LEFT JOIN crm_opportunities o ON o.stage_id=s.id AND o.organization_id=$1 AND o.deleted_at IS NULL ${extra} WHERE s.pipeline_id='00000000-0000-4000-8000-000000000010' GROUP BY s.id ORDER BY s.position`,values),
      this.pool.query(`SELECT COALESCE(loss_reason,'Sin motivo') reason,count(*)::int total FROM crm_opportunities o WHERE o.organization_id=$1 AND o.lifecycle_status='LOST' AND o.deleted_at IS NULL ${extra} GROUP BY loss_reason ORDER BY total DESC LIMIT 10`,values),
      this.pool.query(`SELECT COALESCE(avg(EXTRACT(epoch FROM (COALESCE(won_at,updated_at)-created_at))/86400) FILTER (WHERE lifecycle_status='WON'),0)::numeric avg_days,COALESCE(avg(EXTRACT(epoch FROM (first_responded_at-created_at))/3600) FILTER (WHERE first_responded_at IS NOT NULL),0)::numeric response_hours FROM crm_opportunities o WHERE o.organization_id=$1 AND o.deleted_at IS NULL ${extra}`,values),
      this.pool.query(`SELECT count(*)::int total,count(*) FILTER (WHERE q.status='ACCEPTED')::int accepted,COALESCE(sum(q.total),0)::numeric quoted FROM crm_quotes q JOIN crm_opportunities o ON o.id=q.opportunity_id WHERE q.organization_id=$1 AND q.deleted_at IS NULL ${extra}`,values),
      this.pool.query(`SELECT COALESCE(sum(r.total),0)::numeric ordered,COALESCE(sum(r.paid),0)::numeric collected FROM (SELECT current_order.*,COALESCE((SELECT sum(amount) FROM crm_payments WHERE order_id=current_order.id),0)::numeric paid FROM crm_orders current_order) r JOIN crm_opportunities o ON o.id=r.opportunity_id WHERE r.organization_id=$1 AND r.deleted_at IS NULL ${extra}`,values),
    ]);return {...base,funnel:funnel.rows,lossReasons:losses.rows,cycle:{avgDays:Number(cycle.rows[0].avg_days),responseHours:Number(cycle.rows[0].response_hours)},quotes:{...quotes.rows[0],quoted:Number(quotes.rows[0].quoted)},revenue:{ordered:Number(revenue.rows[0].ordered),collected:Number(revenue.rows[0].collected)}};}
}
