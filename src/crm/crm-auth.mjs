import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'agua_renew_crm';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function readCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
  }));
}

export async function hashPassword(password) {
  const value = String(password ?? '');
  if (value.length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres');
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64, SCRYPT_PARAMS);
  return `scrypt-v1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const [version, saltText, expectedText] = String(encoded ?? '').split('$');
  if (version !== 'scrypt-v1' || !saltText || !expectedText) return false;
  const expected = Buffer.from(expectedText, 'base64url');
  const derived = Buffer.from(await scrypt(String(password ?? ''), Buffer.from(saltText, 'base64url'), expected.length, SCRYPT_PARAMS));
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export class CrmAuth {
  constructor({ pool, secure = false, ttlMs = 8 * 60 * 60 * 1000, clock = () => new Date() }) {
    this.pool = pool;
    this.secure = secure;
    this.ttlMs = ttlMs;
    this.clock = clock;
  }

  async ensureBootstrapUser({ email, password, displayName = 'Administrador Agua ReNew' }) {
    const current = await this.pool.query('SELECT count(*)::int AS total FROM crm_users WHERE deleted_at IS NULL');
    if (current.rows[0].total > 0) return false;
    if (!email || !password) return false;
    const passwordHash = await hashPassword(password);
    await this.pool.query(
      `INSERT INTO crm_users (organization_id, email, display_name, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,'ADMIN',FALSE) ON CONFLICT DO NOTHING`,
      [ORGANIZATION_ID, String(email).trim().toLowerCase(), displayName, passwordHash],
    );
    return true;
  }

  async isRateLimited({ email, ip }) {
    const result = await this.pool.query(
      `SELECT count(*)::int AS failures FROM crm_login_attempts
       WHERE succeeded = FALSE AND attempted_at > now() - interval '15 minutes'
         AND (ip_address = $1 OR identity = $2)`,
      [String(ip ?? 'unknown'), String(email ?? '').trim().toLowerCase()],
    );
    return result.rows[0].failures >= 5;
  }

  async login({ email, password, ip = 'unknown', userAgent = '' }) {
    const identity = String(email ?? '').trim().toLowerCase();
    if (await this.isRateLimited({ email: identity, ip })) {
      return { ok: false, status: 429, error: 'Demasiados intentos. Intente nuevamente en 15 minutos.' };
    }
    const result = await this.pool.query(
      `SELECT * FROM crm_users WHERE lower(email) = $1 AND active = TRUE AND deleted_at IS NULL LIMIT 1`,
      [identity],
    );
    const user = result.rows[0];
    const valid = user ? await verifyPassword(password, user.password_hash) : false;
    await this.pool.query(
      'INSERT INTO crm_login_attempts (identity, ip_address, succeeded) VALUES ($1,$2,$3)',
      [identity, String(ip), valid],
    );
    if (!valid) return { ok: false, status: 401, error: 'Correo o contraseña incorrectos' };

    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    const expiresAt = new Date(this.clock().getTime() + this.ttlMs);
    const session = await this.pool.query(
      `INSERT INTO crm_sessions (user_id, token_hash, csrf_hash, expires_at, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [user.id, sha256(token), sha256(csrf), expiresAt, String(ip), String(userAgent).slice(0, 500)],
    );
    await this.pool.query('UPDATE crm_users SET last_login_at = now(), updated_at = now() WHERE id = $1', [user.id]);
    return { ok: true, status: 200, cookie: this.cookie(token, Math.floor(this.ttlMs / 1000)), csrf, sessionId: session.rows[0].id, user: publicUser(user) };
  }

  cookie(value, maxAge) {
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.secure ? '; Secure' : ''}`;
  }

  logoutCookie() { return this.cookie('', 0); }

  async authenticate(headers = {}) {
    const token = readCookies(headers.cookie)[COOKIE_NAME];
    if (!token) return null;
    const result = await this.pool.query(
      `SELECT s.id AS session_id, s.csrf_hash, s.expires_at, u.*
       FROM crm_sessions s JOIN crm_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
         AND u.active = TRUE AND u.deleted_at IS NULL`,
      [sha256(token)],
    );
    const row = result.rows[0];
    if (!row) return null;
    await this.pool.query('UPDATE crm_sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
    return { sessionId: row.session_id, csrfHash: row.csrf_hash, user: publicUser(row) };
  }

  async rotateCsrf(sessionId) {
    const csrf = randomBytes(24).toString('base64url');
    await this.pool.query('UPDATE crm_sessions SET csrf_hash = $2 WHERE id = $1', [sessionId, sha256(csrf)]);
    return csrf;
  }

  validCsrf(auth, headers = {}) {
    const supplied = String(headers['x-csrf-token'] ?? '');
    const left = Buffer.from(sha256(supplied));
    const right = Buffer.from(String(auth?.csrfHash ?? ''));
    return supplied.length > 0 && left.length === right.length && timingSafeEqual(left, right);
  }

  validOrigin(headers = {}) {
    const origin = headers.origin;
    const host = headers.host;
    if (!origin || !host) return false;
    try { return new URL(origin).host === host; } catch { return false; }
  }

  async logout(sessionId) {
    await this.pool.query('UPDATE crm_sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
  }
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    mustChangePassword: row.must_change_password,
    version: Number(row.version ?? 1),
  };
}

export { COOKIE_NAME as CRM_COOKIE_NAME, ORGANIZATION_ID };
