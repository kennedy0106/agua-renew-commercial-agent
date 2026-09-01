import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'agua_renew_admin';

function encode(value) { return Buffer.from(value).toString('base64url'); }
function decode(value) { return Buffer.from(value, 'base64url').toString('utf8'); }

function cookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
  }));
}

export class AdminAuth {
  constructor({ secret, ttlMs = 8 * 60 * 60 * 1000, secure = false,
    maxFailures = 5, failureWindowMs = 15 * 60 * 1000, clock = () => new Date() }) {
    this.secret = String(secret ?? '');
    this.ttlMs = ttlMs;
    this.secure = secure;
    this.maxFailures = maxFailures;
    this.failureWindowMs = failureWindowMs;
    this.clock = clock;
    this.failures = new Map();
  }

  configured() { return this.secret.length > 0; }

  #sign(payload) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  #same(left, right) {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  isRateLimited(ip = 'unknown') {
    const now = this.clock().getTime();
    const recent = (this.failures.get(ip) ?? []).filter((time) => now - time < this.failureWindowMs);
    this.failures.set(ip, recent);
    return recent.length >= this.maxFailures;
  }

  login({ password, ip = 'unknown' }) {
    if (!this.configured()) return { ok: false, status: 503, error: 'Acceso administrativo no configurado' };
    if (this.isRateLimited(ip)) return { ok: false, status: 429, error: 'Demasiados intentos. Intente más tarde.' };
    if (!this.#same(password, this.secret)) {
      this.failures.set(ip, [...(this.failures.get(ip) ?? []), this.clock().getTime()]);
      return { ok: false, status: 401, error: 'Clave incorrecta' };
    }
    this.failures.delete(ip);
    const now = this.clock().getTime();
    const payload = encode(JSON.stringify({ iat: now, exp: now + this.ttlMs }));
    const token = `${payload}.${this.#sign(payload)}`;
    return { ok: true, status: 200, cookie: this.cookie(token, Math.floor(this.ttlMs / 1000)) };
  }

  cookie(value, maxAge) {
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.secure ? '; Secure' : ''}`;
  }

  logoutCookie() { return this.cookie('', 0); }

  isAuthenticated(headers = {}) {
    if (!this.configured()) return false;
    const bearer = String(headers.authorization ?? headers.Authorization ?? '').replace(/^Bearer\s+/i, '');
    if (bearer && this.#same(bearer, this.secret)) return true;
    const token = cookies(headers.cookie)[COOKIE_NAME];
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.#same(signature, this.#sign(payload))) return false;
    try {
      const session = JSON.parse(decode(payload));
      return Number(session.exp) > this.clock().getTime();
    } catch {
      return false;
    }
  }

  validOrigin(headers = {}) {
    if (String(headers.authorization ?? '').match(/^Bearer\s+/i)) return true;
    const origin = headers.origin;
    const host = headers.host;
    if (!origin || !host) return false;
    try { return new URL(origin).host === host; } catch { return false; }
  }
}

export { COOKIE_NAME };
