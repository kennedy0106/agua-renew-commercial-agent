/** Utilidades de tiempo para la zona horaria de Lima (America/Lima, UTC-5 sin DST). */

const LIMA_TIME_ZONE = 'America/Lima';

const HOUR_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: LIMA_TIME_ZONE,
  hour: 'numeric',
  hour12: false,
});

/** Hora actual (0–23) en Lima para un Date dado (por defecto ahora). */
export function limaHour(date = new Date()) {
  const parts = HOUR_FORMAT.formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '0';
  return Number(hour) % 24;
}

/** Saludo según la hora local de Lima: 05–11 Buenos días, 12–18 Buenas tardes, 19–04 Buenas noches. */
export function greetingForDate(date = new Date()) {
  const hour = limaHour(date);
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Saludo para el momento actual en Lima. */
export function nowGreeting() {
  return greetingForDate(new Date());
}

/** `true` si el instante está dentro de la ventana de mensajería de Meta (por defecto 24 h). */
export function isWithinMessagingWindow(lastUserMessageAt, windowHours = 24, now = new Date()) {
  if (!lastUserMessageAt) return false;
  const elapsedMs = now.getTime() - new Date(lastUserMessageAt).getTime();
  return elapsedMs >= 0 && elapsedMs <= windowHours * 60 * 60 * 1000;
}

/** Instante actual (Date) — helper para inyectar reloj en tests. */
export function nowInLima() {
  return new Date();
}
