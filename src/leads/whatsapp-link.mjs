import { greetingForDate } from '../shared/lima-time.mjs';
import { productLabelPlural } from './lead-states.mjs';

const CHANNEL_NAMES = { instagram: 'Instagram', facebook_messenger: 'Facebook' };

function channelName(channel) {
  return CHANNEL_NAMES[channel] ?? 'nuestras redes';
}

/**
 * Mensaje precargado de WhatsApp según el contexto conocido en Meta.
 * Nunca inventa producto ni modalidad: si faltan, usa la plantilla genérica.
 */
export function buildWhatsAppMessage({ product = null, modality = null, channel = null, date = new Date() }) {
  const greeting = greetingForDate(date);
  const via = `a través de ${channelName(channel)}`;
  const base = `${greeting}. Gracias por comunicarse con Agua ReNew ${via}.`;

  if (product && modality) {
    return `${base} Nos indicó que está interesado en ${productLabelPlural(product)} con ${modalityPhrase(modality, true)}. Le escribimos por este medio para continuar con la información y atención.`;
  }
  if (product) {
    return `${base} Nos indicó que está interesado en ${productLabelPlural(product)}. Por este medio podemos continuar brindándole la información.`;
  }
  if (modality) {
    return `${base} Nos indicó que está interesado en ${modalityPhrase(modality, false)}. Por este medio podemos continuar brindándole la información sobre nuestro servicio de ${modalityServiceName(modality)}.`;
  }
  return `${base} Le escribimos por este medio para continuar con la información solicitada.`;
}

function modalityPhrase(modality, forProduct) {
  switch (modality) {
    case 'maquila': return forProduct ? 'su propia marca' : 'trabajar con su propia marca';
    case 'distribution_agua_renew': return forProduct ? 'la marca Agua ReNew' : 'distribuir con la marca Agua ReNew';
    case 'final_customer': return 'comprar para consumo propio';
    default: return '';
  }
}

function modalityServiceName(modality) {
  switch (modality) {
    case 'maquila': return 'maquila';
    case 'distribution_agua_renew': return 'distribución';
    default: return 'atención';
  }
}

/**
 * Enlace wa.me con mensaje precodificado para el operador del panel.
 * `phoneE164` debe ser un teléfono E.164 válido (p. ej. +51955623069).
 */
export function buildWhatsAppLink({ phoneE164, product = null, modality = null, channel = null, date = new Date() }) {
  if (!phoneE164) throw new Error('Lead sin teléfono válido');
  const message = buildWhatsAppMessage({ product, modality, channel, date });
  const digits = String(phoneE164).replace(/\D/g, '');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return { url, message };
}
