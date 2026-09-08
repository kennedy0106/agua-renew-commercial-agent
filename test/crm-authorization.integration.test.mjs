import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runMigrations } from '../scripts/migrate.mjs';
import { CrmInterventionRepository } from '../src/crm/crm-intervention-repository.mjs';
import { enabled, connectionString } from './postgres-test-config.mjs';

const ORG='00000000-0000-4000-8000-000000000001', PIPE='00000000-0000-4000-8000-000000000010', STAGE='00000000-0000-4000-8000-000000000102';
test('PostgreSQL: autorización y versión de calificación son atómicas', {skip:!enabled}, async()=>{
  const pool=new pg.Pool({connectionString,max:5}); await runMigrations(pool); const repo=new CrmInterventionRepository({pool});
  const suffix=String(Date.now());
  const users={a:'10000000-0000-4000-8000-000000000001',b:'10000000-0000-4000-8000-000000000002',admin:'10000000-0000-4000-8000-000000000003',supervisor:'10000000-0000-4000-8000-000000000004'};
  const actors={a:{id:users.a,role:'ADVISOR'},b:{id:users.b,role:'ADVISOR'},admin:{id:users.admin,role:'ADMIN'},supervisor:{id:users.supervisor,role:'SUPERVISOR'}};
  try {
    for(const [name,id] of Object.entries(users)) await pool.query(`INSERT INTO crm_users(id,organization_id,email,display_name,password_hash,role) VALUES($1,$2,$3,$4,'x',$5)`,[id,ORG,`${name}-${suffix}@test.local`,name,name==='admin'?'ADMIN':name==='supervisor'?'SUPERVISOR':'ADVISOR']);
    const contact=(await pool.query(`INSERT INTO crm_contacts(organization_id,display_name,phone_e164) VALUES($1,'Fixture','+51955623069') RETURNING id`,[ORG])).rows[0].id;
    const make=async(owner)=> (await pool.query(`INSERT INTO crm_opportunities(organization_id,contact_id,pipeline_id,stage_id,owner_id,title,qualification_status,intent_level,data_quality) VALUES($1,$2,$3,$4,$5,'Fixture','NEEDS_DATA','EXPLORING','PARTIAL') RETURNING id,version`,[ORG,contact,PIPE,STAGE,owner])).rows[0];
    const input={qualificationStatus:'READY',intentLevel:'INTERESTED',dataQuality:'COMPLETE',product:'20l',modality:'maquila',priorityScore:50};
    const foreign=await make(users.b); await assert.rejects(()=>repo.qualifyOpportunity(foreign.id,foreign.version,input,actors.a),/No autorizado/); assert.equal((await pool.query('SELECT version FROM crm_opportunities WHERE id=$1',[foreign.id])).rows[0].version,1);
    const own=await make(users.a); await repo.qualifyOpportunity(own.id,own.version,input,actors.a); assert.equal((await pool.query('SELECT version FROM crm_opportunities WHERE id=$1',[own.id])).rows[0].version,2);
    const free=await make(null); await assert.rejects(()=>repo.qualifyOpportunity(free.id,free.version,input,actors.a),/debe asumir/);
    const elevated=await make(users.b); await repo.qualifyOpportunity(elevated.id,elevated.version,input,actors.supervisor);
    const stale=await make(users.a); await pool.query('UPDATE crm_opportunities SET version=2 WHERE id=$1',[stale.id]); await assert.rejects(()=>repo.qualifyOpportunity(stale.id,1,input,actors.a),e=>e.code==='VERSION_CONFLICT');
    const raced=await make(users.a); const locker=await pool.connect(); await locker.query('BEGIN'); await locker.query('SELECT id FROM crm_opportunities WHERE id=$1 FOR UPDATE',[raced.id]);
    const pending=repo.qualifyOpportunity(raced.id,raced.version,input,actors.a); await locker.query('UPDATE crm_opportunities SET owner_id=$2 WHERE id=$1',[raced.id,users.b]); await locker.query('COMMIT'); locker.release();
    await assert.rejects(()=>pending,/No autorizado/); assert.equal((await pool.query('SELECT version FROM crm_opportunities WHERE id=$1',[raced.id])).rows[0].version,1);
  } finally { await pool.query("DELETE FROM crm_opportunities WHERE title='Fixture'"); await pool.query("DELETE FROM crm_contacts WHERE display_name='Fixture'"); await pool.query("DELETE FROM crm_users WHERE email LIKE '%@test.local'"); await pool.end(); }
});
