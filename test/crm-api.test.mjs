import test from 'node:test';
import assert from 'node:assert/strict';

import { CrmApi } from '../src/crm/crm-api.mjs';
import { CommercialService } from '../src/commercial/commercial-service.mjs';

const admin = { id: '00000000-0000-4000-8000-000000000901', role: 'ADMIN' };
const advisor = { id: '00000000-0000-4000-8000-000000000902', role: 'ADVISOR' };

function fakeRepository() {
  return {
    listUsers: async () => [{ id: admin.id, role: 'ADMIN' }],
    createUser: async (data) => ({ id: 'new-user', ...data }),
    listStages: async () => [],
    listNotifications: async () => [],
    dashboard: async (_actor, options) => ({ open: 0, period: options }),
    globalSearch: async ({ q, limit }, actor) => ({ items: [], q, limit, actor }),
    createQuote: async (data) => ({ id: 'quote-1', ...data }),
    listContacts: async () => ({ items: [], total: 0 }),
    listCompanies: async () => ({ items: [], total: 0 }),
    listTasks: async () => ({ items: [], total: 0 }),
    listStageOpportunities: async () => ({ items: [], total: 0, nextCursor: null }),
    listProducts: async () => ({ items: [], total: 0 }),
    listQuotes: async () => ({ items: [], total: 0 }),
    listCalendar: async () => ({ events: [], tasks: [] }),
    listAutomationRules: async () => ({ items: [], total: 0 }),
    listTemplates: async () => ({ items: [], total: 0 }),
    listCommunications: async () => ({ items: [], total: 0 }),
    listOrders: async () => ({ items: [], total: 0 }),
    advancedReport: async () => ({ byStage: [], byOwner: [], byChannel: [], sla: {}, quotes: {}, revenue: {}, cycle: {} }),
    listInterventionInbox: async () => ({ items: [], total: 0, counts: {} }),
    claimOpportunity: async () => ({ opportunity: { id: 'lead-1' } }),
    qualifyOpportunity: async () => ({ opportunity: { id: 'lead-1' } }),
    prepareWhatsAppHandoff: async () => ({ url: 'https://wa.me/51900000000' }),
  };
}

test('CRM API: un asesor no puede listar usuarios del equipo', async () => {
  const api = new CrmApi({ repository: fakeRepository(), commercialService: new CommercialService() });
  const result = await api.handle({ method: 'GET', pathname: '/api/crm/v1/users', auth: { user: advisor } });
  assert.equal(result.status, 403);
});

test('CRM API: dashboard valida el periodo y expone búsqueda global', async () => {
  const repository = fakeRepository();
  const calls = [];
  repository.dashboard = async (actor, options) => { calls.push(['dashboard', actor, options]); return { open: 4 }; };
  repository.globalSearch = async (options, actor) => { calls.push(['search', options, actor]); return { items: [] }; };
  const api = new CrmApi({ repository, commercialService: new CommercialService() });
  const dashboard = await api.handle({ method: 'GET', pathname: '/api/crm/v1/dashboard', query: new URLSearchParams('period=6m'), auth: { user: advisor } });
  const search = await api.handle({ method: 'GET', pathname: '/api/crm/v1/search', query: new URLSearchParams('q=agua&limit=6'), auth: { user: advisor } });
  assert.equal(dashboard.status, 200);
  assert.equal(search.status, 200);
  assert.deepEqual(calls[0][2], { period: '6m' });
  assert.deepEqual(calls[1][1], { q: 'agua', limit: '6' });
  assert.equal(calls[1][2], advisor);
});

