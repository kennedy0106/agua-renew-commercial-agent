import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PostgresLeadRepository } from '../src/leads/postgres-lead-repository.mjs';
import { CrmInterventionRepository } from '../src/crm/crm-intervention-repository.mjs';
import { runMigrations } from '../scripts/migrate.mjs';
import { enabled, connectionString } from './postgres-test-config.mjs';

test('PostgreSQL: confirmaciones humanas sobreviven al espejo y conflictos no se duplican', {skip:!enabled},async()=>{
  const leads=new PostgresLeadRepository({connectionString});await leads.connect();await runMigrations(leads.pool);const crm=new CrmInterventionRepository({pool:leads.pool});const actor={id:randomUUID(),role:'ADMIN'};
  const stamp=Date.now();
  try{
    await leads.pool.query(`INSERT INTO crm_users(id,organization_id,email,display_name,password_hash,role) VALUES($1,'00000000-0000-4000-8000-000000000001',$2,'Auditor','x','ADMIN')`,[actor.id,`audit-${stamp}@test.local`]);
    const lead=await leads.createLead({sourceChannel:'instagram',sourceConversationId:`prov-${stamp}`,metaUsername:'Nombre automático'});await leads.updateLead(lead.id,{phoneE164:'+51911111111',product:'20l',modality:'distribution_agua_renew',conversationType:'commercial_lead',status:'READY_FOR_WHATSAPP'});await crm.ensureLeadMirror();
    let opp=(await leads.pool.query('SELECT * FROM crm_opportunities WHERE source_lead_id=$1',[lead.id])).rows[0];
    await crm.qualifyOpportunity(opp.id,opp.version,{qualificationStatus:'READY',intentLevel:'INTERESTED',dataQuality:'COMPLETE',product:'625ml',modality:'maquila'},actor);
    let contact=(await leads.pool.query('SELECT * FROM crm_contacts WHERE source_lead_id=$1',[lead.id])).rows[0];
    await crm.updateContact(contact.id,contact.version,{displayName:'Nombre humano',phoneE164:'+51922222222'},actor);
    await crm.ensureLeadMirror();await crm.ensureLeadMirror();
    opp=(await leads.pool.query('SELECT * FROM crm_opportunities WHERE source_lead_id=$1',[lead.id])).rows[0];contact=(await leads.pool.query('SELECT * FROM crm_contacts WHERE source_lead_id=$1',[lead.id])).rows[0];
    assert.equal(opp.product,'625ml');assert.equal(opp.modality,'maquila');assert.equal(contact.display_name,'Nombre humano');assert.equal(contact.phone_e164,'+51922222222');
    assert.equal(opp.field_provenance.product.source,'HUMAN');assert.equal(opp.field_provenance.modality.actorId,actor.id);
    const conflicts=(await leads.pool.query("SELECT field_name,count(*)::int n FROM crm_data_conflicts WHERE entity_id=ANY($1::uuid[]) GROUP BY field_name",[[opp.id,contact.id]])).rows;
    assert.ok(conflicts.every(row=>row.n===1));assert.deepEqual(new Set(conflicts.map(row=>row.field_name)),new Set(['product','modality','phoneE164']));
    const auto=await leads.createLead({sourceChannel:'instagram',sourceConversationId:`auto-${stamp}`});await leads.updateLead(auto.id,{product:'20l',modality:'maquila'});await crm.ensureLeadMirror();await leads.updateLead(auto.id,{product:'625ml',modality:null});await crm.ensureLeadMirror();
    const autoOpp=(await leads.pool.query('SELECT product,modality FROM crm_opportunities WHERE source_lead_id=$1',[auto.id])).rows[0];assert.equal(autoOpp.product,'625ml');assert.equal(autoOpp.modality,'maquila');
  }finally{await leads.pool.query("DELETE FROM leads WHERE source_conversation_id LIKE $1",[`%-${stamp}`]);await leads.pool.query('DELETE FROM crm_users WHERE id=$1',[actor.id]);await leads.close();}
});

test('PostgreSQL: migración 023 preserva evidencia humana legacy sin inventar actor', {skip:!enabled},async()=>{
  const leads=new PostgresLeadRepository({connectionString});await leads.connect();await runMigrations(leads.pool);const stamp=Date.now();
  try{
    const lead=await leads.createLead({sourceChannel:'instagram',sourceConversationId:`legacy-${stamp}`});await leads.updateLead(lead.id,{product:'20l',modality:'maquila'});
    const contact=(await leads.pool.query(`INSERT INTO crm_contacts(organization_id,source_lead_id,display_name) VALUES('00000000-0000-4000-8000-000000000001',$1,'Legacy') RETURNING id`,[lead.id])).rows[0];
    const opp=(await leads.pool.query(`INSERT INTO crm_opportunities(organization_id,source_lead_id,contact_id,pipeline_id,stage_id,title,product,modality,classification_source)
      VALUES('00000000-0000-4000-8000-000000000001',$1,$2,'00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000102','Legacy','625ml','distribution_agua_renew','HUMAN') RETURNING id`,[lead.id,contact.id])).rows[0];
    await leads.pool.query("UPDATE crm_opportunities SET field_provenance='{}'::jsonb WHERE id=$1",[opp.id]);
    await leads.pool.query(await readFile(new URL('../database/migrations/023_analysis_lease_and_coverage.sql',import.meta.url),'utf8'));
    const saved=(await leads.pool.query('SELECT product,modality,field_provenance FROM crm_opportunities WHERE id=$1',[opp.id])).rows[0];
    assert.equal(saved.product,'625ml');assert.equal(saved.field_provenance.product.source,'LEGACY_HUMAN_EVIDENCE');assert.equal('actorId' in saved.field_provenance.product,false);
  }finally{await leads.pool.query("DELETE FROM crm_opportunities WHERE title='Legacy'");await leads.pool.query("DELETE FROM crm_contacts WHERE display_name='Legacy'");await leads.pool.query('DELETE FROM leads WHERE source_conversation_id=$1',[`legacy-${stamp}`]);await leads.close();}
});
