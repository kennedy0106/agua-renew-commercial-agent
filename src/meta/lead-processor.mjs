import { deterministicClassify, hasClearlyForeignBusinessContext } from '../ai/intake-classifier.mjs';
import { normalizePhone } from '../leads/phone-normalizer.mjs';
import { modalityLabel, productLabel } from '../leads/lead-states.mjs';

export const LEAD_PROCESSOR_VERSION = 'observer-v1';
const META_PRODUCTS = new Set(['20l', '1l', '625ml', '10_5l']);
const META_MODALITIES = new Set(['maquila', 'distribution_agua_renew']);
const NON_LEADS = new Set([
  'service_provider', 'existing_customer', 'support_or_complaint',
  'employment_or_job', 'spam_or_irrelevant',
]);
const MANUAL_STATUSES = new Set(['CONTACT_OPENED', 'CONTACTED_MANUALLY', 'CLOSED']);

function chronological(messages) {
  return [...messages].sort((a, b) => {
    const left = new Date(a.sourceCreatedAt ?? a.createdAt).getTime();
    const right = new Date(b.sourceCreatedAt ?? b.createdAt).getTime();
    return left - right || Number(a.sequenceNo ?? 0) - Number(b.sequenceNo ?? 0);
  });
}

function factualSummary({ conversationType, phoneE164, product, modality }) {
  const facts = [];
  if (conversationType === 'commercial_lead') facts.push('Intención comercial detectada');
  if (product) facts.push(`producto: ${productLabel(product)}`);
  if (modality) facts.push(`modalidad: ${modalityLabel(modality)}`);
  if (phoneE164) facts.push('WhatsApp confirmado');
  return facts.length ? `${facts.join('; ')}.` : 'La conversación todavía no contiene suficientes datos comerciales confirmados.';
}

function fallbackWhatsappDraft(lead, { phoneE164, product, modality }) {
  if (!phoneE164 || !product || !modality) return null;
  const name = String(lead.metaUsername ?? '').trim();
  const greeting = name ? `Hola, ${name}.` : 'Hola.';
  return `${greeting} Soy parte del equipo comercial de Agua ReNew. Revisé su consulta sobre ${productLabel(product)} para ${modalityLabel(modality)}. ¿Podemos continuar con los detalles de su pedido por WhatsApp?`;
}

export function deriveObserverStatus({ currentStatus = 'NEW', conversationType, phoneE164, product, modality }) {
  if (currentStatus === 'CONTACTED_MANUALLY' || currentStatus === 'CLOSED') return currentStatus;
  if (NON_LEADS.has(conversationType)) return 'CLOSED';
  if (phoneE164 && product && modality) return currentStatus === 'CONTACT_OPENED' ? 'CONTACT_OPENED' : 'READY_FOR_WHATSAPP';
  if (product && modality && !phoneE164) return 'WAITING_PHONE';
  if (phoneE164 || product || modality || conversationType === 'commercial_lead') return 'COLLECTING';
  return 'NEW';
}

/** Procesa el transcript persistido. No redacta, encola ni envía mensajes. */
export class LeadProcessor {
  constructor({ repository, classifier = null, clock = () => new Date(), version = LEAD_PROCESSOR_VERSION } = {}) {
    this.repository = repository;
    this.classifier = classifier;
    this.clock = clock;
    this.version = version;
  }

