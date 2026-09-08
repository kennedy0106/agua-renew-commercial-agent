import { createQuotePdf } from './quote-pdf.mjs';

function json(status, body, headers = {}) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }, body };
}

function parseBody(body) {
  return body && typeof body === 'object' ? body : {};
}

function queryObject(query) {
  return query instanceof URLSearchParams ? Object.fromEntries(query) : (query ?? {});
}

function quoteLineFromCommercial(input, result) {
  const data = result.data;
  const price = data?.tier?.package_price_pen ?? data?.tier?.price?.amount_pen ?? data?.price?.amount_pen;
  if (!Number.isFinite(Number(price))) throw new Error('La regla comercial no produjo un precio unitario cotizable');
  const product = input.description || data.product_id || input.productId;
  return {
    productId: input.productId,
    description: String(product),
    quantity: Number(input.quantity),
    unitPrice: Number(price),
    discountPercent: Number(input.discountPercent ?? 0),
  };
}

export class CrmApi {
  constructor({ repository, commercialService }) {
    this.repository = repository;
    this.commercialService = commercialService;
  }

  async handle({ method, pathname, query, body, auth, requestMeta = {} }) {
    if (!pathname.startsWith('/api/crm/v1')) return null;
    if (!auth?.user) return json(401, { error: 'No autorizado' });
    const actor = auth.user;
    const data = parseBody(body);
    const params = queryObject(query);
    try {
      if (method === 'GET' && pathname === '/api/crm/v1/bootstrap') {
        const [stages, users, notifications] = await Promise.all([
          this.repository.listStages(),
          actor.role === 'ADVISOR' ? Promise.resolve([actor]) : this.repository.listUsers(),
          this.repository.listNotifications(actor),
        ]);
        return json(200, { user: actor, stages, users, notifications });
      }
      if (method === 'GET' && pathname === '/api/crm/v1/dashboard') {
        return json(200, await this.repository.dashboard(actor, { period: params.period }));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/search') {
        return json(200, await this.repository.globalSearch({ q: params.q, limit: params.limit }, actor));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/intervention-inbox') {
        return json(200, await this.repository.listInterventionInbox({
          bucket: params.bucket, ownerId: params.ownerId || null, q: params.q,
          page: params.page, pageSize: params.pageSize, sort: params.sort, days: params.days,
        }, actor));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/contacts') {
        return json(200, await this.repository.listContacts({ page: params.page, pageSize: params.pageSize, q: params.q, companyId: params.companyId || null, ownerId: params.ownerId || null }, actor));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/contacts') {
        return json(201, await this.repository.createContact(data, actor, requestMeta));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/contacts/merge-preview') {
        return json(200, await this.repository.mergePreview(data, actor));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/contacts/merge') {
        return json(200, await this.repository.mergeContacts(data, actor, requestMeta));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/companies') {
        return json(200, await this.repository.listCompanies({ page: params.page, pageSize: params.pageSize, q: params.q }, actor));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/companies') {
        return json(201, await this.repository.createCompany(data, actor, requestMeta));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/tasks') {
        return json(200, await this.repository.listTasks({ page: params.page, pageSize: params.pageSize, assignedTo: params.assignedTo || null, status: params.status || 'OPEN', priority: params.priority || null, bucket: params.bucket || null, q: params.q }, actor));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/products') {
        return json(200, await this.repository.listProducts({ q: params.q, active: params.active }));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/products') {
        const documented = this.commercialService.get_product(data.productKey);
        if (documented.status !== 'ok') throw new Error('Clave de producto inválida: no existe en las reglas comerciales documentadas');
        return json(201, await this.repository.createProduct(data, actor, requestMeta));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/quotes') {
        return json(200, await this.repository.listQuotes({ page: params.page, pageSize: params.pageSize, status: params.status || null, q: params.q }, actor));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/calendar') {
        return json(200, await this.repository.listCalendar({ from: params.from, to: params.to, assignedTo: params.assignedTo || null }, actor));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/calendar') {
        return json(201, await this.repository.createCalendarEvent(data, actor, requestMeta));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/automations') {
        return json(200, await this.repository.listAutomationRules(actor));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/automations') {
        return json(201, await this.repository.createAutomationRule(data, actor, requestMeta));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/automations/run') {
        if (actor.role !== 'ADMIN') return json(403, { error: 'No autorizado' });
        return json(200, await this.repository.runRevenueAutomations());
      }
      if (method === 'GET' && pathname === '/api/crm/v1/communication-templates') {
        return json(200, await this.repository.listTemplates(actor));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/communication-templates') {
        return json(201, await this.repository.createTemplate(data, actor, requestMeta));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/communications') {
        return json(200, await this.repository.listCommunications({ page: params.page, pageSize: params.pageSize, channel: params.channel || null, status: params.status || null }, actor));
      }
      if (method === 'POST' && pathname === '/api/crm/v1/communications') {
        return json(201, await this.repository.createCommunication(data, actor, requestMeta));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/orders') {
        return json(200, await this.repository.listOrders({ page: params.page, pageSize: params.pageSize, status: params.status || null, paymentStatus: params.paymentStatus || null }, actor));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/opportunities') {
        return json(200, await this.repository.listOpportunities({
          page: params.page, pageSize: params.pageSize, q: params.q,
          stage: params.stage || null, ownerId: params.ownerId || null,
          lifecycle: params.lifecycle === 'ALL' ? null : (params.lifecycle || 'OPEN'),
          sort: params.sort, includeDeleted: params.deleted === 'true' && actor.role === 'ADMIN',
        }, actor));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/opportunities.csv') {
        const first = await this.repository.listOpportunities({
          page: 1, pageSize: 100, q: params.q, stage: params.stage || null,
          ownerId: params.ownerId || null,
          lifecycle: params.lifecycle === 'ALL' ? null : (params.lifecycle || 'OPEN'),
          sort: params.sort, includeDeleted: params.deleted === 'true' && actor.role === 'ADMIN',
        }, actor);
        const items = [...first.items];
        const pages = Math.min(1000, Math.ceil(first.total / 100));
        for (let page = 2; page <= pages; page += 1) {
          const batch = await this.repository.listOpportunities({
            page, pageSize: 100, q: params.q, stage: params.stage || null,
            ownerId: params.ownerId || null,
            lifecycle: params.lifecycle === 'ALL' ? null : (params.lifecycle || 'OPEN'), sort: params.sort,
            includeDeleted: params.deleted === 'true' && actor.role === 'ADMIN',
          }, actor);
          items.push(...batch.items);
        }
        const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
        const header = ['Contacto', 'Teléfono', 'Canal', 'Etapa', 'Producto', 'Modalidad', 'Responsable', 'Valor', 'Próxima acción', 'Estado'];
        const rows = items.map((item) => [item.contactName, item.phoneE164, item.sourceChannel, item.stageName, item.product, item.modality, item.ownerName, item.estimatedValue, item.nextAction, item.lifecycleStatus]);
        const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
        return { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="oportunidades-crm.csv"' }, body: Buffer.from(csv) };
      }
      if (method === 'GET' && pathname === '/api/crm/v1/reports') {
        return json(200, await this.repository.advancedReport(actor, { from: params.from, to: params.to }));
      }
      if (method === 'GET' && pathname === '/api/crm/v1/users') {
        if (actor.role === 'ADVISOR') return json(403, { error: 'No autorizado' });
        return json(200, { users: await this.repository.listUsers() });
      }
      if (method === 'POST' && pathname === '/api/crm/v1/users') {
        if (actor.role !== 'ADMIN') return json(403, { error: 'No autorizado' });
        return json(201, { user: await this.repository.createUser(data, actor) });
      }
      if (method === 'GET' && pathname === '/api/crm/v1/notifications') {
        return json(200, { notifications: await this.repository.listNotifications(actor) });
      }
      const notification = pathname.match(/^\/api\/crm\/v1\/notifications\/([0-9a-f-]+)\/read$/i);
      if (method === 'POST' && notification) {
        return json(200, { notification: await this.repository.markNotificationRead(notification[1], actor) });
      }

      const duplicateCandidates = pathname.match(/^\/api\/crm\/v1\/contacts\/([0-9a-f-]+)\/duplicates$/i);
      if (method === 'GET' && duplicateCandidates) {
        return json(200, { candidates: await this.repository.duplicateCandidates(duplicateCandidates[1], actor) });
      }
      const contact = pathname.match(/^\/api\/crm\/v1\/contacts\/([0-9a-f-]+)$/i);
      if (method === 'GET' && contact) {
        const detail = await this.repository.findContact(contact[1], actor);
        return detail ? json(200, detail) : json(404, { error: 'Contacto no encontrado' });
      }
      if (method === 'PATCH' && contact) {
        return json(200, await this.repository.updateContact(contact[1], data.version, data.patch, actor, requestMeta));
      }
      const company = pathname.match(/^\/api\/crm\/v1\/companies\/([0-9a-f-]+)$/i);
      if (method === 'GET' && company) {
        const detail = await this.repository.findCompany(company[1], actor);
        return detail ? json(200, detail) : json(404, { error: 'Empresa no encontrada' });
      }
      if (method === 'PATCH' && company) {
        return json(200, await this.repository.updateCompany(company[1], data.version, data.patch, actor, requestMeta));
      }
      const product = pathname.match(/^\/api\/crm\/v1\/products\/([0-9a-f-]+)$/i);
      if (method === 'PATCH' && product) {
        return json(200, await this.repository.updateProduct(product[1], data.version, data.patch, actor, requestMeta));
      }
      const calendarEvent = pathname.match(/^\/api\/crm\/v1\/calendar\/([0-9a-f-]+)$/i);
      if (method === 'PATCH' && calendarEvent) {
        return json(200, await this.repository.updateCalendarEvent(calendarEvent[1], data.version, data.patch, actor, requestMeta));
      }
      if (method === 'DELETE' && calendarEvent) {
        return json(200, await this.repository.deleteCalendarEvent(calendarEvent[1], data.version, actor, requestMeta));
      }
      const automation = pathname.match(/^\/api\/crm\/v1\/automations\/([0-9a-f-]+)$/i);
      if (method === 'PATCH' && automation) {
        return json(200, await this.repository.updateAutomationRule(automation[1], data.version, data.patch, actor, requestMeta));
      }
      const communicationHandoff = pathname.match(/^\/api\/crm\/v1\/communications\/([0-9a-f-]+)\/handoff$/i);
      if (method === 'POST' && communicationHandoff) {
        return json(200, await this.repository.handoffCommunication(communicationHandoff[1], data.version, actor, requestMeta));
      }
      const order = pathname.match(/^\/api\/crm\/v1\/orders\/([0-9a-f-]+)$/i);
      if (method === 'PATCH' && order) {
        return json(200, await this.repository.updateOrder(order[1], data.version, data.patch, actor, requestMeta));
      }
      const payment = pathname.match(/^\/api\/crm\/v1\/orders\/([0-9a-f-]+)\/payments$/i);
      if (method === 'POST' && payment) {
        return json(201, await this.repository.addPayment(payment[1], data, actor, requestMeta));
      }

      const stageOpportunities = pathname.match(/^\/api\/crm\/v1\/pipeline\/stages\/([A-Z_]+)\/opportunities$/i);
      if (method === 'GET' && stageOpportunities) {
        return json(200, await this.repository.listStageOpportunities(stageOpportunities[1].toUpperCase(), { cursor: params.cursor || null, limit: params.limit, q: params.q, ownerId: params.ownerId || null }, actor));
      }

      const opportunity = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)$/i);
      if (method === 'GET' && opportunity) {
        const detail = await this.repository.findOpportunity(opportunity[1], actor);
        return detail ? json(200, detail) : json(404, { error: 'Oportunidad no encontrada' });
      }
      if (method === 'PATCH' && opportunity) {
        return json(200, await this.repository.updateOpportunity({ id: opportunity[1], version: data.version, patch: data.patch }, actor, requestMeta));
      }
      if (method === 'DELETE' && opportunity) {
        return json(200, await this.repository.softDeleteOpportunity(opportunity[1], actor, requestMeta));
      }

      const claimOpportunity = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/claim$/i);
      if (method === 'POST' && claimOpportunity) {
        return json(200, await this.repository.claimOpportunity(claimOpportunity[1], data.version, actor, requestMeta));
      }
      const qualifyOpportunity = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/qualification$/i);
      if (method === 'POST' && qualifyOpportunity) {
        return json(200, await this.repository.qualifyOpportunity(qualifyOpportunity[1], data.version, data, actor, requestMeta));
      }
      const whatsappHandoff = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/whatsapp-handoff$/i);
      if (method === 'POST' && whatsappHandoff) {
        return json(200, await this.repository.prepareWhatsAppHandoff(whatsappHandoff[1], data.version, data, actor, requestMeta));
      }

      const stage = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/stage$/i);
      if (method === 'POST' && stage) {
        return json(200, await this.repository.moveOpportunity({ id: stage[1], stageKey: data.stageKey, version: data.version, reason: data.reason }, actor, requestMeta));
      }
      const restore = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/restore$/i);
      if (method === 'POST' && restore) {
        return json(200, await this.repository.restoreOpportunity(restore[1], actor, requestMeta));
      }
      const task = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/tasks$/i);
      if (method === 'POST' && task) {
        return json(201, { task: await this.repository.createTask({ opportunityId: task[1], ...data }, actor, requestMeta) });
      }
      const note = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/notes$/i);
      if (method === 'POST' && note) {
        return json(201, { note: await this.repository.addNote({ opportunityId: note[1], body: data.body }, actor, requestMeta) });
      }
      const quote = pathname.match(/^\/api\/crm\/v1\/opportunities\/([0-9a-f-]+)\/quotes$/i);
      if (method === 'POST' && quote) {
        const requestedItems = Array.isArray(data.items) ? data.items : [];
        const validated = requestedItems.map((item) => {
          const result = this.commercialService.get_purchase_price({
            productId: item.productId,
            quantity: Number(item.quantity),
            purchaseType: item.purchaseType,
            fulfillment: item.fulfillment,
            withPersonalizedLabels: Boolean(item.withPersonalizedLabels),
          });
          if (result.status !== 'ok') {
            const error = new Error(result.message || 'La cotización requiere revisión comercial');
            error.details = result;
            throw error;
          }
          return { line: quoteLineFromCommercial(item, result), result };
        });
        const created = await this.repository.createQuote({
          opportunityId: quote[1],
          items: validated.map((entry) => entry.line),
          commercialSnapshot: { generatedAt: new Date().toISOString(), results: validated.map((entry) => entry.result.data) },
          validUntil: data.validUntil,
          notes: data.notes,
          terms: data.terms,
        }, actor, requestMeta);
        return json(201, { quote: created });
      }

      const completeTask = pathname.match(/^\/api\/crm\/v1\/tasks\/([0-9a-f-]+)\/complete$/i);
      if (method === 'POST' && completeTask) {
        return json(200, { task: await this.repository.completeTask(completeTask[1], data.version, actor, requestMeta) });
      }
      const reopenTask = pathname.match(/^\/api\/crm\/v1\/tasks\/([0-9a-f-]+)\/reopen$/i);
      if (method === 'POST' && reopenTask) {
        return json(200, { task: await this.repository.updateTask(reopenTask[1], data.version, { status: 'OPEN' }, actor, requestMeta) });
      }
      const standaloneTask = pathname.match(/^\/api\/crm\/v1\/tasks\/([0-9a-f-]+)$/i);
      if (method === 'PATCH' && standaloneTask) {
        return json(200, { task: await this.repository.updateTask(standaloneTask[1], data.version, data.patch, actor, requestMeta) });
      }
      if (method === 'DELETE' && standaloneTask) {
        return json(200, await this.repository.deleteTask(standaloneTask[1], data.version, actor, requestMeta));
      }
      const quoteStatus = pathname.match(/^\/api\/crm\/v1\/quotes\/([0-9a-f-]+)\/status$/i);
      if (method === 'POST' && quoteStatus) {
        return json(200, await this.repository.setQuoteStatus({ id: quoteStatus[1], status: data.status, version: data.version }, actor, requestMeta));
      }
      const quotePdf = pathname.match(/^\/api\/crm\/v1\/quotes\/([0-9a-f-]+)\/pdf$/i);
      if (method === 'GET' && quotePdf) {
        const quoteData = await this.repository.getQuote(quotePdf[1], actor);
        if (!quoteData) return json(404, { error: 'Cotización no encontrada' });
        return {
          status: 200,
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${quoteData.quote_number}.pdf"` },
          body: createQuotePdf(quoteData),
        };
      }
      return json(404, { error: 'Ruta CRM no encontrada' });
    } catch (error) {
      if (error.code === 'VERSION_CONFLICT') return json(409, { error: error.message, code: 'VERSION_CONFLICT' });
      if (error.code === '23505') return json(409, { error: 'Ya existe un registro con esos datos' });
      if (error.code === '23514') return json(400, { error: 'Los datos no cumplen las reglas del CRM' });
      if (/No autorizado/i.test(error.message)) return json(403, { error: 'No autorizado' });
      if (/no encontrad|inválid|indique|agregue|cambió|contraseña|revisión|precio|mínimo|pedido|obligatorio|seleccione|disponible|RUC|teléfono|correo|fecha|confirme|consentimiento|asumir|lista para WhatsApp/i.test(error.message)) {
        return json(400, { error: error.message, details: error.details });
      }
      console.error('[crm-api]', error);
      return json(500, { error: 'No pudimos completar la operación' });
    }
  }
}