test('CRM API: crear una cotización usa el precio validado por CommercialService', async () => {
  const repository = fakeRepository();
  let captured;
  repository.createQuote = async (data) => { captured = data; return { id: 'quote-1', ...data }; };
  const api = new CrmApi({ repository, commercialService: new CommercialService() });
  const result = await api.handle({
    method: 'POST',
    pathname: '/api/crm/v1/opportunities/00000000-0000-4000-8000-000000000777/quotes',
    auth: { user: admin },
    body: { items: [{ productId: 'maquila_botella_625ml_rosca', quantity: 20, description: 'Botella 625 ml' }] },
  });
  assert.equal(result.status, 201);
  assert.equal(captured.items.length, 1);
  assert.equal(Number.isFinite(captured.items[0].unitPrice), true);
  assert.equal(captured.items[0].unitPrice > 0, true);
});

test('CRM API: una cotización fuera de reglas comerciales se rechaza', async () => {
  const api = new CrmApi({ repository: fakeRepository(), commercialService: new CommercialService() });
  const result = await api.handle({
    method: 'POST',
    pathname: '/api/crm/v1/opportunities/00000000-0000-4000-8000-000000000777/quotes',
    auth: { user: admin },
    body: { items: [{ productId: 'maquila_botella_625ml_rosca', quantity: 1 }] },
  });
  assert.equal(result.status, 400);
});

test('CRM API: expone listados paginados de contactos, empresas, tareas y etapa', async () => {
  const repository = fakeRepository();
  const calls = [];
  repository.listContacts = async (params, actor) => { calls.push(['contacts', params, actor]); return { items: [], total: 835 }; };
  repository.listCompanies = async (params) => { calls.push(['companies', params]); return { items: [], total: 3 }; };
  repository.listTasks = async (params, actor) => { calls.push(['tasks', params, actor]); return { items: [], total: 8 }; };
  repository.listStageOpportunities = async (key, params, actor) => { calls.push(['stage', key, params, actor]); return { items: [], total: 17, nextCursor: null }; };
  const api = new CrmApi({ repository, commercialService: new CommercialService() });
  const requests = [
    ['GET', '/api/crm/v1/contacts', new URLSearchParams('page=2&q=ana')],
    ['GET', '/api/crm/v1/companies', new URLSearchParams('q=renew')],
    ['GET', '/api/crm/v1/tasks', new URLSearchParams('bucket=TODAY&priority=HIGH')],
    ['GET', '/api/crm/v1/pipeline/stages/qualification/opportunities', new URLSearchParams('limit=20')],
  ];
  for (const [method, pathname, query] of requests) {
    const result = await api.handle({ method, pathname, query, auth: { user: admin } });
    assert.equal(result.status, 200);
  }
  assert.deepEqual(calls.map((call) => call[0]), ['contacts', 'companies', 'tasks', 'stage']);
  assert.equal(calls[3][1], 'QUALIFICATION');
});

test('CRM API: conserva conflictos de versión como 409 en fusiones y tareas', async () => {
  const repository = fakeRepository();
  const conflict = new Error('El registro cambió'); conflict.code = 'VERSION_CONFLICT';
  repository.mergeContacts = async () => { throw conflict; };
  repository.updateTask = async () => { throw conflict; };
  const api = new CrmApi({ repository, commercialService: new CommercialService() });
  const merge = await api.handle({ method: 'POST', pathname: '/api/crm/v1/contacts/merge', body: {}, auth: { user: admin } });
  const task = await api.handle({ method: 'PATCH', pathname: '/api/crm/v1/tasks/00000000-0000-4000-8000-000000000777', body: { version: 1, patch: { title: 'Llamar' } }, auth: { user: admin } });
  assert.equal(merge.status, 409);
  assert.equal(task.status, 409);
});

test('CRM API: expone las superficies operativas de la fase 3', async () => {
  const repository = fakeRepository();
  const calls = [];
  for (const name of ['listProducts','listQuotes','listCalendar','listAutomationRules','listTemplates','listCommunications','listOrders','advancedReport']) {
    const original = repository[name];
    repository[name] = async (...args) => { calls.push(name); return original(...args); };
  }
  const api = new CrmApi({ repository, commercialService: new CommercialService() });
  const paths = ['/api/crm/v1/products','/api/crm/v1/quotes','/api/crm/v1/calendar','/api/crm/v1/automations','/api/crm/v1/communication-templates','/api/crm/v1/communications','/api/crm/v1/orders','/api/crm/v1/reports'];
  for (const pathname of paths) {
    const result = await api.handle({ method:'GET', pathname, auth:{ user:admin } });
    assert.equal(result.status, 200, pathname);
  }
  assert.equal(calls.length, paths.length);
});

