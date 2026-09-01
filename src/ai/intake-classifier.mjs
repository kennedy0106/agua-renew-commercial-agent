import { normalizePhone } from '../leads/phone-normalizer.mjs';
import { CONVERSATION_TYPES, MODALITIES, PRODUCTS } from '../leads/lead-states.mjs';

const SYSTEM_PROMPT = `Eres el clasificador de conversaciones entrantes de Agua ReNew (agua embotellada, maquila y distribución) que llegan desde anuncios de Facebook e Instagram.

Clasifica la conversación y extrae datos en JSON. Usa contexto: si el prospecto menciona tener una agencia o negocio, eso NO significa que le esté ofreciendo un servicio a Agua ReNew; puede ser un cliente potencial (maquila con su marca).

RespondE SOLO JSON:
{
  "conversation_type": "commercial_lead | service_provider | existing_customer | support_or_complaint | employment_or_job | spam_or_irrelevant | unclear",
  "confidence": 0.0-1.0,
  "reason_code": "string corto en inglés",
  "offering_services_to_renew": true/false,
  "extraction": {
    "phone": "número de WhatsApp o null; normalízalo: 9 dígitos peruanos",
    "product": "20l | 1l | 625ml | 10_5l | null (solo si es explícito; 'botellitas' NO es suficiente)",
    "modality": "maquila | distribution_agua_renew | final_customer | null (solo si es explícito)"
  }
}

Reglas:
- Un mensaje automático de anuncio no es intención humana.
- No inventes producto ni modalidad; usa null ante la duda.
- "quiero vender agua con mi marca" => commercial_lead, modality maquila.
- "somos una agencia y podemos manejar sus redes" => service_provider.
- "tengo una agencia y quiero botellas con mi logo" => commercial_lead (compra, no vende servicio).
- "somos una agencia" (sin oferta concreta ni datos de compra) => unclear; esperar contexto.
- "me interesa el negocio" (frase genérica de campaña) => unclear; esperar el siguiente mensaje real del usuario.`;

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Clasificación determinística de respaldo (sin IA): reglas simples documentadas. */
export function deterministicClassify(text = '') {
  const lower = ` ${text.toLowerCase()} `;
  const extraction = {
    phone: normalizePhone(text),
    product: null,
    modality: null,
  };

  // Producto explícito (patrones canónicos con cantidad, no inferencias).
  if (/bid[oó]n/.test(lower) || /20\s*l/.test(lower)) extraction.product = '20l';
  else if (/625/.test(lower)) extraction.product = '625ml';
  else if (/galonera|10[\s.,]?5\s*l/.test(lower)) extraction.product = '10_5l';
  else if (/\b1\s*l\b|\b1\s*litro\b/.test(lower)) extraction.product = '1l';

  // Modalidad explícita.
  if (/mi\s*(propia)?\s*marca|maquila|con\s*mi\s*marca|(mi|nuestro|su)\s*logo|personalizad/.test(lower)) {
    extraction.modality = 'maquila';
  } else if (/distribu/.test(lower)) {
    extraction.modality = 'distribution_agua_renew';
  } else if (/consumo\s*propio|para\s*mi\s*casa|para\s*tomar|uso\s*personal/.test(lower)) {
    extraction.modality = 'final_customer';
  }

  const hasData = Boolean(extraction.phone || extraction.product || extraction.modality);

  // Proveedor que ofrece servicios (requiere oferta explícita, no solo mencionar el rubro).
  if (!hasData && /ofrecem|podemos\s*(manejar|gestionar|ayudarles)|manejo\s*de\s*(sus\s*)?redes|administraci[oó]n\s*de\s*redes|agencia\s*de\s*(marketing|publicidad|campañas)|vender(le|les)?\s*servicios/.test(lower)) {
    return { conversationType: 'service_provider', confidence: 0.7, reasonCode: 'offers_service_to_renew', offeringServicesToRenew: true, extraction };
  }
  if (!hasData && /gana\s*(miles|dinero)|premio|clic\s*aqu[ií]|www\.|incre[ií]ble\s*oferta|pr[eé]stamo/.test(lower)) {
    return { conversationType: 'spam_or_irrelevant', confidence: 0.8, reasonCode: 'spam_pattern', offeringServicesToRenew: false, extraction };
  }
  if (!hasData && /busco\s*trabajo|vacante|curr[ií]culum|curriculum|empleo|practicante/.test(lower)) {
    return { conversationType: 'employment_or_job', confidence: 0.8, reasonCode: 'seeks_job', offeringServicesToRenew: false, extraction };
  }
  if (!hasData && /reclamo|queja|no\s*me\s*(lleg[oó]|funciona)|soporte|devoluci[oó]n/.test(lower)) {
    return { conversationType: 'support_or_complaint', confidence: 0.8, reasonCode: 'support_or_complaint', offeringServicesToRenew: false, extraction };
  }
  if (!hasData && /soy\s*cliente|ya\s*compr[ée]|mi\s*pedido|quiero\s*mi\s*pedido/.test(lower)) {
    return { conversationType: 'existing_customer', confidence: 0.7, reasonCode: 'existing_customer', offeringServicesToRenew: false, extraction };
  }

  // Datos presentes => intención comercial real.
  if (hasData) {
    return { conversationType: 'commercial_lead', confidence: 0.8, reasonCode: 'commercial_data_present', offeringServicesToRenew: false, extraction };
  }
  return { conversationType: 'unclear', confidence: 0.4, reasonCode: 'ambiguous', offeringServicesToRenew: false, extraction };
}

/** Clasificador con IA (DeepSeek, temperatura 0) y respaldo determinístico. */
export class IntakeClassifier {
  constructor({ provider, systemPrompt = SYSTEM_PROMPT }) {
    this.provider = provider;
    this.systemPrompt = systemPrompt;
  }

  async classify({ lead, text = '', messages = [] }) {
    if (!this.provider) return deterministicClassify(text);

    const context = [
      `Canal: ${lead?.sourceChannel ?? 'unknown'}`,
      `Origen: ${lead?.sourceOrigin ?? 'unknown'}`,
      `Mensaje del usuario: ${text}`,
      messages.length > 1 ? `Historial (${messages.length} mensajes): ${messages.slice(-6).map((m) => `${m.direction === 'inbound' ? 'usuario' : 'sistema'}: ${m.content}`).join(' | ')}` : '',
    ].filter(Boolean).join('\n');

    try {
      const result = await this.provider.interpret({ systemPrompt: this.systemPrompt, userMessage: context });
      const parsed = JSON.parse(result.content);
      return this.#normalize(parsed);
    } catch {
      // Fallback conservador: no perder el mensaje ni inventar clasificación.
      return deterministicClassify(text);
    }
  }

  #normalize(parsed) {
    const conversationType = CONVERSATION_TYPES.includes(parsed?.conversation_type) ? parsed.conversation_type : 'unclear';
    const extraction = parsed?.extraction ?? {};
    return {
      conversationType,
      confidence: clamp(parsed?.confidence ?? 0.4, 0, 1),
      reasonCode: typeof parsed?.reason_code === 'string' ? parsed.reason_code : null,
      offeringServicesToRenew: parsed?.offering_services_to_renew === true,
      extraction: {
        phone: normalizePhone(extraction.phone),
        product: PRODUCTS.includes(extraction.product) ? extraction.product : null,
        modality: MODALITIES.includes(extraction.modality) ? extraction.modality : null,
      },
    };
  }
}