  async process(leadId) {
    const analysis = await this.analyze(leadId);
    const { lead, patch, inboundCount } = analysis;
    const processedAt = this.clock();
    patch.processingVersion = this.version;
    patch.lastProcessedAt = processedAt;
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, lead[key] ?? null]));
    const changes = Object.fromEntries(Object.entries(patch).filter(([key, value]) => {
      const previous = lead[key] instanceof Date ? lead[key].toISOString() : lead[key];
      const next = value instanceof Date ? value.toISOString() : value;
      return key === 'lastProcessedAt' || (previous ?? null) !== (next ?? null);
    }));

    if (patch.phoneE164 && patch.phoneE164 !== lead.phoneE164) {
      await this.repository.recordPhoneHistory({
        leadId,
        previousPhone: lead.phoneE164,
        newPhone: patch.phoneE164,
        reason: lead.phoneE164 ? 'PHONE_UPDATED_FROM_CONVERSATION' : 'PHONE_CAPTURED',
      });
    }
    const updated = await this.repository.updateLead(leadId, patch);
    await this.repository.appendEvent({
      leadId,
      eventType: 'LEAD_PROCESSED',
      payload: {
        version: this.version,
        messageCount: inboundCount,
        detected: { phone: Boolean(patch.phoneE164), product: patch.product, modality: patch.modality, conversationType: patch.conversationType },
        changes: Object.keys(changes).filter((key) => key !== 'lastProcessedAt'),
        previousStatus: before.status,
        status: patch.status,
      },
    });
    return { lead: updated, changes };
  }

  /** Proyección pura para backfills y previsualizaciones. */
  async analyze(leadId) {
    const lead = await this.repository.findLeadById(leadId);
    if (!lead) throw new Error('Lead not found');
    const messages = chronological(await this.repository.listMessages(leadId));
    const inbound = messages.filter((message) => message.direction === 'inbound' && String(message.content ?? '').trim());

    let phoneE164 = lead.phoneE164;
    let phoneRaw = lead.phoneRaw;
    let product = lead.product;
    let modality = lead.modality;
    let conversationType = lead.conversationType ?? 'unclear';
    let confidence = Number(lead.classificationConfidence ?? 0);

    for (const message of inbound) {
      const result = deterministicClassify(message.content);
      const extracted = result.extraction ?? {};
      const phone = normalizePhone(extracted.phone);
      if (phone) {
        phoneE164 = phone;
        phoneRaw = String(extracted.phone);
      }
      if (META_PRODUCTS.has(extracted.product)) product = extracted.product;
      if (META_MODALITIES.has(extracted.modality)) modality = extracted.modality;
      if (result.conversationType === 'commercial_lead' || result.confidence >= confidence || conversationType === 'unclear') {
        conversationType = result.conversationType;
        confidence = Number(result.confidence ?? confidence);
      }
    }

    const hasRenewEvidence = Boolean(phoneE164 || product || modality || conversationType === 'commercial_lead');
    if (!hasRenewEvidence && messages.some((message) => hasClearlyForeignBusinessContext(message.content))) {
      conversationType = 'spam_or_irrelevant';
      confidence = Math.max(confidence, 0.95);
    }

    if ((product || modality) && !NON_LEADS.has(conversationType)) {
      conversationType = 'commercial_lead';
      confidence = Math.max(confidence, 0.8);
    }

    let analysisResult = null;
    if (this.classifier && inbound.length) {
      analysisResult = await this.classifier.classify({
        lead,
        text: inbound.at(-1).content,
        messages,
      });
      if (analysisResult.analysisSource === 'ai') {
        const extracted = analysisResult.extraction ?? {};
        const aiPhone = normalizePhone(extracted.phone);
        if (aiPhone) { phoneE164 = aiPhone; phoneRaw = String(extracted.phone); }
        if (META_PRODUCTS.has(extracted.product)) product = extracted.product;
        if (META_MODALITIES.has(extracted.modality)) modality = extracted.modality;
        conversationType = analysisResult.conversationType;
        confidence = Number(analysisResult.confidence ?? confidence);
      }
    }

    const status = deriveObserverStatus({
      currentStatus: lead.status,
      conversationType,
      phoneE164,
      product,
      modality,
    });

    const summary = analysisResult?.analysisSource === 'ai' && analysisResult.summary
      ? analysisResult.summary
      : factualSummary({ conversationType, phoneE164, product, modality });
    const generatedDraft = analysisResult?.analysisSource === 'ai'
      ? analysisResult.suggestedWhatsappMessage
      : null;
    const suggestedWhatsappMessage = phoneE164 && product && modality
      ? (generatedDraft || fallbackWhatsappDraft(lead, { phoneE164, product, modality }))
      : null;
    const patch = {
      conversationType,
      classificationConfidence: confidence || 0.4,
      phoneRaw,
      phoneE164,
      product,
      modality,
      status,
      analysisSummary: summary,
      suggestedWhatsappMessage,
      analysisSource: analysisResult?.analysisSource ?? 'deterministic',
      analysisProvider: analysisResult?.provider ?? null,
      analysisModel: analysisResult?.model ?? null,
      aiAnalysis: analysisResult?.analysisSource === 'ai' ? {
        reasonCode: analysisResult.reasonCode ?? null,
        confidence: analysisResult.confidence ?? null,
        extraction: analysisResult.extraction ?? {},
      } : {},
      aiAnalyzedAt: analysisResult?.analysisSource === 'ai' ? this.clock() : null,
    };
    return { lead, patch, inboundCount: inbound.length };
  }
}
