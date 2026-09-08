/** Persiste mensajes observados y delega la reconstrucción al LeadProcessor. */
export class ConversationObserver {
  constructor({ repository, processor }) {
    this.repository = repository;
    this.processor = processor;
    this.locks = new Map();
  }

  async observe(event) {
    const key = `${event.channel}:${event.sourceConversationId}`;
    const previous = this.locks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => this.#observe(event));
    this.locks.set(key, current);
    try {
      return await current;
    } finally {
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }

  #deferAnalysis(key, leadId) {
    queueMicrotask(() => {
      const previous = this.locks.get(key) ?? Promise.resolve();
      const current = previous.catch(() => {}).then(() => this.processor.process(leadId));
      this.locks.set(key, current);
      current.catch((error) => console.error('[lead-analysis]', error?.message ?? error)).finally(() => {
        if (this.locks.get(key) === current) this.locks.delete(key);
      });
    });
  }

  async #observe(event) {
    const key = `${event.channel}:${event.sourceConversationId}`;
    let lead = await this.repository.findLeadByExternalConversation({
      channel: event.channel,
      sourceConversationId: event.sourceConversationId,
    });
    const created = !lead;
    if (!lead) {
      lead = await this.repository.createLead({
        sourceChannel: event.channel,
        sourceOrigin: event.sourceOrigin ?? 'unknown',
        sourceAdId: event.sourceAdId ?? null,
        sourceContext: event.sourceContext ?? {},
        sourceConversationId: event.sourceConversationId,
        metaUserId: event.metaUserId ?? event.sender?.id ?? null,
        metaUsername: event.sender?.username ?? null,
        automationTriggered: event.automationTriggered === true,
      });
      await this.repository.appendEvent({
        leadId: lead.id,
        eventType: 'LEAD_CREATED',
        payload: { channel: event.channel, origin: event.sourceOrigin ?? 'unknown', adId: event.sourceAdId ?? null },
      });
    } else {
      const attributionPatch = {};
      if (!lead.metaUsername && event.sender?.username) attributionPatch.metaUsername = event.sender.username;
      if (!lead.sourceAdId && event.sourceAdId) attributionPatch.sourceAdId = event.sourceAdId;
      if (event.sourceContext && Object.keys(event.sourceContext).length) {
        const mergedContext = { ...(lead.sourceContext ?? {}), ...event.sourceContext };
        if (JSON.stringify(mergedContext) !== JSON.stringify(lead.sourceContext ?? {})) attributionPatch.sourceContext = mergedContext;
      }
      if (Object.keys(attributionPatch).length) lead = await this.repository.updateLead(lead.id, attributionPatch);
    }

    const stored = await this.repository.appendMessage({
      leadId: lead.id,
      channel: event.channel,
      direction: event.direction ?? 'inbound',
      actorType: event.actorType ?? ((event.direction ?? 'inbound') === 'inbound' ? 'user' : 'page'),
      actorId: event.actorId ?? null,
      externalMessageId: event.externalMessageId ?? null,
      content: event.text ?? '',
      deliveryStatus: (event.direction ?? 'inbound') === 'inbound' ? 'RECEIVED' : 'SENT',
      providerMessageId: (event.direction ?? 'inbound') === 'outbound' ? event.externalMessageId ?? null : null,
      sourceCreatedAt: event.timestamp ? new Date(event.timestamp) : null,
    });
    if (stored?.wasInserted === false) return { lead, created, duplicate: true, processed: false };

    if ((event.direction ?? 'inbound') === 'inbound') {
      lead = await this.repository.updateLead(lead.id, {
        lastInboundAt: event.timestamp ? new Date(event.timestamp) : new Date(),
      });
    }
    if (event.skipProcessing === true) {
      return { lead, created, duplicate: false, processed: false, message: stored };
    }
    if (event.deferProcessing === true) {
      this.#deferAnalysis(key, lead.id);
      return { lead, created, duplicate: false, processed: false, deferred: true, message: stored };
    }
    const processed = await this.processor.process(lead.id);
    return { ...processed, created, duplicate: false, processed: true, message: stored };
  }
}
