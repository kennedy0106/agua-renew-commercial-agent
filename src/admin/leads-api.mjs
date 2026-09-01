import { leadsToCsv, leadsToXlsx } from './lead-export.mjs';
import { buildWhatsAppLink } from '../leads/whatsapp-link.mjs';
import { CONVERSATION_TYPES, MODALITIES, PRODUCTS } from '../leads/lead-states.mjs';

/**
 * API interna del panel de leads (/api/leads).
 * Protegida por ADMIN_API_TOKEN (Bearer o X-Admin-Token) cuando está configurado.
 * Devuelve { status, headers, body } — body es objeto JSON o Buffer (exports).
 */
export class LeadsApi {
  constructor({ leadService, repository, adminToken = null, whatsappLinkBuilder = buildWhatsAppLink }) {
    this.leadService = leadService;
    this.repository = repository;
    this.adminToken = adminToken;
    this.whatsappLinkBuilder = whatsappLinkBuilder;
  }

  #authorized(headers = {}) {
    if (!this.adminToken) return true;
    const bearer = (headers.Authorization ?? headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const xToken = headers['X-Admin-Token'] ?? headers['x-admin-token'] ?? '';
    return bearer === this.adminToken || xToken === this.adminToken;
  }

  async handle({ method, pathname, headers = {}, body = {}, query = {} }) {
    if (!pathname.startsWith('/api/leads')) return null; // no es de esta API
    if (!this.#authorized(headers)) return json(401, { error: 'No autorizado' });

    try {
      // Lista con filtros + conteos
      if (method === 'GET' && pathname === '/api/leads') {
        const filters = readFilters(query);
        const [leads, counts] = await Promise.all([
          this.repository.listLeads(filters),
          this.repository.countLeadsByStatus(),
        ]);
        return json(200, { leads, counts, filters });
      }

      // Exportaciones
      if (method === 'GET' && pathname === '/api/leads/export.csv') {
        const leads = await this.repository.listLeads(readFilters(query));
        return buffer(200, Buffer.from(leadsToCsv(leads), 'utf8'), 'text/csv; charset=utf-8');
      }
      if (method === 'GET' && pathname === '/api/leads/export.xlsx') {
        const leads = await this.repository.listLeads(readFilters(query));
        return buffer(200, leadsToXlsx(leads), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }

      // Interruptor global de auto-respuesta (control manual).
      if (method === 'POST' && pathname === '/api/leads/autoreply') {
        return json(200, { autoReplyEnabled: this.leadService.setAutoReplyEnabled(body.enabled === true) });
      }
      if (method === 'GET' && pathname === '/api/leads/autoreply') {
        return json(200, { autoReplyEnabled: this.leadService.autoReplyEnabled });
      }

      const retry = pathname.match(/^\/api\/leads\/([0-9a-f-]+)\/messages\/([0-9a-f-]+)\/retry$/i);
      if (method === 'POST' && retry) {
        const actor = headers['X-Operator'] ?? headers['x-operator'] ?? 'operator';
        return json(202, await this.leadService.retryMessage(retry[1], retry[2], actor));
      }

      const action = pathname.match(/^\/api\/leads\/([0-9a-f-]+)(?:\/([a-z-]+))?$/i);
      if (!action) return json(404, { error: 'No encontrado' });
      const [, id, operation] = action;

      if (method === 'GET' && !operation) {
        const lead = await this.repository.findLeadById(id);
        if (!lead) return json(404, { error: 'Lead no encontrado' });
        const [messages, events, phoneHistory] = await Promise.all([
          this.repository.listMessages(id),
          this.repository.listEvents(id),
          this.repository.listPhoneHistory(id),
        ]);
        let whatsappLink = null;
        if (lead.phoneE164) {
          whatsappLink = this.whatsappLinkBuilder({ phoneE164: lead.phoneE164, product: lead.product, modality: lead.modality, channel: lead.sourceChannel });
        }
        return json(200, { lead, messages, events, phoneHistory, whatsappLink });
      }

      const actor = headers['X-Operator'] ?? 'operator';
      switch (operation) {
        case 'open':
          return json(200, { lead: await this.leadService.markWhatsappOpened(id, actor) });
        case 'contact':
          return json(200, { lead: await this.leadService.markContacted(id, actor) });
        case 'control':
          return json(200, { lead: await this.leadService.setControlMode(id, body.controlMode, actor) });
        case 'phone':
          return json(200, { lead: await this.leadService.correctPhone(id, body.phone, actor) });
        case 'close':
          return json(200, { lead: await this.leadService.closeLead(id, actor) });
        case 'delete':
          return json(200, await this.leadService.deleteLead(id, actor));
        case 'send-message': {
          const text = String(body.text ?? '').trim();
          if (!text) return json(400, { error: 'El mensaje no puede estar vacío' });
          return json(202, await this.leadService.sendMessage(id, text, actor));
        }
        case 'request-whatsapp':
          return json(202, await this.leadService.requestWhatsapp(id, actor));
        case 'reopen':
          return json(200, { lead: await this.leadService.reopenLead(id, actor) });
        case 'edit':
          return json(200, { lead: await this.leadService.editLead(id, pickEdit(body), actor) });
        default:
          return json(404, { error: 'Operación no encontrada' });
      }
    } catch (error) {
      if (error.message === 'Lead not found') return json(404, { error: 'Lead no encontrado' });
      if (/inv[aá]lido|no est[aá]|ya tiene|no tiene|vac[ií]o|no encontrado|no puede/i.test(error.message)) return json(400, { error: error.message });
      console.error('[leads-api]', error);
      return json(500, { error: 'Error interno' });
    }
  }
}

function json(status, body) {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body };
}

function buffer(status, body, contentType) {
  return { status, headers: { 'Content-Type': contentType, 'Content-Disposition': 'attachment' }, body };
}

function readFilters(query) {
  const q = query instanceof URLSearchParams ? Object.fromEntries(query) : (query ?? {});
  const limit = Number(q.limit);
  const offset = Number(q.offset);
  return {
    status: q.status || null,
    channel: q.channel || null,
    conversationType: q.conversationType || null,
    from: q.from || null,
    to: q.to || null,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 100,
    offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
  };
}

function pickEdit(body) {
  const patch = {};
  if (body.product !== undefined) patch.product = body.product;
  if (body.modality !== undefined) patch.modality = body.modality;
  if (body.conversationType !== undefined) patch.conversationType = body.conversationType;
  return patch;
}
