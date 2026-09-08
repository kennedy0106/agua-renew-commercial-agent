import { normalizePhone } from './phone-normalizer.mjs';
import { CONVERSATION_TYPES, MODALITIES, PRODUCTS } from './lead-states.mjs';
import { deriveObserverStatus } from '../meta/lead-processor.mjs';

/** Acciones humanas permitidas por el dashboard observer. Nunca escribe en Meta. */
export class ObserverLeadService {
  constructor({ repository, clock = () => new Date() }) {
    this.repository = repository;
    this.clock = clock;
    this.locks = new Map();
  }

  async withLeadLock(key, fn) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    this.locks.set(key, current);
    try { return await current; } finally { if (this.locks.get(key) === current) this.locks.delete(key); }
  }

  async markWhatsappOpened(leadId, actor = 'operator') {
    return this.withLeadLock(leadId, async () => {
      const lead = await this.#lead(leadId);
      if (lead.status !== 'READY_FOR_WHATSAPP') throw new Error('El lead todavía no está listo para WhatsApp');
      const updated = await this.repository.updateLead(leadId, { status: 'CONTACT_OPENED', whatsappOpenedAt: this.clock() });
      await this.repository.appendEvent({ leadId, eventType: 'WHATSAPP_OPENED', payload: { actor } });
      return updated;
    });
  }

  async markContacted(leadId, actor = 'operator') {
    return this.withLeadLock(leadId, async () => {
      const lead = await this.#lead(leadId);
      if (!['READY_FOR_WHATSAPP', 'CONTACT_OPENED'].includes(lead.status)) throw new Error('El lead todavía no está listo para marcarlo como contactado');
      const updated = await this.repository.updateLead(leadId, { status: 'CONTACTED_MANUALLY', contactedAt: this.clock() });
      await this.repository.appendEvent({ leadId, eventType: 'CONTACT_CONFIRMED', payload: { actor, channel: 'whatsapp_manual' } });
      return updated;
    });
  }

  async correctPhone(leadId, rawPhone, actor = 'operator') {
    return this.withLeadLock(leadId, async () => {
      const lead = await this.#lead(leadId);
      const phone = normalizePhone(rawPhone);
      if (!phone) throw new Error('Teléfono inválido');
      if (phone !== lead.phoneE164) await this.repository.recordPhoneHistory({ leadId, previousPhone: lead.phoneE164, newPhone: phone, reason: 'PHONE_CORRECTED' });
      const status = deriveObserverStatus({ ...lead, currentStatus: lead.status, phoneE164: phone });
      const updated = await this.repository.updateLead(leadId, { phoneRaw: String(rawPhone), phoneE164: phone, status });
      await this.repository.appendEvent({ leadId, eventType: 'PHONE_CORRECTED', payload: { phoneE164: phone, actor } });
      return updated;
    });
  }

  async editLead(leadId, { product = null, modality = null, conversationType = null } = {}, actor = 'operator') {
    return this.withLeadLock(leadId, async () => {
      const lead = await this.#lead(leadId);
      const patch = {};
      if (product !== null) { if (!PRODUCTS.includes(product)) throw new Error('Producto inválido'); patch.product = product; }
      if (modality !== null) { if (!MODALITIES.includes(modality)) throw new Error('Modalidad inválida'); patch.modality = modality; }
      if (conversationType !== null) { if (!CONVERSATION_TYPES.includes(conversationType)) throw new Error('Tipo de conversación inválido'); patch.conversationType = conversationType; }
      patch.status = deriveObserverStatus({ ...lead, ...patch, currentStatus: lead.status });
      const updated = await this.repository.updateLead(leadId, patch);
      await this.repository.appendEvent({ leadId, eventType: 'LEAD_EDITED', payload: { patch, actor } });
      return updated;
    });
  }

  async closeLead(leadId, actor = 'operator') {
    return this.withLeadLock(leadId, async () => {
      await this.#lead(leadId);
      const updated = await this.repository.updateLead(leadId, { status: 'CLOSED' });
      await this.repository.appendEvent({ leadId, eventType: 'LEAD_CLOSED', payload: { reason: 'manual', actor } });
      return updated;
    });
  }

  async reopenLead(leadId, actor = 'operator') {
    return this.withLeadLock(leadId, async () => {
      const lead = await this.#lead(leadId);
      if (lead.status !== 'CLOSED') throw new Error('El lead no está cerrado');
      const status = deriveObserverStatus({ ...lead, currentStatus: 'NEW', conversationType: lead.conversationType === 'unclear' ? 'unclear' : 'commercial_lead' });
      const updated = await this.repository.updateLead(leadId, { status });
      await this.repository.appendEvent({ leadId, eventType: 'LEAD_REOPENED', payload: { actor } });
      return updated;
    });
  }

  async deleteLead(leadId) { await this.#lead(leadId); await this.repository.deleteLead(leadId); return { deleted: true, id: leadId }; }
  async #lead(id) { const lead = await this.repository.findLeadById(id); if (!lead) throw new Error('Lead not found'); return lead; }
}
