import { randomUUID } from 'node:crypto';
import { LeadRepository } from './lead-repository.mjs';
import { isValidTransition } from './lead-states.mjs';

function clone(value) { return structuredClone(value); }

/** Adaptador en memoria para tests y desarrollo sin base de datos. */
export class InMemoryLeadRepository extends LeadRepository {
  constructor() {
    super();
    this.leads = new Map();
    this.messagesByLead = new Map();
    this.eventsByLead = new Map();
    this.phoneHistoryByLead = new Map();
    this.messageSeq = 0;
    this.analysisJobs = new Map();
  }

  async createLead(data) {
    const existing = await this.findLeadByExternalConversation({
      channel: data.sourceChannel,
      sourceConversationId: data.sourceConversationId,
    });
    if (existing) return existing;
    const now = new Date();
    const lead = {
      id: randomUUID(),
      sourceChannel: null, sourceOrigin: null, sourceAdId: null, sourceContext: {}, sourceConversationId: null,
      metaUserId: null, metaUsername: null,
      conversationType: null, classificationConfidence: null,
      automationTriggered: false,
      phoneRaw: null, phoneE164: null,
      product: null, modality: null,
      status: 'NEW', controlMode: 'AUTO',
      initialSocialMessageSent: false, clarificationCount: 0,
      lastReplyAt: null, modalityAskCount: 0,
      lastInboundAt: null, whatsappOpenedAt: null, contactedAt: null,
      metaConfirmationSentAt: null, metaConfirmationBlocked: false,
      processingVersion: null, lastProcessedAt: null,
      analysisSummary: null, suggestedWhatsappMessage: null, analysisSource: null,
      analysisProvider: null, analysisModel: null, aiAnalysis: {}, aiAnalyzedAt: null,
      createdAt: now, updatedAt: now,
      ...data,
    };
    this.leads.set(lead.id, lead);
    return clone(lead);
  }

  async findLeadById(id) {
    return this.leads.has(id) ? clone(this.leads.get(id)) : null;
  }

  async findLeadByExternalConversation({ channel, sourceConversationId }) {
    for (const lead of this.leads.values()) {
      if (lead.sourceChannel === channel && lead.sourceConversationId === sourceConversationId) return clone(lead);
    }
    return null;
  }

  async findLeadByPhone(phoneE164) {
    if (!phoneE164) return null;
    let match = null;
    for (const lead of this.leads.values()) {
      if (lead.phoneE164 === phoneE164 && (!match || lead.updatedAt > match.updatedAt)) match = lead;
    }
    return match ? clone(match) : null;
  }

  async updateLead(id, patch) {
    const lead = this.leads.get(id);
    if (!lead) throw new Error('Lead not found');
    if (patch.status !== undefined && !isValidTransition(lead.status, patch.status)) {
      throw new Error(`Transición de lead inválida: ${lead.status} → ${patch.status}`);
    }
    const updated = { ...lead, ...patch, updatedAt: new Date() };
    this.leads.set(id, updated);
    return clone(updated);
  }

