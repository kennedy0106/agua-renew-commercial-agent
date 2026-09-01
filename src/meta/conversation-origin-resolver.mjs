/**
 * Resolución heurística del origen de la conversación (I6).
 * Meta no etiqueta de forma fiable el origen en el webhook; se infiere:
 * - mensaje explícitamente marcado como automatización, o
 * - primer mensaje cuyo texto coincide con la plantilla del anuncio,
 *   o
 * - primer mensaje libre (organic DM).
 * Con historial previo no se puede determinar → unknown.
 */
export class ConversationOriginResolver {
  constructor({ adTriggerPhrases = DEFAULT_AD_TRIGGER_PHRASES } = {}) {
    this.adTriggerPhrases = adTriggerPhrases.map((phrase) => phrase.toLowerCase());
  }

  resolve({ text = '', hasPriorMessages = false, automationTriggered = false }) {
    if (automationTriggered) return 'ad_automation';
    if (!hasPriorMessages) {
      const lower = text.toLowerCase();
      if (this.adTriggerPhrases.some((phrase) => lower.includes(phrase))) return 'ad_automation';
      return 'organic_dm';
    }
    return 'unknown';
  }
}

const DEFAULT_AD_TRIGGER_PHRASES = [
  'más información del negocio',
  'información del negocio',
  'me interesa',
  'quiero información',
  'quisiera información',
];
