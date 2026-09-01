import { normalizePhone } from './phone-normalizer.mjs';
import { CONVERSATION_TYPES, CONTROL_MODES, MODALITIES, PRODUCTS } from './lead-states.mjs';
import { isWithinMessagingWindow } from '../shared/lima-time.mjs';

const CLARIFY_THRESHOLD = 0.60;
const MAX_CLARIFICATIONS = 2;
const MAX_MODALITY_ASKS = 2;

/**
 * Orquesta la capa de captación: idempotencia, mutex por conversación,
 * clasificación, captura incremental y transiciones de estado.
 * Determinístico; la IA entra solo a través de `router.classify`.
 */
export class LeadService {
  constructor({ repository, router, intake, sender = null, windowHours = 24, clock = () => new Date(), autoReplyEnabled = true, replyCooldownMs = 60_000 }) {
    this.repository = repository;
    this.router = router;
    this.intake = intake;
    this.sender = sender;
    this.windowHours = windowHours;
    this.clock = clock;
    this.autoReplyEnabled = autoReplyEnabled; // interruptor global de auto-respuesta
    this.replyCooldownMs = replyCooldownMs; // ventana de ráfaga: no repetir respuestas
    this.locks = new Map();
  }

  /** Activa/desactiva la respuesta automática (los mensajes se guardan siempre). */
  setAutoReplyEnabled(enabled) {
    this.autoReplyEnabled = Boolean(enabled);
    return this.autoReplyEnabled;
  }

  /** Serializa el procesamiento por conversación/lead (evita carreras entre webhooks). */
  async withLeadLock(key, fn) {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = prev.then(() => gate);
    this.locks.set(key, tail);
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  /** Punto de entrada del webhook de Meta (evento ya normalizado). */
  async handleInboundMessage(event) {
    const key = `${event.channel}:${event.sourceConversationId}`;
    return this.withLeadLock(key, () => this.#processInbound(event));
  }

  async #processInbound(event) {
    const {
      channel, externalMessageId, sourceConversationId, sourceOrigin,
      automationTriggered, sender = {}, text = '', timestamp = null,
    } = event;

    let lead = await this.repository.findLeadByExternalConversation({ channel, sourceConversationId });
    if (!lead) {
      lead = await this.repository.createLead({
        sourceChannel: channel,
        sourceOrigin: sourceOrigin ?? 'unknown',
        sourceConversationId,
        metaUserId: sender.id ?? null,
        metaUsername: sender.username ?? null,
        automationTriggered: automationTriggered === true,
      });
      await this.repository.appendEvent({
        leadId: lead.id, eventType: 'LEAD_CREATED',
        payload: { channel, origin: sourceOrigin, automationTriggered },
      });
    }

    // Idempotencia: el mismo external_message_id se procesa una sola vez.
    if (externalMessageId) {
      const existing = await this.repository.listMessages(lead.id);
      if (existing.some((m) => m.externalMessageId === externalMessageId)) {
        return { lead, replies: [], duplicate: true };
      }
    }

    await this.repository.appendMessage({
      leadId: lead.id, channel, direction: 'inbound', actorType: 'user',
      externalMessageId, content: text,
    });
    lead = await this.repository.updateLead(lead.id, {
      lastInboundAt: timestamp ? new Date(timestamp) : this.clock(),
    });

    // Interruptor global de auto-respuesta: guardar el mensaje y el lead,
    // pero NO responder (control manual desde el panel o el .env).
    if (!this.autoReplyEnabled) {
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'INBOUND_STORED', payload: { reason: 'auto_reply_disabled' } });
      return { lead: await this.repository.findLeadById(lead.id), replies: [], autoReplyDisabled: true };
    }