  async appendMessage({ leadId, channel, direction, actorType = null, actorId = null, externalMessageId = null, content,
    deliveryStatus = direction === 'inbound' ? 'RECEIVED' : 'PENDING', purpose = null,
    providerMessageId = null, sourceCreatedAt = null }) {
    if (!this.leads.has(leadId)) throw new Error('Lead not found');
    if (externalMessageId) {
      for (const messages of this.messagesByLead.values()) {
        const duplicate = messages.find((message) => message.externalMessageId === externalMessageId);
        if (duplicate) {
          if (sourceCreatedAt) duplicate.sourceCreatedAt = new Date(sourceCreatedAt);
          if (actorType) duplicate.actorType = actorType;
          return { ...clone(duplicate), wasInserted: false };
        }
      }
    }
    const message = {
      id: randomUUID(), leadId, channel, direction, actorType, actorId,
      externalMessageId, content, sequenceNo: ++this.messageSeq, createdAt: new Date(),
      deliveryStatus, purpose, providerMessageId, attemptCount: 0,
      nextAttemptAt: deliveryStatus === 'PENDING' ? new Date() : null,
      lastAttemptAt: null, sentAt: deliveryStatus === 'SENT' ? new Date() : null,
      lastErrorCode: null, lastErrorMessage: null,
      sourceCreatedAt: sourceCreatedAt ? new Date(sourceCreatedAt) : new Date(), lockedAt: null,
    };
    if (!this.messagesByLead.has(leadId)) this.messagesByLead.set(leadId, []);
    this.messagesByLead.get(leadId).push(message);
    if (direction === 'inbound') {
      const job = this.analysisJobs.get(leadId) ?? { leadId, requestedVersion: 0, completedVersion: 0, attemptCount: 0 };
      this.analysisJobs.set(leadId, { ...job, requestedVersion: job.requestedVersion + 1,
        status: job.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING',
        nextAttemptAt: job.status === 'PROCESSING' ? job.nextAttemptAt : new Date(),
        lockedAt: job.status === 'PROCESSING' ? job.lockedAt : null,
        leaseToken: job.status === 'PROCESSING' ? job.leaseToken : null });
    }
    return { ...clone(message), wasInserted: true };
  }

  async claimAnalysisJobs({ limit = 10, now = new Date(), leaseMs = 120_000 } = {}) {
    const claimed = [];
    for (const job of this.analysisJobs.values()) {
      const stale = job.status === 'PROCESSING' && job.lockedAt && now - new Date(job.lockedAt) >= leaseMs;
      if (stale) { job.status = 'FAILED'; job.nextAttemptAt = now; job.lockedAt = null; }
      if (claimed.length < limit && ['PENDING','FAILED'].includes(job.status) && new Date(job.nextAttemptAt) <= now) {
        job.status = 'PROCESSING'; job.attemptCount += 1; job.lockedAt = now; job.leaseToken=randomUUID(); claimed.push(clone(job));
      }
    }
    return claimed;
  }

  async failAnalysisJob(claim, { nextAttemptAt, error, maxAttempts = 5 }) {
    const job = this.analysisJobs.get(claim.leadId); if (!job || job.requestedVersion !== claim.requestedVersion || job.leaseToken!==claim.leaseToken) return false;
    job.lockedAt = null; job.leaseToken=null; job.lastError = String(error ?? '').slice(0,500);
    job.status = job.attemptCount >= maxAttempts ? 'EXHAUSTED' : 'FAILED'; job.nextAttemptAt = nextAttemptAt;
    return true;
  }

  async applyAnalysisJobResult(claim, prepared) {
    const job=this.analysisJobs.get(claim.leadId);
    if(!job||job.status!=='PROCESSING'||job.leaseToken!==claim.leaseToken) return {applied:false,reason:'lease_lost'};
    if(job.requestedVersion!==claim.requestedVersion){job.completedVersion=Math.max(job.completedVersion,claim.requestedVersion);job.status='PENDING';job.nextAttemptAt=new Date();job.lockedAt=null;job.leaseToken=null;return {applied:false,reason:'newer_version_pending'};}
    const result=await this.#applyPrepared(prepared); job.completedVersion=claim.requestedVersion;job.status='PENDING';job.nextAttemptAt=new Date(8640000000000000);job.attemptCount=0;job.lockedAt=null;job.leaseToken=null;return {applied:true,...result};
  }