test('CRM API: un asesor no puede administrar automatizaciones', async () => {
  const repository = fakeRepository();
  repository.listAutomationRules = async () => { const error = new Error('No autorizado'); throw error; };
  const api = new CrmApi({ repository, commercialService: new CommercialService() });
  const result = await api.handle({ method:'GET', pathname:'/api/crm/v1/automations', auth:{ user:advisor } });
  assert.equal(result.status, 403);
});

test('CRM API: conserva el descuento solicitado después de validar el precio comercial', async () => {
  const repository = fakeRepository(); let captured;
  repository.createQuote = async (data) => { captured=data; return data; };
  const api = new CrmApi({ repository, commercialService: new CommercialService() });
  const result = await api.handle({ method:'POST', pathname:'/api/crm/v1/opportunities/00000000-0000-4000-8000-000000000777/quotes', auth:{ user:admin }, body:{ items:[{ productId:'maquila_botella_625ml_rosca',quantity:20,discountPercent:7.5 }] } });
  assert.equal(result.status,201);
  assert.equal(captured.items[0].discountPercent,7.5);
});

test('CRM API: expone la bandeja y las tres acciones humanas con versión', async () => {
  const repository=fakeRepository();const calls=[];
  repository.listInterventionInbox=async(params,actor)=>{calls.push(['list',params,actor]);return {items:[],total:0,counts:{}};};
  repository.claimOpportunity=async(id,version,actor)=>{calls.push(['claim',id,version,actor]);return {opportunity:{id}};};
  repository.qualifyOpportunity=async(id,version,data,actor)=>{calls.push(['qualify',id,version,data,actor]);return {opportunity:{id}};};
  repository.prepareWhatsAppHandoff=async(id,version,data,actor)=>{calls.push(['handoff',id,version,data,actor]);return {url:'https://wa.me/51900000000'};};
  const api=new CrmApi({repository,commercialService:new CommercialService()});
  const id='00000000-0000-4000-8000-000000000777';
  const requests=[
    {method:'GET',pathname:'/api/crm/v1/intervention-inbox',query:new URLSearchParams('bucket=READY&page=2&sort=RECENT&days=7')},
    {method:'POST',pathname:`/api/crm/v1/opportunities/${id}/claim`,body:{version:3}},
    {method:'POST',pathname:`/api/crm/v1/opportunities/${id}/qualification`,body:{version:4,qualificationStatus:'READY'}},
    {method:'POST',pathname:`/api/crm/v1/opportunities/${id}/whatsapp-handoff`,body:{version:5,message:'Hola',consentConfirmed:true}},
  ];
  for(const request of requests){const result=await api.handle({...request,auth:{user:admin}});assert.equal(result.status,200);}
  assert.deepEqual(calls.map((call)=>call[0]),['list','claim','qualify','handoff']);
  assert.equal(calls[0][1].bucket,'READY');assert.equal(calls[0][1].sort,'RECENT');assert.equal(calls[0][1].days,'7');assert.equal(calls[1][2],3);assert.equal(calls[2][2],4);assert.equal(calls[3][2],5);
});

test('CRM API: conserva conflicto de versión al asumir un lead', async () => {
  const repository=fakeRepository();const error=new Error('La oportunidad ya fue asumida');error.code='VERSION_CONFLICT';repository.claimOpportunity=async()=>{throw error;};
  const api=new CrmApi({repository,commercialService:new CommercialService()});
  const result=await api.handle({method:'POST',pathname:'/api/crm/v1/opportunities/00000000-0000-4000-8000-000000000777/claim',body:{version:1},auth:{user:advisor}});
  assert.equal(result.status,409);
});
