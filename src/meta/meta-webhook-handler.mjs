import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConversationOriginResolver } from './conversation-origin-resolver.mjs';

/**
 * Recibe los webhooks de Meta (Instagram / Messenger):
 * handshake de verificación, firma HMAC (X-Hub-Signature-256), normalización
 * de eventos y despacho al LeadService (idempotente y serializado por lead).
 */
export class MetaWebhookHandler {
  constructor({ verifyToken, appSecret = null, leadService, repository, originResolver = new ConversationOriginResolver(), profileResolver = null }) {
    if (!verifyToken) throw new Error('META_VERIFY_TOKEN es requerido');
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
    this.leadService = leadService;
    this.repository = repository;
    this.originResolver = originResolver;
    this.profileResolver = profileResolver;
  }

  /** Handshake de suscripción del webhook (hub.mode / hub.verify_token / hub.challenge). */
  verifySubscription(query = {}) {
    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === this.verifyToken) {
      return { verified: true, challenge: query['hub.challenge'] };
    }
    return { verified: false };
  }

  #validSignature(rawBody, signatureHeader) {
    if (!this.appSecret) return true; // sin secreto configurado no se exige firma
    if (typeof rawBody !== 'string' || !signatureHeader) return false;
    const expected = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Procesa el payload completo del webhook.
   * Devuelve { processed, ignored, duplicates, replies }.
   */
  async handle({ rawBody, signature, body = null }) {
    if (!this.#validSignature(rawBody, signature)) return { error: 'invalid_signature' };

    const payload = body ?? JSON.parse(rawBody);
    const summary = { processed: 0, ignored: 0, duplicates: 0, replies: [] };

    for (const entry of payload.entry ?? []) {
      for (const messaging of entry.messaging ?? []) {
        const message = messaging.message;
        // Ecos de nuestros propios envíos (is_echo) o mensajes cuyo remitente es
        // nuestra propia cuenta (sender === recipient): ignorar para que el bot
        // nunca se responda a sí mismo.
        if (message?.is_echo === true || (messaging.sender?.id && messaging.sender.id === messaging.recipient?.id)) {
          summary.ignored += 1;
          continue;
        }
        const text = message?.text;
        if (!text) {
          // Adjuntos u otros eventos (reacciones, entregas): se registran como ignorados.
          summary.ignored += 1;
          continue;
        }
        const event = this.#normalizeEvent(payload.object, entry, messaging, text);
        const existing = await this.repository.findLeadByExternalConversation({
          channel: event.channel, sourceConversationId: event.sourceConversationId,
        });
        const origin = this.originResolver.resolve({
          text: event.text,
          hasPriorMessages: Boolean(existing),
          automationTriggered: event.automationTriggered,
        });
        event.sourceOrigin = origin;
        event.automationTriggered = origin === 'ad_automation' || origin === 'comment_trigger';

        // Resolver el username de Instagram/Facebook al crear el lead (opcional;
        // sin resolver configurado, meta_username queda null).
        if (!existing && !event.sender.username && this.profileResolver) {
          try {
            event.sender.username = await this.profileResolver({ channel: event.channel, igUserId: event.metaUserId });
          } catch {
            // Sin username disponible no se bloquea el flujo.
          }
        }

        const result = await this.leadService.handleInboundMessage(event);
        if (result.duplicate) summary.duplicates += 1;
        else if (result.ignored) summary.ignored += 1;
        else {
          summary.processed += 1;
          summary.replies.push(...result.replies);
        }
      }
    }
    return summary;
  }

  #normalizeEvent(object, entry, messaging, text) {
    const channel = object === 'instagram' ? 'instagram' : 'facebook_messenger';
    const senderId = messaging.sender?.id;
    return {
      channel,
      externalMessageId: messaging.message?.mid ?? null,
      // Id canónico de conversación = PSID del usuario (mismo formato que usa el
      // auto-sync con participants.id): así no se duplican los leads.
      sourceConversationId: senderId,
      metaUserId: senderId,
      sender: { id: senderId },
      text,
      timestamp: messaging.timestamp ? new Date(messaging.timestamp).toISOString() : null,
    };
  }
}