  async #applyPrepared(prepared){
    if(prepared.patch.phoneE164&&prepared.patch.phoneE164!==prepared.lead.phoneE164) await this.recordPhoneHistory({leadId:prepared.leadId,previousPhone:prepared.lead.phoneE164,newPhone:prepared.patch.phoneE164,reason:prepared.lead.phoneE164?'PHONE_UPDATED_FROM_CONVERSATION':'PHONE_CAPTURED'});
    const lead=await this.updateLead(prepared.leadId,prepared.patch);await this.appendEvent({leadId:prepared.leadId,eventType:'LEAD_PROCESSED',payload:{version:prepared.patch.processingVersion,messageCount:prepared.inboundCount}});return {lead};
  }

  async listMessages(leadId) {
    const list = this.messagesByLead.get(leadId) ?? [];
    return clone([...list].sort((a, b) => {
      const left = new Date(a.sourceCreatedAt ?? a.createdAt).getTime();
      const right = new Date(b.sourceCreatedAt ?? b.createdAt).getTime();
      return left - right || a.sequenceNo - b.sequenceNo;
    }));
  }

  async enqueueOutbound({ leadId, channel, actorType, actorId = null, content, purpose,
    eventType = 'OUTBOUND_QUEUED', eventPayload = {}, leadPatch = {} }) {
    const message = await this.appendMessage({
      leadId, channel, direction: 'outbound', actorType, actorId, content,
      deliveryStatus: 'PENDING', purpose,
    });
    await this.appendEvent({ leadId, eventType, payload: { ...eventPayload, messageId: message.id, purpose } });
    if (Object.keys(leadPatch).length) await this.updateLead(leadId, leadPatch);
    return message;
  }

  async appendEvent({ leadId, eventType, payload = {} }) {
    const event = { id: randomUUID(), leadId, eventType, payload, createdAt: new Date() };
    if (!this.eventsByLead.has(leadId)) this.eventsByLead.set(leadId, []);
    this.eventsByLead.get(leadId).push(event);
    return clone(event);
  }

  async listEvents(leadId) {
    return clone(this.eventsByLead.get(leadId) ?? []);
  }

  async recordPhoneHistory({ leadId, previousPhone, newPhone, reason }) {
    const entry = { id: randomUUID(), leadId, previousPhone, newPhone, reason, createdAt: new Date() };
    if (!this.phoneHistoryByLead.has(leadId)) this.phoneHistoryByLead.set(leadId, []);
    this.phoneHistoryByLead.get(leadId).push(entry);
    return clone(entry);
  }

  async listPhoneHistory(leadId) {
    return clone(this.phoneHistoryByLead.get(leadId) ?? []);
  }

  async deleteLead(id) {
    if (!this.leads.has(id)) throw new Error('Lead not found');
    this.leads.delete(id);
    this.messagesByLead.delete(id);
    this.eventsByLead.delete(id);
    this.phoneHistoryByLead.delete(id);
  }

  #filteredLeads({ status = null, channel = null, conversationType = null, from = null, to = null, search = null } = {}) {
    let list = [...this.leads.values()];
    if (status) list = list.filter((lead) => lead.status === status);
    if (channel) list = list.filter((lead) => lead.sourceChannel === channel);
    if (conversationType) list = list.filter((lead) => lead.conversationType === conversationType);
    if (from) list = list.filter((lead) => lead.createdAt >= new Date(from));
    if (to) list = list.filter((lead) => lead.createdAt <= new Date(to));
    if (search) {
      const needle = String(search).trim().toLowerCase();
      const digits = needle.replace(/\D/g, '');
      list = list.filter((lead) => String(lead.metaUsername ?? '').toLowerCase().includes(needle) ||
        (digits && String(lead.phoneE164 ?? '').replace(/\D/g, '').includes(digits)));
    }
    return list;
  }

  async listLeads({ limit = 100, offset = 0, sort = 'createdAt', direction = 'desc', ...filters } = {}) {
    const list = this.#filteredLeads(filters);
    const multiplier = direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const left = sort.endsWith('At') ? new Date(a[sort] ?? 0).getTime() : String(a[sort] ?? '').toLowerCase();
      const right = sort.endsWith('At') ? new Date(b[sort] ?? 0).getTime() : String(b[sort] ?? '').toLowerCase();
      return left < right ? -multiplier : left > right ? multiplier : 0;
    });
    return clone(list.slice(offset, offset + limit));
  }

  async countLeads(filters = {}) {
    const list = this.#filteredLeads(filters);
    return {
      total: list.length,
      missingPhone: list.filter((lead) => !lead.phoneE164).length,
      ready: list.filter((lead) => lead.status === 'READY_FOR_WHATSAPP').length,
      contacted: list.filter((lead) => ['CONTACT_OPENED', 'CONTACTED_MANUALLY'].includes(lead.status)).length,
    };
  }

  async countLeadsByStatus() {
    const counts = {};
    for (const lead of this.leads.values()) {
      counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    }
    return counts;
  }

  async claimDueOutbound({ limit = 10, now = new Date(), leaseMs = 120_000 } = {}) {
    const due = [];
    for (const messages of this.messagesByLead.values()) {
      for (const message of messages) {
        const stale = message.deliveryStatus === 'SENDING' && message.lockedAt &&
          now.getTime() - new Date(message.lockedAt).getTime() >= leaseMs;
        if (stale) {
          message.deliveryStatus = 'RETRY_WAIT';
          message.nextAttemptAt = now;
          message.lockedAt = null;
        }
        if (due.length < limit && ['PENDING', 'RETRY_WAIT'].includes(message.deliveryStatus) &&
          (!message.nextAttemptAt || new Date(message.nextAttemptAt) <= now)) {
          message.deliveryStatus = 'SENDING';
          message.attemptCount += 1;
          message.lastAttemptAt = now;
          message.lockedAt = now;
          due.push(clone(message));
        }
      }
    }
    return due;
  }

  async markOutboundSent(messageId, { providerMessageId = null, sentAt = new Date() } = {}) {
    return this.#updateMessage(messageId, { deliveryStatus: 'SENT', providerMessageId, sentAt, nextAttemptAt: null, lockedAt: null, lastErrorCode: null, lastErrorMessage: null });
  }

  async markOutboundRetry(messageId, { nextAttemptAt, errorCode = null, errorMessage = null } = {}) {
    return this.#updateMessage(messageId, { deliveryStatus: 'RETRY_WAIT', nextAttemptAt, lockedAt: null, lastErrorCode: errorCode, lastErrorMessage: errorMessage });
  }

  async markOutboundFailed(messageId, { status = 'FAILED', errorCode = null, errorMessage = null } = {}) {
    return this.#updateMessage(messageId, { deliveryStatus: status, nextAttemptAt: null, lockedAt: null, lastErrorCode: errorCode, lastErrorMessage: errorMessage });
  }

  async recordOutboundOutcome({ messageId, status, providerMessageId = null, sentAt = null,
    nextAttemptAt = null, errorCode = null, errorMessage = null, leadPatch = {}, events = [] }) {
    let message;
    if (status === 'SENT') message = await this.markOutboundSent(messageId, { providerMessageId, sentAt });
    else if (status === 'RETRY_WAIT') message = await this.markOutboundRetry(messageId, { nextAttemptAt, errorCode, errorMessage });
    else message = await this.markOutboundFailed(messageId, { status, errorCode, errorMessage });
    if (Object.keys(leadPatch).length) await this.updateLead(message.leadId, leadPatch);
    for (const event of events) {
      await this.appendEvent({ leadId: message.leadId, eventType: event.eventType, payload: event.payload });
    }
    return message;
  }

  async applyHistoricalAnalysis({ leadId, before, after, payload = {} }) {
    const lead = await this.findLeadById(leadId);
    if (!lead || Object.entries(before).some(([key, value]) => (lead[key] ?? null) !== (value ?? null))) return false;
    await this.updateLead(leadId, after);
    await this.appendEvent({ leadId, eventType: 'HISTORY_ANALYZED', payload: { before, after, ...payload } });
    return true;
  }

  async retryOutbound(messageId) {
    const message = this.#findMessage(messageId);
    if (!message || !['FAILED', 'UNKNOWN'].includes(message.deliveryStatus)) throw new Error('Mensaje no disponible para reintento');
    return this.#updateMessage(messageId, { deliveryStatus: 'PENDING', attemptCount: 0, nextAttemptAt: new Date(), lockedAt: null, lastErrorCode: null, lastErrorMessage: null });
  }

  #findMessage(id) {
    for (const messages of this.messagesByLead.values()) {
      const found = messages.find((message) => message.id === id);
      if (found) return found;
    }
    return null;
  }

  #updateMessage(id, patch) {
    const message = this.#findMessage(id);
    if (!message) throw new Error('Mensaje no encontrado');
    Object.assign(message, patch);
    return clone(message);
  }

  async close() {}
}
