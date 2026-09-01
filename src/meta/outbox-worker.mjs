const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000];

function safeError(error) {
  return String(error?.message ?? 'Error de envío desconocido').slice(0, 300);
}

function retryDelay(error, attemptCount) {
  if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) return error.retryAfterMs;
  return RETRY_DELAYS_MS[Math.max(0, Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1))];
}

/** Worker de outbox compatible con varias instancias. El repositorio reclama
 * filas usando SKIP LOCKED; los timeouts quedan UNKNOWN para evitar duplicados. */
export class MetaOutboxWorker {
  constructor({ repository, sender, intervalMs = 5_000, batchSize = 10,
    leaseMs = 120_000, maxAttempts = 5, clock = () => new Date() }) {
    this.repository = repository;
    this.sender = sender;
    this.intervalMs = intervalMs;
    this.batchSize = batchSize;
    this.leaseMs = leaseMs;
    this.maxAttempts = maxAttempts;
    this.clock = clock;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.runOnce().catch((error) => {
      console.error('[outbox] ciclo falló', safeError(error));
    }), this.intervalMs);
    this.timer.unref?.();
    this.runOnce().catch((error) => console.error('[outbox] arranque falló', safeError(error)));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce() {
    if (this.running) return { skipped: true };
    this.running = true;
    try {
      const messages = await this.repository.claimDueOutbound({ limit: this.batchSize, leaseMs: this.leaseMs });
      for (const message of messages) await this.#deliver(message);
      return { processed: messages.length };
    } finally {
      this.running = false;
    }
  }

  async #deliver(message) {
    const lead = await this.repository.findLeadById(message.leadId);
    if (!lead) {
      await this.repository.markOutboundFailed(message.id, { errorCode: 'LEAD_NOT_FOUND', errorMessage: 'Lead no encontrado' });
      return;
    }
    try {
      const result = await this.sender.sendText({ lead, content: message.content, purpose: message.purpose });
      const sentAt = this.clock();
      const sent = await this.repository.recordOutboundOutcome({
        messageId: message.id,
        status: 'SENT',
        providerMessageId: result?.messageId ?? result?.mid ?? null,
        sentAt,
        leadPatch: message.purpose === 'meta_confirmation'
          ? { metaConfirmationSentAt: sentAt, metaConfirmationBlocked: false }
          : {},
        events: [
          { eventType: 'OUTBOUND_SENT', payload: { messageId: message.id, purpose: message.purpose, providerMessageId: result?.messageId ?? result?.mid ?? null } },
          ...(message.purpose === 'meta_confirmation'
            ? [{ eventType: 'META_CONFIRMATION_SENT', payload: { messageId: message.id } }]
            : []),
        ],
      });
      return sent;
    } catch (error) {
      const errorCode = error?.code ?? (error?.httpStatus ? `HTTP_${error.httpStatus}` : 'SEND_ERROR');
      const errorMessage = safeError(error);
      if (error?.ambiguous === true || errorCode === 'META_TIMEOUT' || errorCode === 'META_NETWORK_ERROR') {
        await this.repository.recordOutboundOutcome({ messageId: message.id, status: 'UNKNOWN', errorCode, errorMessage,
          events: [{ eventType: 'OUTBOUND_UNKNOWN', payload: { messageId: message.id, purpose: message.purpose, errorCode } }] });
        return;
      }
      const retryable = error?.retryable === true || [408, 429].includes(error?.httpStatus) || error?.httpStatus >= 500;
      if (retryable && message.attemptCount < this.maxAttempts) {
        const nextAttemptAt = new Date(this.clock().getTime() + retryDelay(error, message.attemptCount));
        await this.repository.recordOutboundOutcome({ messageId: message.id, status: 'RETRY_WAIT', nextAttemptAt, errorCode, errorMessage,
          events: [{ eventType: 'OUTBOUND_RETRY_SCHEDULED', payload: { messageId: message.id, purpose: message.purpose, attemptCount: message.attemptCount, nextAttemptAt } }] });
        return;
      }
      await this.repository.recordOutboundOutcome({ messageId: message.id, status: 'FAILED', errorCode, errorMessage,
        events: [{ eventType: 'OUTBOUND_FAILED', payload: { messageId: message.id, purpose: message.purpose, attemptCount: message.attemptCount, errorCode } }] });
    }
  }
}

export { RETRY_DELAYS_MS };
