/**
 * Cliente de envío de mensajes por la API oficial de Meta (Instagram / Messenger).
 * En modo `mock` registra los mensajes sin red (desarrollo local); en modo
 * `live` llama a Graph API con el page access token. Los secretos nunca se loguean.
 */
export class MetaMessageSender {
  constructor({
    pageAccessToken = null,
    apiVersion = 'v21.0',
    baseUrl = 'https://graph.facebook.com',
    fetchImpl = fetch,
    mode = 'live',
    pageId = null,
    igUserId = null,
    timeoutMs = 15_000,
  } = {}) {
    this.pageAccessToken = pageAccessToken;
    this.apiVersion = apiVersion;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.mode = mode;
    this.pageId = pageId;       // id de la página (Messenger) — cuenta emisora
    this.igUserId = igUserId;   // id de la cuenta de Instagram Business — cuenta emisora
    this.timeoutMs = timeoutMs;
    this.sentMessages = [];
  }

  isConfigured() {
    return this.mode === 'mock' || Boolean(this.pageAccessToken);
  }

  /** Id de la cuenta emisora según el canal (metaUserId del lead es el receptor). */
  #emitterAccountId(lead) {
    return lead?.sourceChannel === 'instagram' ? this.igUserId : this.pageId;
  }

  /**
   * Envía un texto al usuario de Meta.
   * `lead.metaUserId` es el receptor (PSID / IG-scoped id); la cuenta emisora
   * (META_PAGE_ID / META_IG_USER_ID) va en la ruta de la Graph API.
   */
  async sendText({ lead, content, purpose = 'reply' }) {
    if (!this.isConfigured()) {
      const error = new Error('MetaMessageSender no está configurado (falta META_PAGE_ACCESS_TOKEN).');
      error.code = 'NOT_CONFIGURED';
      throw error;
    }
    const recipientId = lead?.metaUserId;
    if (!recipientId) throw new Error('Lead sin metaUserId; no se puede enviar por Meta.');

    const entry = { recipientId, content, purpose, at: new Date().toISOString() };
    this.sentMessages.push(entry);

    if (this.mode === 'mock') {
      return { ok: true, mock: true, messageId: `mock_${this.sentMessages.length}` };
    }

    const emitterAccountId = this.#emitterAccountId(lead);
    if (!emitterAccountId) {
      const error = new Error('Sin cuenta emisora: define META_PAGE_ID (Messenger) o META_IG_USER_ID (Instagram).');
      error.code = 'MISSING_EMITTER';
      throw error;
    }

    const url = `${this.baseUrl}/${this.apiVersion}/${emitterAccountId}/messages?access_token=${encodeURIComponent(this.pageAccessToken)}`;
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text: content } }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      const timeout = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
      const error = new Error(timeout ? 'Meta API timeout; resultado incierto.' : 'Fallo de red al enviar a Meta; resultado incierto.');
      error.code = timeout ? 'META_TIMEOUT' : 'META_NETWORK_ERROR';
      error.ambiguous = true;
      error.cause = cause;
      throw error;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`Meta API error ${response.status}: ${detail.slice(0, 300)}`);
      error.code = 'META_API_ERROR';
      error.httpStatus = response.status;
      error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
      throw error;
    }
    const data = await response.json();
    return { ok: true, mock: false, messageId: data.message_id ?? null };
  }

  /**
   * Resuelve el username de Instagram/Facebook del usuario (opcional).
   * Requiere token y llamada Graph API; devuelve null si no es posible.
   */
  async fetchUsername({ igUserId }) {
    if (this.mode === 'mock' || !this.pageAccessToken || !igUserId) return null;
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${igUserId}?fields=username&access_token=${encodeURIComponent(this.pageAccessToken)}`;
      const response = await this.fetchImpl(url);
      if (!response.ok) return null;
      const data = await response.json();
      return data.username ?? null;
    } catch {
      return null;
    }
  }
}
