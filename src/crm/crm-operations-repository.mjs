import { ORGANIZATION_ID } from './crm-auth.mjs';
import { CrmRepository, PIPELINE_ID } from './crm-repository.mjs';
import { normalizePhone } from '../leads/phone-normalizer.mjs';

const CONTACT_FIELDS = ['displayName', 'email', 'phoneE164', 'secondaryPhoneE164', 'jobTitle', 'district', 'address', 'companyId', 'ownerId', 'consentStatus'];
const CONTACT_COLUMNS = {
  displayName: 'display_name', email: 'email', phoneE164: 'phone_e164', secondaryPhoneE164: 'secondary_phone_e164',
  jobTitle: 'job_title', district: 'district', address: 'address', companyId: 'company_id', ownerId: 'owner_id', consentStatus: 'consent_status',
};
const COMPANY_COLUMNS = { name: 'name', taxId: 'tax_id', phoneE164: 'phone_e164', email: 'email', district: 'district', address: 'address', notes: 'notes', ownerId: 'owner_id' };

function clean(value) { return value === undefined || value === null || value === '' ? null : String(value).trim(); }
function email(value) {
  const normalized = clean(value)?.toLowerCase() ?? null;
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Correo inválido');
  return normalized;
}
function phone(value) {
  if (!clean(value)) return null;
  const normalized = normalizePhone(value);
  if (!normalized) throw new Error('Teléfono peruano inválido');
  return normalized;
}
function taxId(value) {
  const normalized = clean(value);
  if (normalized && !/^\d{11}$/.test(normalized)) throw new Error('El RUC debe tener 11 dígitos');
  return normalized;
}
function normalizeName(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function bigrams(value) {
  const text = ` ${normalizeName(value)} `;
  const set = new Set();
  for (let index = 0; index < text.length - 1; index += 1) set.add(text.slice(index, index + 2));
  return set;
}
function similarity(left, right) {
  const a = bigrams(left); const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0; for (const token of a) if (b.has(token)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}
function publicContact(row) {
  return {
    id: row.id, sourceLeadId: row.source_lead_id, companyId: row.company_id, companyName: row.company_name,
    ownerId: row.owner_id, ownerName: row.owner_name, displayName: row.display_name, email: row.email,
    phoneE164: row.phone_e164, secondaryPhoneE164: row.secondary_phone_e164, jobTitle: row.job_title,
    district: row.district, address: row.address, sourceChannel: row.source_channel, consentStatus: row.consent_status,
    version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at, mergedIntoId: row.merged_into_id,
  };
}
function publicCompany(row) {
  return { id: row.id, name: row.name, taxId: row.tax_id, phoneE164: row.phone_e164, email: row.email, district: row.district, address: row.address, notes: row.notes, ownerId: row.owner_id, ownerName: row.owner_name, contacts: Number(row.contacts ?? 0), opportunities: Number(row.opportunities ?? 0), version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at };
}
function encodeCursor(row) { return Buffer.from(JSON.stringify([row.updated_at, row.id])).toString('base64url'); }
function decodeCursor(value) { try { return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8')); } catch { throw new Error('Cursor inválido'); } }

export class CrmOperationsRepository extends CrmRepository {
  async listContacts({ page = 1, pageSize = 25, q = '', companyId = null, ownerId = null }, actor) {
    const conditions = ['c.organization_id = $1', 'c.deleted_at IS NULL', 'c.merged_into_id IS NULL'];
    const values = [ORGANIZATION_ID];
    const add = (sql, value) => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };
    if (companyId) add('c.company_id = ?', companyId);
    if (ownerId && actor.role !== 'ADVISOR') add('c.owner_id = ?', ownerId);
    if (q) { values.push(`%${String(q).trim()}%`); conditions.push(`(c.display_name ILIKE $${values.length} OR c.email ILIKE $${values.length} OR c.phone_e164 ILIKE $${values.length} OR co.name ILIKE $${values.length})`); }
    if (actor.role === 'ADVISOR') { values.push(actor.id); const pos = values.length; conditions.push(`(c.owner_id = $${pos} OR EXISTS (SELECT 1 FROM crm_opportunities ao WHERE ao.contact_id=c.id AND ao.owner_id=$${pos} AND ao.deleted_at IS NULL))`); }
    const where = conditions.join(' AND '); const size = Math.min(100, Math.max(1, Number(pageSize) || 25)); const current = Math.max(1, Number(page) || 1);
    const total = await this.pool.query(`SELECT count(*)::int total FROM crm_contacts c LEFT JOIN crm_companies co ON co.id=c.company_id WHERE ${where}`, values);
    values.push(size, (current - 1) * size);
    const rows = await this.pool.query(`SELECT c.*, co.name company_name, u.display_name owner_name FROM crm_contacts c LEFT JOIN crm_companies co ON co.id=c.company_id LEFT JOIN crm_users u ON u.id=c.owner_id WHERE ${where} ORDER BY c.updated_at DESC, c.id LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { items: rows.rows.map(publicContact), total: total.rows[0].total, page: current, pageSize: size };
  }

  async findContact(id, actor) {
    const values = [id]; let restriction = '';
    if (actor.role === 'ADVISOR') { values.push(actor.id); restriction = `AND (c.owner_id=$2 OR EXISTS (SELECT 1 FROM crm_opportunities ao WHERE ao.contact_id=c.id AND ao.owner_id=$2 AND ao.deleted_at IS NULL))`; }
    const row = await this.pool.query(`SELECT c.*, co.name company_name, u.display_name owner_name FROM crm_contacts c LEFT JOIN crm_companies co ON co.id=c.company_id LEFT JOIN crm_users u ON u.id=c.owner_id WHERE c.id=$1 AND c.deleted_at IS NULL ${restriction}`, values);
    if (!row.rowCount) return null;
    const [methods, opportunities, tasks, activities] = await Promise.all([
      this.pool.query('SELECT id, method_type AS "methodType", value, is_primary AS "isPrimary" FROM crm_contact_methods WHERE contact_id=$1 ORDER BY is_primary DESC, created_at', [id]),
      this.pool.query(`SELECT o.id, o.title, o.lifecycle_status AS "lifecycleStatus", o.estimated_value AS "estimatedValue", o.updated_at AS "updatedAt", s.name AS "stageName", s.color AS "stageColor" FROM crm_opportunities o JOIN crm_pipeline_stages s ON s.id=o.stage_id WHERE o.contact_id=$1 AND o.deleted_at IS NULL ORDER BY o.updated_at DESC`, [id]),
      this.pool.query(`SELECT t.*, u.display_name assignee_name FROM crm_tasks t LEFT JOIN crm_users u ON u.id=t.assigned_to WHERE t.contact_id=$1 AND t.deleted_at IS NULL ORDER BY t.status, t.due_at NULLS LAST LIMIT 100`, [id]),
      this.pool.query(`SELECT a.*, u.display_name actor_name FROM crm_activities a LEFT JOIN crm_users u ON u.id=a.actor_user_id WHERE a.contact_id=$1 ORDER BY a.occurred_at DESC LIMIT 100`, [id]),
    ]);
    return { contact: publicContact(row.rows[0]), methods: methods.rows, opportunities: opportunities.rows, tasks: tasks.rows, activities: activities.rows };
  }

  async createContact(input, actor, requestMeta = {}) {
    const displayName = clean(input.displayName); if (!displayName) throw new Error('Nombre de contacto obligatorio');
    const ownerId = actor.role === 'ADVISOR' ? actor.id : (clean(input.ownerId) || actor.id);
    const companyId = actor.role === 'ADVISOR' ? null : clean(input.companyId);
    const values = [ORGANIZATION_ID, displayName, email(input.email), phone(input.phoneE164), phone(input.secondaryPhoneE164), clean(input.jobTitle), clean(input.district), clean(input.address), companyId, ownerId, input.consentStatus || 'UNKNOWN'];
    const result = await this.pool.query(`INSERT INTO crm_contacts (organization_id,display_name,email,phone_e164,secondary_phone_e164,job_title,district,address,company_id,owner_id,consent_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, values);
    await this.#syncMethods(this.pool, result.rows[0].id, values[3], values[2], values[4]);
    await this.audit({ actor, action: 'CONTACT_CREATED', entityType: 'contact', entityId: result.rows[0].id, changes: { displayName }, ...requestMeta });
    return this.findContact(result.rows[0].id, actor);
  }

  async updateContact(id, version, patch, actor, requestMeta = {}) {
    const existing = await this.findContact(id, actor); if (!existing) throw new Error('Contacto no encontrado');
    const entries = Object.entries(patch ?? {}).filter(([key]) => CONTACT_FIELDS.includes(key));
    if (!entries.length) throw new Error('No hay cambios válidos');
    if (actor.role === 'ADVISOR' && entries.some(([key]) => ['ownerId', 'companyId'].includes(key))) throw new Error('No autorizado');
    const values = [id, Number(version)];
    const sets = entries.map(([key, raw]) => {
      let value = clean(raw); if (key === 'email') value = email(raw); if (key.toLowerCase().includes('phone')) value = phone(raw);
      values.push(value); return `${CONTACT_COLUMNS[key]}=$${values.length}`;
    });
    const updated = await this.pool.query(`UPDATE crm_contacts SET ${sets.join(',')}, version=version+1, updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL RETURNING phone_e164,email,secondary_phone_e164`, values);
    if (!updated.rowCount) { const error = new Error('El contacto cambió en otra sesión'); error.code = 'VERSION_CONFLICT'; throw error; }
    await this.#syncMethods(this.pool, id, updated.rows[0].phone_e164, updated.rows[0].email, updated.rows[0].secondary_phone_e164);
    await this.audit({ actor, action: 'CONTACT_UPDATED', entityType: 'contact', entityId: id, changes: patch, ...requestMeta });
    return this.findContact(id, actor);
  }

  async listCompanies({ page = 1, pageSize = 25, q = '' }, actor) {
    const values = [ORGANIZATION_ID]; const conditions = ['co.organization_id=$1', 'co.deleted_at IS NULL'];
    if (q) { values.push(`%${String(q).trim()}%`); conditions.push(`(co.name ILIKE $${values.length} OR co.tax_id ILIKE $${values.length})`); }
    if (actor.role === 'ADVISOR') { values.push(actor.id); conditions.push(`EXISTS (SELECT 1 FROM crm_contacts ac WHERE ac.company_id=co.id AND ac.deleted_at IS NULL AND (ac.owner_id=$${values.length} OR EXISTS (SELECT 1 FROM crm_opportunities ao WHERE ao.contact_id=ac.id AND ao.owner_id=$${values.length} AND ao.deleted_at IS NULL)))`); }
    const where = conditions.join(' AND '); const size = Math.min(100, Math.max(1, Number(pageSize) || 25)); const current = Math.max(1, Number(page) || 1);
    const total = await this.pool.query(`SELECT count(*)::int total FROM crm_companies co WHERE ${where}`, values);
    values.push(size, (current - 1) * size);
    const rows = await this.pool.query(`SELECT co.*, u.display_name owner_name, count(DISTINCT c.id)::int contacts, count(DISTINCT o.id)::int opportunities FROM crm_companies co LEFT JOIN crm_users u ON u.id=co.owner_id LEFT JOIN crm_contacts c ON c.company_id=co.id AND c.deleted_at IS NULL LEFT JOIN crm_opportunities o ON o.contact_id=c.id AND o.deleted_at IS NULL WHERE ${where} GROUP BY co.id,u.display_name ORDER BY co.updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { items: rows.rows.map(publicCompany), total: total.rows[0].total, page: current, pageSize: size };
  }

  async findCompany(id, actor) {
    const values = [id]; let restriction = '';
    if (actor.role === 'ADVISOR') {
      values.push(actor.id);
      restriction = `AND EXISTS (SELECT 1 FROM crm_contacts ac WHERE ac.company_id=co.id AND ac.deleted_at IS NULL AND (ac.owner_id=$2 OR EXISTS (SELECT 1 FROM crm_opportunities ao WHERE ao.contact_id=ac.id AND ao.owner_id=$2 AND ao.deleted_at IS NULL)))`;
    }
    const result = await this.pool.query(`SELECT co.*,u.display_name owner_name, count(DISTINCT c.id)::int contacts, count(DISTINCT o.id)::int opportunities FROM crm_companies co LEFT JOIN crm_users u ON u.id=co.owner_id LEFT JOIN crm_contacts c ON c.company_id=co.id AND c.deleted_at IS NULL LEFT JOIN crm_opportunities o ON o.contact_id=c.id AND o.deleted_at IS NULL WHERE co.id=$1 AND co.deleted_at IS NULL ${restriction} GROUP BY co.id,u.display_name`, values);
    if (!result.rowCount) return null;
    const company = publicCompany(result.rows[0]);
    const contacts = await this.pool.query(`SELECT c.*,u.display_name owner_name FROM crm_contacts c LEFT JOIN crm_users u ON u.id=c.owner_id WHERE c.company_id=$1 AND c.deleted_at IS NULL ${actor.role === 'ADVISOR' ? 'AND (c.owner_id=$2 OR EXISTS (SELECT 1 FROM crm_opportunities ao WHERE ao.contact_id=c.id AND ao.owner_id=$2 AND ao.deleted_at IS NULL))' : ''} ORDER BY c.display_name`, values);
    return { company, contacts: contacts.rows.map(publicContact) };
  }

  async createCompany(input, actor, requestMeta = {}) {
    if (actor.role === 'ADVISOR') throw new Error('No autorizado'); const name = clean(input.name); if (!name) throw new Error('Nombre de empresa obligatorio');
    const result = await this.pool.query(`INSERT INTO crm_companies (organization_id,name,tax_id,phone_e164,email,district,address,notes,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [ORGANIZATION_ID,name,taxId(input.taxId),phone(input.phoneE164),email(input.email),clean(input.district),clean(input.address),clean(input.notes),clean(input.ownerId)||actor.id]);
    await this.audit({ actor, action: 'COMPANY_CREATED', entityType: 'company', entityId: result.rows[0].id, changes: { name }, ...requestMeta });
    return this.findCompany(result.rows[0].id, actor);
  }

  async updateCompany(id, version, patch, actor, requestMeta = {}) {
    if (actor.role === 'ADVISOR') throw new Error('No autorizado'); const entries = Object.entries(patch ?? {}).filter(([key]) => COMPANY_COLUMNS[key]); if (!entries.length) throw new Error('No hay cambios válidos');
    const values = [id, Number(version)]; const sets = entries.map(([key, raw]) => { let value=clean(raw); if(key==='taxId') value=taxId(raw); if(key==='email') value=email(raw); if(key==='phoneE164') value=phone(raw); values.push(value); return `${COMPANY_COLUMNS[key]}=$${values.length}`; });
    const result = await this.pool.query(`UPDATE crm_companies SET ${sets.join(',')},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL RETURNING id`, values);
    if (!result.rowCount) { const error=new Error('La empresa cambió en otra sesión'); error.code='VERSION_CONFLICT'; throw error; }
    await this.audit({ actor, action:'COMPANY_UPDATED',entityType:'company',entityId:id,changes:patch,...requestMeta }); return this.findCompany(id,actor);
  }

  async duplicateCandidates(id, actor) {
    if (actor.role === 'ADVISOR') throw new Error('No autorizado'); const current = await this.findContact(id, actor); if (!current) throw new Error('Contacto no encontrado');
    const result = await this.pool.query(`SELECT c.*,co.name company_name,u.display_name owner_name FROM crm_contacts c LEFT JOIN crm_companies co ON co.id=c.company_id LEFT JOIN crm_users u ON u.id=c.owner_id WHERE c.organization_id=$1 AND c.id<>$2 AND c.deleted_at IS NULL AND c.merged_into_id IS NULL LIMIT 1500`, [ORGANIZATION_ID,id]);
    return result.rows.map((row) => {
      const reasons=[]; let score=similarity(current.contact.displayName,row.display_name);
      if (current.contact.phoneE164 && current.contact.phoneE164===row.phone_e164) { reasons.push('Mismo teléfono'); score=1; }
      if (current.contact.email && current.contact.email===row.email) { reasons.push('Mismo correo'); score=1; }
      if (score>=0.88) reasons.push(`Nombre similar (${Math.round(score*100)}%)`);
      return { contact:publicContact(row),score,reasons };
    }).filter((item)=>item.reasons.length && item.score>=0.88).sort((a,b)=>b.score-a.score).slice(0,20);
  }

  async mergePreview({ targetId, sourceIds }, actor) {
    if (!['ADMIN','SUPERVISOR'].includes(actor.role)) throw new Error('No autorizado'); const ids=[targetId,...new Set(sourceIds ?? [])].filter(Boolean); if(ids.length<2) throw new Error('Seleccione contactos para fusionar');
    const rows=await this.pool.query(`SELECT * FROM crm_contacts WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND merged_into_id IS NULL`,[ORGANIZATION_ID,ids]); if(rows.rowCount!==ids.length) throw new Error('Uno de los contactos no está disponible');
    const map=new Map(rows.rows.map((row)=>[row.id,row])); const target=map.get(targetId); const sources=ids.slice(1).map((id)=>map.get(id));
    const conflicts={}; for(const [key,column] of Object.entries(CONTACT_COLUMNS)){ const values=[target,...sources].map((row)=>row[column]).filter((value)=>value!==null&&value!==''); if(new Set(values.map(String)).size>1) conflicts[key]=[...new Set(values.map(String))]; }
    return { target:publicContact(target),sources:sources.map(publicContact),versions:Object.fromEntries(rows.rows.map((row)=>[row.id,Number(row.version)])),conflicts };
  }

  async mergeContacts({ targetId, sourceIds, versions, resolution = {} }, actor, requestMeta = {}) {
    if (!['ADMIN','SUPERVISOR'].includes(actor.role)) throw new Error('No autorizado'); const ids=[targetId,...new Set(sourceIds ?? [])].filter(Boolean); if(ids.length<2) throw new Error('Seleccione contactos para fusionar');
    const client=await this.pool.connect(); try { await client.query('BEGIN');
      const locked=await client.query(`SELECT * FROM crm_contacts WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND merged_into_id IS NULL ORDER BY id FOR UPDATE`,[ORGANIZATION_ID,ids]); if(locked.rowCount!==ids.length) throw new Error('Uno de los contactos no está disponible');
      for(const row of locked.rows){ if(Number(versions?.[row.id])!==Number(row.version)){ const error=new Error('Los contactos cambiaron después de la vista previa'); error.code='VERSION_CONFLICT'; throw error; } }
      let target=locked.rows.find((row)=>row.id===targetId); const sources=locked.rows.filter((row)=>row.id!==targetId); const moved={opportunities:0,tasks:0,notes:0,activities:0,methods:0};
      for(const source of sources){
        const snapshot={target,source};
        for(const [table,key] of [['crm_opportunities','opportunities'],['crm_tasks','tasks'],['crm_notes','notes'],['crm_activities','activities']]){ const result=await client.query(`UPDATE ${table} SET contact_id=$1 WHERE contact_id=$2`,[targetId,source.id]); moved[key]+=result.rowCount; }
        const methods=await client.query(`INSERT INTO crm_contact_methods (organization_id,contact_id,method_type,value,normalized_value,is_primary) SELECT organization_id,$1,method_type,value,normalized_value,FALSE FROM crm_contact_methods WHERE contact_id=$2 ON CONFLICT DO NOTHING`,[targetId,source.id]); moved.methods+=methods.rowCount;
        const updates={}; for(const [key,column] of Object.entries(CONTACT_COLUMNS)){ if(key==='ownerId'||key==='consentStatus'||key==='displayName'||key==='companyId'||key==='email'||key==='phoneE164'||key==='secondaryPhoneE164'||key==='jobTitle'||key==='district'||key==='address'){ const chosen=resolution[key]; let value=chosen!==undefined?clean(chosen):(target[column]||source[column]||null); if(key==='email') value=email(value); if(key.toLowerCase().includes('phone')) value=phone(value); updates[column]=value; } }
        const updateValues=[targetId,...Object.values(updates)]; const set=Object.keys(updates).map((column,index)=>`${column}=$${index+2}`).join(','); const updated=await client.query(`UPDATE crm_contacts SET ${set},version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,updateValues); target=updated.rows[0];
        await client.query(`UPDATE crm_contacts SET merged_into_id=$1,merged_at=now(),merged_by=$3,deleted_at=now(),version=version+1,updated_at=now() WHERE id=$2`,[targetId,source.id,actor.id]);
        await client.query(`INSERT INTO crm_contact_merges (organization_id,target_contact_id,source_contact_id,actor_user_id,target_version,source_version,snapshot,moved_counts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[ORGANIZATION_ID,targetId,source.id,actor.id,versions[targetId],versions[source.id],JSON.stringify(snapshot),JSON.stringify(moved)]);
      }
      await client.query(`INSERT INTO crm_audit_log (organization_id,actor_user_id,action,entity_type,entity_id,changes,ip_address,user_agent) VALUES ($1,$2,'CONTACTS_MERGED','contact',$3,$4,$5,$6)`,[ORGANIZATION_ID,actor.id,targetId,JSON.stringify({sourceIds,moved}),requestMeta.ipAddress??null,requestMeta.userAgent??null]);
      await this.#syncMethods(client,targetId,target.phone_e164,target.email,target.secondary_phone_e164);
      await client.query('COMMIT'); return this.findContact(targetId,actor);
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }

  async listTasks({ page=1,pageSize=50,assignedTo=null,status='OPEN',priority=null,bucket=null,q='' },actor){
    const conditions=['t.organization_id=$1','t.deleted_at IS NULL']; const values=[ORGANIZATION_ID]; const add=(sql,value)=>{values.push(value);conditions.push(sql.replace('?',`$${values.length}`));};
    if(actor.role==='ADVISOR') add('t.assigned_to=?',actor.id); else if(assignedTo) add('t.assigned_to=?',assignedTo); if(status&&status!=='ALL') add('t.status=?',status); if(priority) add('t.priority=?',priority); if(q){values.push(`%${String(q).trim()}%`);conditions.push(`(t.title ILIKE $${values.length} OR t.description ILIKE $${values.length} OR c.display_name ILIKE $${values.length})`);}
    if(bucket==='OVERDUE') conditions.push(`t.status='OPEN' AND t.due_at<now()`); if(bucket==='TODAY') conditions.push(`t.status='OPEN' AND t.due_at>=date_trunc('day',now()) AND t.due_at<date_trunc('day',now())+interval '1 day'`); if(bucket==='UPCOMING') conditions.push(`t.status='OPEN' AND t.due_at>=date_trunc('day',now())+interval '1 day'`); if(bucket==='NO_DUE') conditions.push(`t.status='OPEN' AND t.due_at IS NULL`);
    const where=conditions.join(' AND '); const size=Math.min(100,Math.max(1,Number(pageSize)||50)); const current=Math.max(1,Number(page)||1); const total=await this.pool.query(`SELECT count(*)::int total FROM crm_tasks t LEFT JOIN crm_contacts c ON c.id=t.contact_id WHERE ${where}`,values);
    const bucketValues=actor.role==='ADVISOR'?[ORGANIZATION_ID,actor.id]:[ORGANIZATION_ID]; const ownerSql=actor.role==='ADVISOR'?'AND assigned_to=$2':'';
    const counts=await this.pool.query(`SELECT count(*) FILTER (WHERE status='OPEN' AND due_at<now())::int overdue,count(*) FILTER (WHERE status='OPEN' AND due_at>=date_trunc('day',now()) AND due_at<date_trunc('day',now())+interval '1 day')::int today,count(*) FILTER (WHERE status='OPEN' AND due_at>=date_trunc('day',now())+interval '1 day')::int upcoming,count(*) FILTER (WHERE status='OPEN' AND due_at IS NULL)::int no_due FROM crm_tasks WHERE organization_id=$1 AND deleted_at IS NULL ${ownerSql}`,bucketValues);
    values.push(size,(current-1)*size); const rows=await this.pool.query(`SELECT t.*,c.display_name contact_name,o.title opportunity_title,u.display_name assignee_name FROM crm_tasks t LEFT JOIN crm_contacts c ON c.id=t.contact_id LEFT JOIN crm_opportunities o ON o.id=t.opportunity_id LEFT JOIN crm_users u ON u.id=t.assigned_to WHERE ${where} ORDER BY t.due_at NULLS LAST,t.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
    return {items:rows.rows,total:total.rows[0].total,page:current,pageSize:size,buckets:{...counts.rows[0],noDue:counts.rows[0].no_due}};
  }

  async updateTask(id, version, patch, actor, requestMeta = {}) {
    const allowed = { title:'title', description:'description', dueAt:'due_at', priority:'priority', assignedTo:'assigned_to', status:'status' };
    const entries = Object.entries(patch ?? {}).filter(([key]) => allowed[key]);
    if (!entries.length) throw new Error('No hay cambios válidos');
    if (actor.role === 'ADVISOR' && entries.some(([key]) => key === 'assignedTo')) throw new Error('No autorizado');
    const values = [id, Number(version)];
    const sets = entries.map(([key, raw]) => {
      const value = clean(raw);
      if (key === 'title' && !value) throw new Error('Título de tarea obligatorio');
      if (key === 'priority' && value && !['LOW','MEDIUM','HIGH','URGENT'].includes(value)) throw new Error('Prioridad inválida');
      if (key === 'status' && value && !['OPEN','DONE'].includes(value)) throw new Error('Estado de tarea inválido');
      if (key === 'dueAt' && value && Number.isNaN(Date.parse(value))) throw new Error('Fecha de vencimiento inválida');
      values.push(value); return `${allowed[key]}=$${values.length}`;
    });
    let restriction = '';
    if (actor.role === 'ADVISOR') { values.push(actor.id); restriction = `AND assigned_to=$${values.length}`; }
    let result = await this.pool.query(`UPDATE crm_tasks SET ${sets.join(',')},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL ${restriction} RETURNING *`, values);
    if (!result.rowCount) { const error = new Error('La tarea cambió o no está disponible'); error.code = 'VERSION_CONFLICT'; throw error; }
    if (patch.status) result = await this.pool.query(`UPDATE crm_tasks SET completed_at=CASE WHEN status='DONE' THEN COALESCE(completed_at,now()) ELSE NULL END WHERE id=$1 RETURNING *`, [id]);
    if (result.rows[0].status === 'DONE') await this.pool.query("UPDATE crm_notifications SET read_at=COALESCE(read_at,now()) WHERE entity_type='task' AND entity_id=$1 AND read_at IS NULL", [id]);
    if (patch.assignedTo) {
      await this.pool.query("UPDATE crm_notifications SET read_at=COALESCE(read_at,now()) WHERE entity_type='task' AND entity_id=$1 AND user_id<>$2 AND read_at IS NULL", [id,patch.assignedTo]);
      await this.pool.query("INSERT INTO crm_notifications (user_id,notification_type,title,body,entity_type,entity_id) SELECT $1,'TASK_ASSIGNED','Tarea reasignada',$2,'task',$3 WHERE NOT EXISTS (SELECT 1 FROM crm_notifications WHERE user_id=$1 AND entity_type='task' AND entity_id=$3 AND read_at IS NULL)", [patch.assignedTo,result.rows[0].title,id]);
    }
    await this.audit({actor,action:'TASK_UPDATED',entityType:'task',entityId:id,changes:patch,...requestMeta});
    return result.rows[0];
  }
  async deleteTask(id,version,actor,requestMeta={}){let values=[id,Number(version)];let restriction='';if(actor.role==='ADVISOR'){values.push(actor.id);restriction='AND assigned_to=$3';}const result=await this.pool.query(`UPDATE crm_tasks SET deleted_at=now(),version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL ${restriction} RETURNING id`,values);if(!result.rowCount){const error=new Error('La tarea cambió o no está disponible');error.code='VERSION_CONFLICT';throw error;}await this.pool.query("UPDATE crm_notifications SET read_at=COALESCE(read_at,now()) WHERE entity_type='task' AND entity_id=$1 AND read_at IS NULL",[id]);await this.audit({actor,action:'TASK_DELETED',entityType:'task',entityId:id,changes:{},...requestMeta});return {deleted:true};}

  async listStageOpportunities(stageKey,{cursor=null,limit=20,q='',ownerId=null},actor){ const values=[PIPELINE_ID,stageKey,ORGANIZATION_ID,stageKey==='WON'?'WON':stageKey==='LOST'?'LOST':'OPEN'];const conditions=['s.pipeline_id=$1','s.stage_key=$2','o.organization_id=$3','o.deleted_at IS NULL','o.lifecycle_status=$4'];if(actor.role==='ADVISOR'){values.push(actor.id);conditions.push(`o.owner_id=$${values.length}`);}else if(ownerId){values.push(ownerId);conditions.push(`o.owner_id=$${values.length}`);}if(q){values.push(`%${String(q).trim()}%`);conditions.push(`(c.display_name ILIKE $${values.length} OR o.title ILIKE $${values.length} OR c.phone_e164 ILIKE $${values.length})`);}if(cursor){const [updatedAt,id]=decodeCursor(cursor);values.push(updatedAt,id);conditions.push(`(o.updated_at,o.id)<($${values.length-1}::timestamptz,$${values.length}::uuid)`);}const where=conditions.join(' AND ');const countValues=values.slice(0,cursor?values.length-2:values.length);const countWhere=conditions.filter((condition)=>!condition.startsWith('(o.updated_at')).join(' AND ');const total=await this.pool.query(`SELECT count(*)::int total FROM crm_opportunities o JOIN crm_pipeline_stages s ON s.id=o.stage_id JOIN crm_contacts c ON c.id=o.contact_id WHERE ${countWhere}`,countValues);const size=Math.min(50,Math.max(1,Number(limit)||20));values.push(size+1);const rows=await this.pool.query(`SELECT o.id,o.title,o.product,o.modality,o.estimated_value AS "estimatedValue",o.version,o.updated_at,c.display_name AS "contactName",c.phone_e164 AS "phoneE164",u.display_name AS "ownerName",s.stage_key AS "stageKey",s.name AS "stageName",s.color AS "stageColor" FROM crm_opportunities o JOIN crm_pipeline_stages s ON s.id=o.stage_id JOIN crm_contacts c ON c.id=o.contact_id LEFT JOIN crm_users u ON u.id=o.owner_id WHERE ${where} ORDER BY o.updated_at DESC,o.id DESC LIMIT $${values.length}`,values);const hasMore=rows.rows.length>size;const items=rows.rows.slice(0,size);return {items,total:total.rows[0].total,nextCursor:hasMore?encodeCursor(items.at(-1)):null}; }

  async #syncMethods(client,contactId,primaryPhone,primaryEmail,secondaryPhone){
    await client.query(`UPDATE crm_contact_methods SET is_primary=FALSE WHERE contact_id=$1 AND method_type IN ('PHONE','EMAIL')`,[contactId]);
    const methods=[primaryPhone?['PHONE',primaryPhone,primaryPhone,true]:null,secondaryPhone?['PHONE',secondaryPhone,secondaryPhone,false]:null,primaryEmail?['EMAIL',primaryEmail,primaryEmail.toLowerCase(),true]:null].filter(Boolean);
    for(const [type,value,normalized,isPrimary] of methods)await client.query(`INSERT INTO crm_contact_methods (organization_id,contact_id,method_type,value,normalized_value,is_primary) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (contact_id,method_type,normalized_value) DO UPDATE SET value=EXCLUDED.value,is_primary=EXCLUDED.is_primary`,[ORGANIZATION_ID,contactId,type,value,normalized,isPrimary]);
  }
}