    // Control humano / cerrado: guardar pero no responder.
    if (lead.controlMode !== 'AUTO' || lead.status === 'CLOSED') {
      const reason = lead.controlMode !== 'AUTO' ? `control_mode_${lead.controlMode}` : 'closed';
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'INBOUND_IGNORED', payload: { reason } });
      return { lead, replies: [], ignored: true };
    }

    // Post-contacto: el prospecto vuelve a escribir por Meta tras el handoff.
    if (lead.status === 'CONTACTED_MANUALLY') {
      return this.#reply(lead, this.intake.postContactReply());
    }

    // Primer contacto generado por anuncio: mensaje predeterminado con saludo (según MD).
    if (lead.status === 'NEW' && lead.automationTriggered) {
      const updated = await this.repository.updateLead(lead.id, { status: 'COLLECTING', initialSocialMessageSent: true });
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'AUTO_TRIGGER_OPENING' });
      return this.#reply(updated, this.intake.initialCaptureBlock(this.clock()));
    }

    // Clasificación real (DeepSeek o fallback determinístico).
    const classification = await this.router.classify({ lead, text, messages: await this.repository.listMessages(lead.id) });
    lead = await this.repository.updateLead(lead.id, {
      conversationType: classification.conversationType,
      classificationConfidence: classification.confidence ?? null,
    });
    await this.repository.appendEvent({ leadId: lead.id, eventType: 'CLASSIFIED', payload: classification });

    // Ráfaga del anuncio (click-to-Messenger dispara el mismo mensaje varias veces):
    // si ya respondimos hace poco y este mensaje no aporta datos, se guarda pero NO se responde.
    const extraction = classification.extraction ?? {};
    const aportaDatos = Boolean(normalizePhone(extraction.phone))
      || PRODUCTS.includes(extraction.product)
      || MODALITIES.includes(extraction.modality);
    const burst = Boolean(lead.lastReplyAt)
      && (this.clock().getTime() - new Date(lead.lastReplyAt).getTime()) < this.replyCooldownMs;
    if (burst && classification.conversationType === 'commercial_lead' && !aportaDatos) {
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'INBOUND_COALESCED', payload: { reason: 'burst_window' } });
      return { lead: await this.repository.findLeadById(lead.id), replies: [], coalesced: true };
    }

    // Ambigüedad: pedir aclaración con límite de intentos.
    if (classification.conversationType === 'unclear' || (classification.confidence ?? 0) < CLARIFY_THRESHOLD) {
      // Primer contacto: aunque el mensaje sea ambiguo, se saluda y se envía la
      // captación (como establece el MD) — la aclaración es solo para mensajes posteriores.
      if (!lead.initialSocialMessageSent) {
        const updated = await this.repository.updateLead(lead.id, { status: 'COLLECTING', initialSocialMessageSent: true });
        await this.repository.appendEvent({ leadId: lead.id, eventType: 'CAPTURE_BLOCK_SENT', payload: { reason: 'first_contact_unclear' } });
        return this.#reply(updated, this.intake.initialCaptureBlock(this.clock()));
      }
      const count = lead.clarificationCount + 1;
      if (count > MAX_CLARIFICATIONS) {
        const updated = await this.repository.updateLead(lead.id, { clarificationCount: count, controlMode: 'HUMAN' });
        await this.repository.appendEvent({
          leadId: lead.id, eventType: 'CONTROL_CHANGED',
          payload: { controlMode: 'HUMAN', reason: 'max_clarifications' },
        });
        return this.#reply(updated, this.intake.handoffToHuman());
      }
      const updated = await this.repository.updateLead(lead.id, { clarificationCount: count });
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'CLARIFICATION_REQUESTED', payload: { count } });
      return this.#reply(updated, this.intake.clarificationReply());
    }

    // No-prospecto: respuesta institucional (o ninguna) y cierre.
    if (classification.conversationType !== 'commercial_lead') {
      const reply = this.intake.nonLeadReply(classification.conversationType);
      const closed = await this.repository.updateLead(lead.id, { status: 'CLOSED' });
      await this.repository.appendEvent({
        leadId: lead.id, eventType: 'LEAD_CLOSED',
        payload: { reason: 'non_lead', conversationType: classification.conversationType },
      });
      if (reply) return this.#reply(closed, reply);
      return { lead: closed, replies: [] };
    }

    // Intake comercial: captura incremental.
    return this.#applyExtraction(lead, classification.extraction ?? {});
  }

  /** Aplica datos extraídos sin perder los previos y decide el siguiente paso. */
  async #applyExtraction(lead, extraction) {
    const patch = {};

    const phone = normalizePhone(extraction.phone);
    if (phone && phone !== lead.phoneE164) {
      await this.repository.recordPhoneHistory({
        leadId: lead.id, previousPhone: lead.phoneE164, newPhone: phone, reason: 'PHONE_CAPTURED',
      });
      patch.phoneRaw = String(extraction.phone);
      patch.phoneE164 = phone;
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'PHONE_CAPTURED', payload: { phoneE164: phone } });
    }

    const product = PRODUCTS.includes(extraction.product) ? extraction.product : null;
    if (product && product !== lead.product) {
      patch.product = product;
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'PRODUCT_CAPTURED', payload: { product } });
    }

    const modality = MODALITIES.includes(extraction.modality) ? extraction.modality : null;
    if (modality && modality !== lead.modality) {
      patch.modality = modality;
      await this.repository.appendEvent({ leadId: lead.id, eventType: 'MODALITY_CAPTURED', payload: { modality } });
    }

    let current = Object.keys(patch).length ? await this.repository.updateLead(lead.id, patch) : lead;

    // WhatsApp es el dato prioritario: con teléfono basta para seguir el flujo.
    if (!current.phoneE164) {
      current = await this.repository.updateLead(current.id, {
        status: current.product || current.modality ? 'WAITING_PHONE' : 'COLLECTING',
      });
      let reply;
      if (!current.initialSocialMessageSent) {
        current = await this.repository.updateLead(current.id, { initialSocialMessageSent: true });
        reply = current.product || current.modality
          ? this.intake.greetedAskPhone(this.clock())
          : this.intake.initialCaptureBlock(this.clock());
      } else {
        reply = this.intake.askPhone();
      }
      return this.#reply(current, reply);
    }

    // El teléfono ya está: falta saber la modalidad (maquila/distribución/consumo).
    // Se pregunta un máximo de veces; si el cliente no responde, se obvia y pasa a Listo
    // para que el asesor lo contacte por WhatsApp con el enlace directo.
    if (!current.modality) {
      const asked = current.modalityAskCount ?? 0;
      if (asked >= MAX_MODALITY_ASKS) {
        current = await this.repository.updateLead(current.id, { status: 'READY_FOR_WHATSAPP' });
        await this.repository.appendEvent({
          leadId: current.id, eventType: 'MODALITY_SKIPPED',
          payload: { reason: 'max_asks', asked },
        });
        return this.#reply(current, this.intake.complete());
      }
      current = await this.repository.updateLead(current.id, { status: 'WAITING_MODALITY', modalityAskCount: asked + 1 });
      let reply;
      if (!current.initialSocialMessageSent) {
        current = await this.repository.updateLead(current.id, { initialSocialMessageSent: true });
        reply = this.intake.greetedAskModality(this.clock());
      } else {
        reply = this.intake.askModality();
      }
      return this.#reply(current, reply);
    }

    // Cliente que vuelve con los datos ya completos: no repetir la captura.
    if (current.status === 'READY_FOR_WHATSAPP') {
      await this.repository.appendEvent({ leadId: current.id, eventType: 'READY_REVISIT' });
      return this.#reply(current, this.intake.readyRevisitReply());
    }

    if (!['READY_FOR_WHATSAPP', 'CONTACT_OPENED', 'CONTACTED_MANUALLY', 'CLOSED'].includes(current.status)) {
      current = await this.repository.updateLead(current.id, { status: 'READY_FOR_WHATSAPP' });
    }
    await this.repository.appendEvent({ leadId: current.id, eventType: 'READY_FOR_WHATSAPP' });
    return this.#reply(current, this.intake.complete());
  }

  /** Persiste la respuesta y la envía por Meta si hay sender configurado. */
  async #reply(lead, content) {
    const message = await this.repository.enqueueOutbound({
      leadId: lead.id, channel: lead.sourceChannel,
      actorType: 'automation', actorId: 'social_lead_intake', content, purpose: 'reply',
      leadPatch: { lastReplyAt: this.clock() },
    });
    return { lead: await this.repository.findLeadById(lead.id), replies: [{ content }], queued: true, message };
  }

  // ── Acciones del panel ──────────────────────────────────────────────

  async markWhatsappOpened(leadId, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      if (lead.phoneE164 && !['CONTACTED_MANUALLY', 'CLOSED'].includes(lead.status)) {
        const updated = await this.repository.updateLead(leadId, { status: 'CONTACT_OPENED', whatsappOpenedAt: this.clock() });
        await this.repository.appendEvent({ leadId, eventType: 'WHATSAPP_OPENED', payload: { actor } });
        return updated;
      }
      return lead;
    });
  }

  async markContacted(leadId, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      let lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      if (['READY_FOR_WHATSAPP', 'CONTACT_OPENED'].includes(lead.status)) {
        lead = await this.repository.updateLead(leadId, { status: 'CONTACTED_MANUALLY', contactedAt: this.clock() });
        await this.repository.appendEvent({ leadId, eventType: 'CONTACT_CONFIRMED', payload: { actor } });
        await this.#sendMetaConfirmation(lead);
      }
      return lead;
    });
  }

  /** Confirmación en Meta solo si el WhatsApp salió y la ventana de 24h sigue abierta. */
  async #sendMetaConfirmation(lead) {
    if (lead.metaConfirmationSentAt) return lead;
    const within = isWithinMessagingWindow(lead.lastInboundAt, this.windowHours, this.clock());
    if (!within) {
      const updated = await this.repository.updateLead(lead.id, { metaConfirmationBlocked: true });
      await this.repository.appendEvent({
        leadId: lead.id, eventType: 'META_CONFIRMATION_BLOCKED',
        payload: { reason: 'messaging_window_expired', lastInboundAt: lead.lastInboundAt },
      });
      return updated;
    }
    const messages = await this.repository.listMessages(lead.id);
    if (messages.some((message) => message.purpose === 'meta_confirmation' &&
      ['PENDING', 'SENDING', 'RETRY_WAIT', 'SENT'].includes(message.deliveryStatus))) return lead;
    await this.repository.enqueueOutbound({
      leadId: lead.id, channel: lead.sourceChannel,
      actorType: 'automation', actorId: 'social_lead_intake',
      content: this.intake.metaConfirmationMessage(), purpose: 'meta_confirmation',
      eventPayload: { reason: 'contact_confirmed' },
      leadPatch: { metaConfirmationBlocked: false },
    });
    return this.repository.findLeadById(lead.id);
  }

  async correctPhone(leadId, rawPhone, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      const phone = normalizePhone(rawPhone);
      if (!phone) throw new Error('Teléfono inválido');
      const patch = { phoneRaw: String(rawPhone), phoneE164: phone };
      if (phone !== lead.phoneE164) {
        await this.repository.recordPhoneHistory({
          leadId, previousPhone: lead.phoneE164, newPhone: phone, reason: 'PHONE_CORRECTED',
        });
        await this.repository.appendEvent({ leadId, eventType: 'PHONE_CORRECTED', payload: { phoneE164: phone, actor } });
      }
      if (['COLLECTING', 'WAITING_PHONE', 'WAITING_MODALITY', 'CONTACT_OPENED'].includes(lead.status)) {
        patch.status = lead.modality ? 'READY_FOR_WHATSAPP' : 'WAITING_MODALITY';
      }
      return this.repository.updateLead(leadId, patch);
    });
  }

  async setControlMode(leadId, controlMode, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      if (!CONTROL_MODES.includes(controlMode)) throw new Error('Modo de control inválido');
      const updated = await this.repository.updateLead(leadId, { controlMode });
      await this.repository.appendEvent({ leadId, eventType: 'CONTROL_CHANGED', payload: { controlMode, actor } });
      return updated;
    });
  }

  async closeLead(leadId, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      const updated = await this.repository.updateLead(leadId, { status: 'CLOSED' });
      await this.repository.appendEvent({ leadId, eventType: 'LEAD_CLOSED', payload: { reason: 'manual', actor } });
      return updated;
    });
  }

  async deleteLead(leadId, actor = 'operator') {
    const lead = await this.repository.findLeadById(leadId);
    if (!lead) throw new Error('Lead not found');
    await this.repository.deleteLead(leadId);
    return { deleted: true, id: leadId };
  }

  /** El operador responde por Messenger desde el panel. Persiste siempre; si el envío falla, queda como pendiente. */
  async sendMessage(leadId, content, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      if (!lead.metaUserId) throw new Error('El lead no tiene usuario de Messenger para responder');
      const message = await this.repository.enqueueOutbound({
        leadId, channel: lead.sourceChannel, actorType: 'operator', actorId: actor,
        content, purpose: 'operator_reply', eventPayload: { actor },
      });
      return { lead: await this.repository.findLeadById(leadId), message, queued: true };
    });
  }

  /** El bot pide el número de WhatsApp al prospecto (avanza el funnel desde el panel). */
  async requestWhatsapp(leadId, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      if (lead.phoneE164) throw new Error('El lead ya tiene WhatsApp');
      if (!lead.metaUserId) throw new Error('El lead no tiene usuario de Messenger');
      const content = this.intake.askPhone();
      const message = await this.repository.enqueueOutbound({
        leadId, channel: lead.sourceChannel, actorType: 'operator', actorId: actor,
        content, purpose: 'request_phone', eventType: 'PHONE_REQUESTED', eventPayload: { actor },
      });
      return { lead: await this.repository.findLeadById(leadId), message, queued: true };
    });
  }

  async retryMessage(leadId, messageId, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      const messages = await this.repository.listMessages(leadId);
      if (!messages.some((message) => message.id === messageId)) throw new Error('Mensaje no encontrado');
      const message = await this.repository.retryOutbound(messageId);
      await this.repository.appendEvent({ leadId, eventType: 'OUTBOUND_REQUEUED', payload: { messageId, actor } });
      return { lead, message, queued: true };
    });
  }

  /** Deshacer el cierre: un lead CLOSED vuelve a Nuevo. */
  async reopenLead(leadId, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      if (lead.status !== 'CLOSED') throw new Error('El lead no está cerrado');
      const updated = await this.repository.updateLead(leadId, { status: 'NEW' });
      await this.repository.appendEvent({ leadId, eventType: 'LEAD_REOPENED', payload: { actor } });
      return updated;
    });
  }

  async editLead(leadId, { product = null, modality = null, conversationType = null } = {}, actor = 'operator') {
    return this.withLeadLock(`admin:${leadId}`, async () => {
      const lead = await this.repository.findLeadById(leadId);
      if (!lead) throw new Error('Lead not found');
      const patch = {};
      if (product !== null) {
        if (!PRODUCTS.includes(product)) throw new Error('Producto inválido');
        patch.product = product;
      }
      if (modality !== null) {
        if (!MODALITIES.includes(modality)) throw new Error('Modalidad inválida');
        patch.modality = modality;
      }
      if (conversationType !== null) {
        if (!CONVERSATION_TYPES.includes(conversationType)) throw new Error('Tipo de conversación inválido');
        patch.conversationType = conversationType;
      }
      const updated = await this.repository.updateLead(leadId, patch);
      await this.repository.appendEvent({ leadId, eventType: 'LEAD_EDITED', payload: { patch, actor } });
      return updated;
    });
  }
}
