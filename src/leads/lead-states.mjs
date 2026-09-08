/** Glosario único de estados y valores canónicos de la capa de leads (Fase 1). */

export const LEAD_STATUSES = [
  'NEW', 'COLLECTING', 'WAITING_PHONE', 'WAITING_MODALITY', 'READY_FOR_WHATSAPP',
  'CONTACT_OPENED', 'CONTACTED_MANUALLY', 'CLOSED',
];

export const CONTROL_MODES = ['AUTO', 'HUMAN', 'PAUSED'];

export const CONVERSATION_TYPES = [
  'commercial_lead', 'service_provider', 'existing_customer',
  'support_or_complaint', 'employment_or_job', 'spam_or_irrelevant', 'unclear',
];

export const PRODUCTS = ['20l', '1l', '625ml', '10_5l'];

export const MODALITIES = ['maquila', 'distribution_agua_renew', 'final_customer'];

export const ORIGINS = ['ad_automation', 'comment_trigger', 'organic_dm', 'manual_contact', 'unknown', 'imported', 'webhook'];

export const CHANNELS = ['instagram', 'facebook_messenger'];

const TERMINAL_STATUSES = new Set(['CLOSED']);

/** Transiciones permitidas entre estados de lead (Fase 1). */
const TRANSITIONS = {
  NEW: ['COLLECTING', 'WAITING_PHONE', 'WAITING_MODALITY', 'READY_FOR_WHATSAPP', 'CLOSED'],
  COLLECTING: ['NEW', 'WAITING_PHONE', 'WAITING_MODALITY', 'READY_FOR_WHATSAPP', 'CLOSED'],
  WAITING_PHONE: ['NEW', 'COLLECTING', 'WAITING_MODALITY', 'READY_FOR_WHATSAPP', 'CLOSED'],
  WAITING_MODALITY: ['NEW', 'COLLECTING', 'WAITING_PHONE', 'READY_FOR_WHATSAPP', 'CONTACT_OPENED', 'CLOSED'],
  READY_FOR_WHATSAPP: ['NEW', 'COLLECTING', 'WAITING_PHONE', 'WAITING_MODALITY', 'CONTACT_OPENED', 'CLOSED'],
  CONTACT_OPENED: ['NEW', 'COLLECTING', 'READY_FOR_WHATSAPP', 'WAITING_PHONE', 'WAITING_MODALITY', 'CONTACTED_MANUALLY', 'CLOSED'],
  CONTACTED_MANUALLY: ['CLOSED'],
  CLOSED: ['NEW'],
};

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export function isValidTransition(from, to) {
  return from === to || (TRANSITIONS[from] ?? []).includes(to);
}

/** Nombre legible de producto para mensajes al prospecto. */
export function productLabel(product) {
  return { '20l': 'bidón de 20 L', '1l': 'botella de 1 L', '625ml': 'botella de 625 ml', '10_5l': 'galonera de 10.5 L' }[product] ?? null;
}

/** Nombre en plural (para mensajes de WhatsApp: "botellas de 625 ml", "bidones de 20 L"). */
export function productLabelPlural(product) {
  return { '20l': 'bidones de 20 L', '1l': 'botellas de 1 L', '625ml': 'botellas de 625 ml', '10_5l': 'galoneras de 10.5 L' }[product] ?? null;
}

/** Nombre legible de modalidad. */
export function modalityLabel(modality) {
  return {
    maquila: 'trabajar con su propia marca (maquila)',
    distribution_agua_renew: 'distribuir con la marca Agua ReNew',
    final_customer: 'comprar para consumo propio',
  }[modality] ?? null;
}
