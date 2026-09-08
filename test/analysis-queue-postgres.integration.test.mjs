import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { PostgresLeadRepository } from '../src/leads/postgres-lead-repository.mjs';
import { LeadProcessor } from '../src/meta/lead-processor.mjs';
import { runMigrations } from '../scripts/migrate.mjs';
import { enabled, connectionString } from './postgres-test-config.mjs';

test('PostgreSQL: mensaje y cobertura son atómicos, idempotentes y recuperables', {skip:!enabled}, async()=>{
  let inject=true; const repo=new PostgresLeadRepository({connectionString,faultInjector:()=>{if(inject)throw new Error('injected');}}); await repo.connect(); await runMigrations(repo.pool);
  const lead=await repo.createLead({sourceChannel:'instagram',sourceConversationId:`atomic-${Date.now()}`});
  try {
    await assert.rejects(()=>repo.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:'atomic-mid',content:'hola'}),/injected/);
    assert.equal((await repo.pool.query('SELECT count(*)::int n FROM lead_messages WHERE lead_id=$1',[lead.id])).rows[0].n,0);
    assert.equal((await repo.pool.query('SELECT count(*)::int n FROM lead_analysis_jobs WHERE lead_id=$1',[lead.id])).rows[0].n,0);
    inject=false; await repo.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:'atomic-mid',content:'hola'});
    const before=(await repo.pool.query('SELECT requested_version FROM lead_analysis_jobs WHERE lead_id=$1',[lead.id])).rows[0];
    await repo.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:'atomic-mid',content:'hola'});
    assert.equal((await repo.pool.query('SELECT count(*)::int n FROM lead_messages WHERE lead_id=$1',[lead.id])).rows[0].n,1);
    assert.equal((await repo.pool.query('SELECT requested_version FROM lead_analysis_jobs WHERE lead_id=$1',[lead.id])).rows[0].requested_version,before.requested_version);
    await repo.pool.query('DELETE FROM lead_analysis_jobs WHERE lead_id=$1',[lead.id]); await repo.pool.query('UPDATE lead_messages SET analysis_version=NULL WHERE lead_id=$1',[lead.id]);
    await repo.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:'atomic-mid',content:'hola'});
    assert.equal((await repo.pool.query('SELECT count(*)::int n FROM lead_analysis_jobs WHERE lead_id=$1',[lead.id])).rows[0].n,1);
  } finally {await repo.pool.query('DELETE FROM leads WHERE id=$1',[lead.id]);await repo.close();}
});

test('PostgreSQL: lease token impide que un worker antiguo aplique o libere una reserva nueva', {skip:!enabled}, async()=>{
  const repo=new PostgresLeadRepository({connectionString});await repo.connect();await runMigrations(repo.pool);const processor=new LeadProcessor({repository:repo});
  const lead=await repo.createLead({sourceChannel:'instagram',sourceConversationId:`lease-${Date.now()}`});
  try{
    await repo.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:'lease-1',content:'Quiero bidones de 20 L con mi marca'});
    const [old]=await repo.claimAnalysisJobs({limit:1,leaseMs:50});assert.ok(old.leaseToken);
    await repo.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:'lease-2',content:'Corrección: quiero botellas de 625 ml, 900111222'});
    assert.equal((await repo.claimAnalysisJobs({limit:1,leaseMs:60000})).length,0,'mensaje nuevo no libera lease activo');
    await repo.pool.query("UPDATE lead_analysis_jobs SET locked_at=now()-interval '1 minute' WHERE lead_id=$1",[lead.id]);
    const [fresh]=await repo.claimAnalysisJobs({limit:1,leaseMs:50});assert.notEqual(fresh.leaseToken,old.leaseToken);
    const stalePrepared=await processor.prepare(lead.id);assert.equal((await repo.applyAnalysisJobResult(old,stalePrepared)).reason,'lease_lost');
    assert.equal((await repo.pool.query('SELECT lease_token FROM lead_analysis_jobs WHERE lead_id=$1',[lead.id])).rows[0].lease_token,fresh.leaseToken);
    const currentPrepared=await processor.prepare(lead.id);assert.equal((await repo.applyAnalysisJobResult(fresh,currentPrepared)).applied,true);
    const saved=await repo.findLeadById(lead.id);assert.equal(saved.product,'625ml');assert.equal(saved.phoneE164,'+51900111222');
  }finally{await repo.pool.query('DELETE FROM leads WHERE id=$1',[lead.id]);await repo.close();}
});

test('PostgreSQL: un lote secuencial reserva solo la capacidad inmediata', {skip:!enabled}, async()=>{
  const repo=new PostgresLeadRepository({connectionString});await repo.connect();await runMigrations(repo.pool);const ids=[];
  try{for(let i=0;i<2;i++){const l=await repo.createLead({sourceChannel:'instagram',sourceConversationId:`batch-${Date.now()}-${i}`});ids.push(l.id);await repo.appendMessage({leadId:l.id,channel:'instagram',direction:'inbound',externalMessageId:`batch-mid-${i}`,content:'hola'});}assert.equal((await repo.claimAnalysisJobs({limit:1})).length,1);}
  finally{await repo.pool.query('DELETE FROM leads WHERE id=ANY($1::uuid[])',[ids]);await repo.close();}
});
