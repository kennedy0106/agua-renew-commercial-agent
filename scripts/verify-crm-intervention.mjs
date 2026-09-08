import pg from 'pg';
import { loadEnvironment } from '../src/config/environment.mjs';
import { CrmInterventionRepository } from '../src/crm/crm-intervention-repository.mjs';

loadEnvironment();
const connectionString=process.env.DATABASE_URL_UNPOOLED??process.env.DATABASE_URL;
if(!connectionString)throw new Error('DATABASE_URL_UNPOOLED no está configurada');
const pool=new pg.Pool({connectionString,max:2});
const repository=new CrmInterventionRepository({pool});
try{
  await repository.ensureLeadMirror();
  const user=await pool.query("SELECT id,role FROM crm_users WHERE role='ADMIN' AND active=TRUE AND deleted_at IS NULL ORDER BY created_at LIMIT 1");
  if(!user.rowCount)throw new Error('No hay administrador activo para la verificación');
  const inbox=await repository.listInterventionInbox({pageSize:5},user.rows[0]);
  const counts=await pool.query(`SELECT
    (SELECT count(*)::int FROM leads) leads,
    (SELECT count(*)::int FROM crm_contacts) contacts,
    (SELECT count(*)::int FROM crm_opportunities) opportunities,
    count(*) FILTER (WHERE qualification_status='READY')::int ready,
    count(*) FILTER (WHERE qualification_status IN ('NEEDS_DATA','UNREVIEWED'))::int needs_data,
    count(*) FILTER (WHERE classification_source='AUTOMATION')::int automated
    FROM crm_opportunities`);
  if(counts.rows[0].contacts<837||counts.rows[0].opportunities<837)throw new Error('El espejo CRM perdió registros');
  if(counts.rows[0].leads!==counts.rows[0].contacts||counts.rows[0].leads!==counts.rows[0].opportunities)throw new Error('El espejo Meta → CRM no está completo');
  console.log(JSON.stringify({preserved:counts.rows[0],inbox:{total:inbox.total,shown:inbox.items.length,counts:inbox.counts,first:inbox.items[0]?{contact:inbox.items[0].contactName,status:inbox.items[0].qualificationStatus,missing:inbox.items[0].missingFields}:null}},null,2));
}finally{await pool.end();}
