let csrfToken = '';
const CSRF_STORAGE_KEY = 'agua-renew-crm-csrf';

function readStoredCsrfToken() {
  try {
    return globalThis.localStorage?.getItem(CSRF_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setCsrfToken(value) {
  csrfToken = value ?? '';
  try {
    if (csrfToken) globalThis.localStorage?.setItem(CSRF_STORAGE_KEY, csrfToken);
    else globalThis.localStorage?.removeItem(CSRF_STORAGE_KEY);
  } catch {
    // The in-memory token still works when storage is unavailable.
  }
}

async function request(path, options = {}, { allowCsrfRecovery = true } = {}) {
  const method = options.method ?? 'GET';
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const currentCsrfToken = readStoredCsrfToken() || csrfToken;
  if (!['GET', 'HEAD'].includes(method) && currentCsrfToken) headers['X-CSRF-Token'] = currentCsrfToken;
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    cache: options.cache ?? 'no-store',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.blob();
  if (!response.ok) {
    const csrfExpired = response.status === 403 && payload?.error === 'Solicitud no autorizada';
    if (allowCsrfRecovery && csrfExpired && path !== '/api/crm/v1/auth/session') {
      const session = await request('/api/crm/v1/auth/session', {}, { allowCsrfRecovery: false });
      setCsrfToken(session.csrfToken);
      return request(path, options, { allowCsrfRecovery: false });
    }
    const error = new Error(payload?.error ?? `Error ${response.status}`);
    error.status = response.status;
    error.code = payload?.code;
    error.details = payload?.details;
    throw error;
  }
  return payload;
}

export async function api(path, options = {}) {
  return request(path, options);
}

export function queryString(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value));
  });
  return query.toString();
}
