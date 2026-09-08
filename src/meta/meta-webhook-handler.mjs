import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConversationOriginResolver } from './conversation-origin-resolver.mjs';

/**
 * Recibe los webhooks de Meta (Instagram / Messenger):
 * handshake de verificación, firma HMAC (X-Hub-Signature-256), normalización
 * de eventos y despacho al ConversationObserver (idempotente y sin escritura en Meta).
 */
export class MetaWebhookHandler {
  constructor({ verifyToken, appSecret = null, observer, repository, originResolver = new ConversationOriginResolver(), profileResolver = null, deferProcessing = false }) {
    if (!verifyToken) throw new Error('META_VERIFY_TOKEN es requerido');
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
    this.observer = observer;
    this.repository = repository;
    this.originResolver = originResolver;
    this.profileResolver = profileResolver;
    this.deferProcessing = deferProcessing;
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
   * Devuelve { processed, ignored, duplicates }. Nunca genera respuestas.
   */
  async handle({ rawBody, signature, body = null }) {
    if (!this.#validSignature(rawBody, signature)) return { error: 'invalid_signature' };

    const payload = body ?? JSON.parse(rawBody);
    const summary = { processed: 0, ignored: 0, duplicates: 0 };

    for (const entry of payload.entry ?? []) {
      for (const messaging of entry.messaging ?? []) {
        const message = messaging.message;
        if (messaging.sender?.id && messaging.sender.id === messaging.recipient?.id) {
          summary.ignored += 1;
          continue;
        }
        const attachment = message?.attachments?.[0];
        const attachmentLabel = attachment
          ? attachment.type === 'image' ? '[Imagen adjunta]'
            : attachment.type === 'video' ? '[Video adjunto]'
              : attachment.type === 'audio' ? '[Audio adjunto]'
                : '[Archivo adjunto]'
          : '';
        const text = String(message?.text ?? '').trim() ? message.text : attachmentLabel;
        if (!text) {
          // Reacciones, entregas, lecturas y otros eventos sin contenido se ignoran.
          summary.ignored += 1;
          continue;
        }
        const event = this.#normalizeEvent(payload.object, entry, messaging, text);
        event.deferProcessing = this.deferProcessing;
        event.skipProcessing = !String(message?.text ?? '').trim() && Boolean(attachmentLabel);
        const existing = await this.repository.findLeadByExternalConversation({
          channel: event.channel, sourceConversationId: event.sourceConversationId,
        });
        if (event.direction === 'inbound') {
          const origin = this.originResolver.resolve({
            text: event.text,
            hasPriorMessages: Boolean(existing),
            automationTriggered: event.automationTriggered,
          });
          event.sourceOrigin = origin;
          event.automationTriggered = origin === 'ad_automation' || origin === 'comment_trigger';
        } else {
          event.sourceOrigin = existing?.sourceOrigin ?? 'webhook';
        }

        // Resolver el username de Instagram/Facebook al crear el lead (opcional;
        // sin resolver configurado, meta_username queda null).
        if (event.direction === 'inbound' && !existing && !event.sender.username && this.profileResolver) {
          try {
            event.sender.username = await this.profileResolver({ channel: event.channel, igUserId: event.metaUserId });
          } catch {
            // Sin username disponible no se bloquea el flujo.
          }
        }

        const result = await this.observer.observe(event);
        if (result.duplicate) summary.duplicates += 1;
        else if (result.ignored) summary.ignored += 1;
        else {
          summary.processed += 1;
        }
      }
    }
    return summary;
  }

  #normalizeEvent(object, entry, messaging, text) {
    const channel = object === 'instagram' ? 'instagram' : 'facebook_messenger';
    const isEcho = messaging.message?.is_echo === true;
    const senderId = isEcho ? messaging.recipient?.id : messaging.sender?.id;
    const referral = messaging.referral ?? messaging.message?.referral ?? null;
    const adsContext = referral?.ads_context_data ?? {};
    const compact = (value) => value === undefined || value === null || value === '' ? null : String(value).trim().slice(0, 500);
    const sourceAdId = compact(referral?.ad_id ?? adsContext.ad_id);
    const sourceContext = referral ? Object.fromEntries(Object.entries({
      source: compact(referral.source),
      type: compact(referral.type),
      ref: compact(referral.ref),
      adId: sourceAdId,
      adTitle: compact(adsContext.ad_title ?? referral.ad_title),
      postId: compact(referral.post_id),
      refererUri: compact(referral.referer_uri),
    }).filter(([, value]) => value !== null)) : {};
    return {
      channel,
      sourceAdId,
      sourceContext,
      externalMessageId: messaging.message?.mid ?? null,
      // Id canónico de conversación = PSID del usuario (mismo formato que usa el
      // auto-sync con participants.id): así no se duplican los leads.
      sourceConversationId: senderId,
      metaUserId: senderId,
      sender: { id: senderId },
      direction: isEcho ? 'outbound' : 'inbound',
      actorType: isEcho ? 'meta_business_agent' : 'user',
      actorId: isEcho ? messaging.sender?.id ?? entry.id : senderId,
      text,
      timestamp: messaging.timestamp ? new Date(messaging.timestamp).toISOString() : null,
    };
  }
}
