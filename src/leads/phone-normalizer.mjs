/**
 * Normalización determinística de números de teléfono peruanos a formato E.164.
 * Primera versión: móviles de Perú (9 dígitos que empiezan con 9, prefijo +51).
 * La estructura permite ampliar a otros países (country_code) sin rediseño.
 */

// Un móvil peruano: 9 seguido de 8 dígitos, con separadores comunes tolerados.
// Prefijo opcional: 51, +51, 0051, (51), (+51).
const LOOSE_MOBILE = /(?:(\+?0?0?51)[\s.\-()]*)?(9[\s.\-()]*\d[\s.\-()]*\d[\s.\-()]*\d[\s.\-()]*\d[\s.\-()]*\d[\s.\-()]*\d[\s.\-()]*\d[\s.\-()]*\d)/;

/**
 * Extrae el primer número de 9 dígitos tipo móvil peruano presente en el texto.
 * Devuelve el E.164 (`+51` + 9 dígitos) o `null` si no hay ninguno válido.
 */
export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const match = LOOSE_MOBILE.exec(text);
  if (!match) return null;

  const core = match[2].replace(/\D/g, '');
  if (core.length !== 9 || !core.startsWith('9')) return null;

  // Rechazar si el número continúa con más dígitos pegados (p. ej. "9876543210"
  // son 10 dígitos: probable error, no recortar silenciosamente).
  const rest = text.slice(match.index + match[0].length);
  if (/\d/.test(rest.charAt(0))) return null;

  return `+51${core}`;
}

/** `true` si el texto contiene un móvil peruano válido. */
export function hasValidPhone(raw) {
  return normalizePhone(raw) !== null;
}
