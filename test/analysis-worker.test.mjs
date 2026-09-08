import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLeadRepository } from '../src/leads/in-memory-lead-repository.mjs';
import { AnalysisWorker } from '../src/meta/analysis-worker.mjs';

async function pending(repository,id='m1') { const lead=await repository.createLead({sourceChannel:'instagram',sourceConversationId:id}); await repository.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:id,content:'hola'}); return lead; }

test('worker recupera trabajo persistido y dos workers no lo procesan dos veces', async()=>{
  const repository=new InMemoryLeadRepository(); const lead=await pending(repository); let calls=0;
  const processor={process:async()=>{calls+=1;}}; const a=new AnalysisWorker({repository,processor}); const b=new AnalysisWorker({repository,processor});
  await Promise.all([a.runOnce(),b.runOnce()]); assert.equal(calls,1);
  const job=repository.analysisJobs.get(lead.id); assert.equal(job.completedVersion,1);
});

test('mensaje nuevo durante análisis conserva una versión pendiente posterior', async()=>{
  const repository=new InMemoryLeadRepository(); const lead=await pending(repository); let release; const gate=new Promise(r=>{release=r;});
  const worker=new AnalysisWorker({repository,processor:{process:()=>gate}}); const running=worker.runOnce();
  await new Promise(r=>setImmediate(r)); await repository.appendMessage({leadId:lead.id,channel:'instagram',direction:'inbound',externalMessageId:'m2',content:'nuevo'});
  release(); await running; assert.equal(repository.analysisJobs.get(lead.id).requestedVersion,2); assert.equal(repository.analysisJobs.get(lead.id).completedVersion,1);
  assert.equal((await worker.runOnce()).claimed,1);
});

test('fallo temporal reintenta con límite y termina visible sin bucle', async()=>{
  let now=new Date('2026-01-01'); const repository=new InMemoryLeadRepository(); const lead=await pending(repository);
  const worker=new AnalysisWorker({repository,processor:{process:async()=>{throw new Error('temporal');}},maxAttempts:2,clock:()=>now});
  await worker.runOnce(); now=new Date(now.getTime()+6000); await worker.runOnce(); assert.equal(repository.analysisJobs.get(lead.id).status,'EXHAUSTED');
});
