import { normalizePhone } from '../leads/phone-normalizer.mjs';
import { MODALITIES, PRODUCTS } from '../leads/lead-states.mjs';

const NON_LEADS = new Set([
  'service_provider', 'existing_customer', 'support_or_complaint',
  'employment_or_job', 'spam_or_irrelevant',
]);

function chronological(messages) {
  return [...messages].sort((a, b) => {
    const left = new Date(a.sourceCreatedAt ?? a.createdAt).getTime();
    const right = new Date(b.sourceCreatedAt ?? b.createdAt).getTime();
    return left - right || a.sequenceNo - b.sequenceNo;
  });
}

function statusFor({ conversationType, phoneE164, product, modality }) {
  if (NON_LEADS.has(conversationType)) return 'CLOSED';
  if (phoneE164 && modality) return 'READY_FOR_WHATSAPP';
  if (phoneE164) return 'WAITING_MODALITY';
  if (product || modality || conversationType === 'commercial_lead') return 'WAITING_PHONE';
  return 'COLLECTING';
}

/** Analiza históricos importados sin invocar LeadService y por diseño sin
 * capacidad de encolar o enviar respuestas. */
export async function analyzeHistoricalLeads({ repository, classifier = null, processor = null, apply = false, limit = 500, returnPlan = false } = {}) {
  const leads = (await repository.listLeads({ limit })).filter((lead) => lead.sourceOrigin === 'imported');
  const summary = { mode: apply ? 'apply' : 'dry-run', examined: 0, changed: 0, skipped: 0, byStatus: {}, byType: {} };
  const operations = [];
  for (const lead of leads) {
    const events = await repository.listEvents(lead.id);
    if (events.some((event) => event.eventType === 'HISTORY_ANALYZED')) { summary.skipped += 1; continue; }
    const messages = chronological(await repository.listMessages(lead.id));
    const inbound = messages.filter((message) => message.direction === 'inbound' && String(message.content ?? '').trim());
    if (!inbound.length) { summary.skipped += 1; continue; }
    summary.examined += 1;
    let patch;
    if (processor) {
      const projection = await processor.analyze(lead.id);
      patch = { ...projection.patch, processingVersion: processor.version, lastProcessedAt: new Date().toISOString() };
    } else {
      let conversationType = lead.conversationType ?? 'unclear';
      let confidence = Number(lead.classificationConfidence ?? 0);
      let phoneE164 = lead.phoneE164;
      let product = lead.product;
      let modality = lead.modality;
      for (const current of inbound) {
        const upto = messages.filter((message) => new Date(message.sourceCreatedAt ?? message.createdAt) <= new Date(current.sourceCreatedAt ?? current.createdAt));
        const result = await classifier.classify({ lead, text: current.content, messages: upto });
        if ((result.confidence ?? 0) >= 0.6 || conversationType === 'unclear') {
          conversationType = result.conversationType;
          confidence = result.confidence ?? confidence;
        }
        const extracted = result.extraction ?? {};
        phoneE164 = normalizePhone(extracted.phone) ?? phoneE164;
        product = PRODUCTS.includes(extracted.product) ? extracted.product : product;
        modality = MODALITIES.includes(extracted.modality) ? extracted.modality : modality;
      }
      const status = statusFor({ conversationType, phoneE164, product, modality });
      patch = { conversationType, classificationConfidence: confidence, phoneE164, product, modality, status };
    }
    const { status, conversationType } = patch;
    summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1;
    summary.byType[conversationType] = (summary.byType[conversationType] ?? 0) + 1;
    const changed = Object.entries(patch).some(([key, value]) => (lead[key] ?? null) !== (value ?? null));
    if (!changed) continue;
    summary.changed += 1;
    const before = Object.fromEntries(Object.keys(patch).map((key) => [key, lead[key] ?? null]));
    operations.push({ leadId: lead.id, before, after: patch });
    if (apply) {
      await repository.applyHistoricalAnalysis({
        leadId: lead.id, before, after: patch, payload: { outboundMessagesCreated: 0 },
      });
    }
  }
  return returnPlan ? { summary, operations } : summary;
}

export async function applyHistoricalLeadPlan({ repository, plan }) {
  const summary = { ...plan.summary, mode: 'apply', applied: 0, conflicts: 0, skipped: 0 };
  for (const operation of plan.operations ?? []) {
    const lead = await repository.findLeadById(operation.leadId);
    if (!lead) { summary.conflicts += 1; continue; }
    const events = await repository.listEvents(lead.id);
    if (events.some((event) => event.eventType === 'HISTORY_ANALYZED')) { summary.skipped += 1; continue; }
    const unchanged = Object.entries(operation.before).every(([key, value]) => (lead[key] ?? null) === (value ?? null));
    if (!unchanged) { summary.conflicts += 1; continue; }
    const applied = await repository.applyHistoricalAnalysis({
      leadId: lead.id, before: operation.before, after: operation.after,
      payload: { outboundMessagesCreated: 0, planCreatedAt: plan.createdAt },
    });
    if (applied) summary.applied += 1;
    else summary.conflicts += 1;
  }
  return summary;
}

export { statusFor as historicalStatusFor };
