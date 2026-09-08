import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// Un error no controlado deja el proceso en un estado incierto. Se registra y
// termina para que el supervisor lo reinicie de forma limpia.
process.on('unhandledRejection', (reason) => { console.error('[servidor] unhandledRejection:', reason?.message ?? reason); process.exit(1); });
process.on('uncaughtException', (err) => { console.error('[servidor] uncaughtException:', err?.message ?? err); process.exit(1); });
import { fileURLToPath } from 'node:url';

import { aiConfigurationFromEnvironment, loadEnvironment } from '../../src/config/environment.mjs';
import { PostgresLeadRepository } from '../../src/leads/postgres-lead-repository.mjs';
import { InMemoryLeadRepository } from '../../src/leads/in-memory-lead-repository.mjs';
import { ObserverLeadService } from '../../src/leads/observer-lead-service.mjs';
import { MetaWebhookHandler } from '../../src/meta/meta-webhook-handler.mjs';
import { ConversationObserver } from '../../src/meta/conversation-observer.mjs';
import { LeadProcessor } from '../../src/meta/lead-processor.mjs';
import { LeadsApi } from '../../src/admin/leads-api.mjs';
import { syncConversations } from '../../src/meta/conversation-sync.mjs';
import { AdminAuth } from '../../src/admin/admin-auth.mjs';
import { CrmAuth } from '../../src/crm/crm-auth.mjs';
import { CrmInterventionRepository } from '../../src/crm/crm-intervention-repository.mjs';
import { CrmApi } from '../../src/crm/crm-api.mjs';
import { CommercialService } from '../../src/commercial/commercial-service.mjs';
import { OpenAICompatibleProvider } from '../../src/ai/deepseek-provider.mjs';
import { IntakeClassifier } from '../../src/ai/intake-classifier.mjs';

loadEnvironment();

const appDirectory = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(appDirectory, 'public');
const crmPublicDirectory = join(appDirectory, '../crm/dist');
const port = Number(process.env.PORT ?? process.env.PORT_META ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const connectionString = process.env.DATABASE_URL;
const verifyToken = process.env.META_VERIFY_TOKEN ?? 'agua-renew-dev';
const appSecret = process.env.META_APP_SECRET ?? null;
const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN ?? null;
const adminToken = process.env.ADMIN_API_TOKEN ?? null;
const production = process.env.NODE_ENV === 'production';
const trustProxy = process.env.TRUST_PROXY === 'true';
if (production && String(adminToken ?? '').length < 32) {
  throw new Error('En producción ADMIN_API_TOKEN debe tener al menos 32 caracteres.');
}
if (production && connectionString && new URL(connectionString).searchParams.get('sslmode') !== 'verify-full') {
  throw new Error('En producción DATABASE_URL debe configurar sslmode=verify-full.');
}
const adminAuth = new AdminAuth({ secret: adminToken, secure: production });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
};

function securityHeaders({ cacheControl = 'no-store' } = {}) {
  return {
    'Cache-Control': cacheControl,
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(production ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders() });
  response.end(JSON.stringify(body));
}

async function readBody(request, limit = 1_000_000) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > limit) throw new Error('Request body too large');
  }
  return body;
}

async function serveStatic(pathname, response) {
  const brandAssets = {
    '/brand/logo-renew.svg': join(appDirectory, '../../logo/logo700_color.svg'),
    '/brand/logo-gotita.svg': join(appDirectory, '../../logo/logo_gotita.svg'),
  };
  if (brandAssets[pathname]) {
    try {
      const file = await readFile(brandAssets[pathname]);
      response.writeHead(200, { 'Content-Type': 'image/svg+xml', ...securityHeaders({ cacheControl: 'public, max-age=86400' }) });
      return response.end(file);
    } catch {
      return sendJson(response, 404, { error: 'Not found' });
    }
  }
  const requested = pathname === '/login' ? 'login.html' :
    (pathname === '/' || pathname === '/admin' ? 'index.html' : pathname.replace(/^\/admin\//, ''));
  const resolved = normalize(join(publicDirectory, requested));
  if (!resolved.startsWith(publicDirectory)) return sendJson(response, 403, { error: 'Forbidden' });
  try {
    const file = await readFile(resolved);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(resolved)] ?? 'application/octet-stream', ...securityHeaders() });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

async function serveCrmStatic(pathname, response) {
  const relative = pathname === '/crm' || pathname === '/crm/' || pathname === '/crm/login'
    ? 'index.html'
    : pathname.replace(/^\/crm\/?/, '');
  const resolved = normalize(join(crmPublicDirectory, relative));
  if (!resolved.startsWith(crmPublicDirectory)) return sendJson(response, 403, { error: 'Forbidden' });
  try {
    const file = await readFile(resolved);
    const immutable = pathname.includes('/assets/');
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(resolved)] ?? 'application/octet-stream',
      ...securityHeaders({ cacheControl: immutable ? 'public, max-age=31536000, immutable' : 'no-store' }),
    });
    return response.end(file);
  } catch {
    if (!extname(relative)) {
      try {
        const index = await readFile(join(crmPublicDirectory, 'index.html'));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...securityHeaders() });
        return response.end(index);
      } catch { /* cae a 404 */ }
    }
    return sendJson(response, 404, { error: 'CRM no compilado. Ejecute pnpm run build:crm.' });
  }
}

function sendRedirect(response, location) {
  response.writeHead(302, { Location: location, ...securityHeaders() });
  response.end();
}

function requestIp(request) {
  const forwarded = trustProxy ? request.headers['x-forwarded-for'] : null;
  return String(forwarded ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
}

function isAuthenticated(request) {
  return !adminToken || adminAuth.isAuthenticated(request.headers);
}

async function verifySchema(pool) {
  const result = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = '021_lead_ai_analysis.sql'");
  if (!result.rowCount) {
    const error = new Error('Esquema desactualizado: ejecute npm run migrate con DATABASE_URL_UNPOOLED.');
    error.code = 'SCHEMA_OUTDATED';
    throw error;
  }
}

async function main() {
  let usePostgres = Boolean(connectionString);
  let repository;
  if (usePostgres) {
    const candidate = new PostgresLeadRepository({ connectionString });
    try {
      await candidate.connect();
      await verifySchema(candidate.pool);
      repository = candidate;
      console.log('[meta-server] PostgreSQL conectado; esquema CRM e IA 021 verificado.');
    } catch (error) {
      if (error.code === 'SCHEMA_OUTDATED' || production) throw error;
      // Sin DB disponible (dev sin Docker, Neon suspendido): continuar en memoria.
      console.warn(`[meta-server] No se pudo conectar a PostgreSQL (${error.code ?? error.message}); usando memoria para esta sesión.`);
      repository = new InMemoryLeadRepository();
      usePostgres = false;
    }
  } else {
    repository = new InMemoryLeadRepository();
    console.warn('[meta-server] DATABASE_URL no definida → usando repositorio en memoria (solo desarrollo).');
  }

  const aiConfig = aiConfigurationFromEnvironment();
  let classifier = null;
  let aiRuntime = { enabled: false, provider: null, model: null, configured: false };
  if (aiConfig.enabled) {
    const provider = new OpenAICompatibleProvider(aiConfig.compatible);
    if (provider.isConfigured()) {
      classifier = new IntakeClassifier({ provider });
      aiRuntime = { enabled: true, provider: provider.providerName, model: provider.model, configured: true };
      console.log(`[meta-server] análisis IA habilitado (${provider.providerName}/${provider.model}).`);
    } else {
      console.warn('[meta-server] AI_ENABLED=true pero faltan AI_API_KEY, AI_MODEL o AI_BASE_URL; se usará análisis determinístico.');
    }
  }
  const processor = new LeadProcessor({ repository, classifier });
  const observer = new ConversationObserver({ repository, processor });
  const leadService = new ObserverLeadService({ repository });
  const webhookHandler = new MetaWebhookHandler({ verifyToken, appSecret, observer, repository, deferProcessing: true });
  const leadsApi = new LeadsApi({ leadService, repository, adminToken });
  let crmAuth = null;
  let crmRepository = null;
  let crmApi = null;
  if (usePostgres) {
    crmAuth = new CrmAuth({ pool: repository.pool, secure: production });
    crmRepository = new CrmInterventionRepository({ pool: repository.pool });
    crmApi = new CrmApi({ repository: crmRepository, commercialService: new CommercialService() });
    const bootstrapPassword = process.env.CRM_BOOTSTRAP_PASSWORD ?? adminToken;
    if (String(bootstrapPassword ?? '').length >= 12) {
      await crmAuth.ensureBootstrapUser({
        email: process.env.CRM_BOOTSTRAP_EMAIL ?? 'admin@aguarenew.local',
        password: bootstrapPassword,
      });
    } else {
      console.warn('[crm] Configure CRM_BOOTSTRAP_PASSWORD (mínimo 12 caracteres) para crear el primer administrador.');
    }
    await crmRepository.ensureLeadMirror();
    await crmRepository.assignUnownedRoundRobin();
    setInterval(() => crmRepository.runRevenueAutomations().catch((error) => console.warn('[crm-automation]', error.message)), 60_000).unref();
  }

  // Sincronización automática de conversaciones no leídas (solo lectura, no marca leído).
  const syncIntervalMs = Number(process.env.META_SYNC_INTERVAL_MS ?? 120000);
  const syncOnlyUnread = process.env.META_SYNC_ONLY_UNREAD === 'true';
  const syncSources = [
    process.env.META_PAGE_ID ? { platform: 'messenger', businessAccountId: process.env.META_PAGE_ID } : null,
    process.env.META_IG_USER_ID ? { platform: 'instagram', businessAccountId: process.env.META_IG_USER_ID } : null,
  ].filter(Boolean);
  const canSync = Boolean(syncSources.length && pageAccessToken);
  let syncRunning = false;
  let lastSync = null;
  let lastSyncError = null;
  async function runSync(reason) {
    if (!canSync) return { skipped: true, reason: 'sin META_PAGE_ID/pageAccessToken' };
    if (syncRunning) return { skipped: true, reason: 'ya en curso' };
    syncRunning = true;
    try {
      const results = [];
      for (const source of syncSources) {
        results.push(await syncConversations({ repository, observer, ...source, pageAccessToken, onlyUnread: syncOnlyUnread }));
      }
      const summary = results.reduce((total, current) => ({
        conversations: total.conversations + current.conversations,
        leadsCreated: total.leadsCreated + current.leadsCreated,
        messagesImported: total.messagesImported + current.messagesImported,
        messagesSkipped: total.messagesSkipped + current.messagesSkipped,
        sources: [...total.sources, current],
      }), { conversations: 0, leadsCreated: 0, messagesImported: 0, messagesSkipped: 0, sources: [] });
      lastSync = new Date().toISOString();
      lastSyncError = null;
      console.log('[auto-sync]', reason, JSON.stringify(summary));
      return summary;
    } catch (error) {
      lastSyncError = error.message;
      console.warn('[auto-sync] error:', error.message);
      return { error: error.message };
    } finally {
      syncRunning = false;
    }
  }
  if (canSync) {
    runSync('arranque');
    setInterval(() => runSync('intervalo'), syncIntervalMs);
    console.log(`[meta-server] auto-sync cada ${Math.round(syncIntervalMs / 1000)}s (${syncOnlyUnread ? 'solo no leídas' : 'todas, con idempotencia'}).`);
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      // Handshake de suscripción del webhook de Meta.
      if (request.method === 'GET' && url.pathname === '/webhook/meta') {
        const verification = webhookHandler.verifySubscription(Object.fromEntries(url.searchParams));
        if (!verification.verified) return sendJson(response, 403, { error: 'Verificación fallida' });
        response.writeHead(200, { 'Content-Type': 'text/plain', ...securityHeaders() });
        return response.end(verification.challenge);
      }

      // Webhook de Meta (mensajes entrantes).
      if (request.method === 'POST' && url.pathname === '/webhook/meta') {
        const rawBody = await readBody(request);
        const signature = request.headers['x-hub-signature-256'];
        const summary = await webhookHandler.handle({ rawBody, signature });
        if (summary.error) return sendJson(response, 403, { error: summary.error });
        console.log('[webhook]', JSON.stringify(summary));
        return sendJson(response, 200, summary);
      }

      if (request.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(response, 200, { status: 'ok' });
      }

      if (url.pathname === '/api/crm/v1/health/live' && request.method === 'GET') {
        return sendJson(response, 200, { status: 'ok' });
      }
      if (url.pathname === '/api/crm/v1/health/ready' && request.method === 'GET') {
        if (!crmRepository) return sendJson(response, 503, { status: 'unavailable', database: false });
        await repository.pool.query('SELECT 1');
        return sendJson(response, 200, { status: 'ready', database: true, observer: true, metaWriteEnabled: false });
      }
      if (url.pathname === '/api/crm/v1/auth/login' && request.method === 'POST') {
        if (!crmAuth) return sendJson(response, 503, { error: 'CRM requiere PostgreSQL' });
        if (!crmAuth.validOrigin(request.headers)) return sendJson(response, 403, { error: 'Origen no autorizado' });
        const rawBody = await readBody(request);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const result = await crmAuth.login({ email: body.email, password: body.password, ip: requestIp(request), userAgent: request.headers['user-agent'] });
        if (!result.ok) return sendJson(response, result.status, { error: result.error });
        await crmRepository.audit({ actor: result.user, action: 'LOGIN_SUCCEEDED', entityType: 'session', entityId: result.sessionId, ipAddress: requestIp(request), userAgent: request.headers['user-agent'] });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': result.cookie, ...securityHeaders() });
        return response.end(JSON.stringify({ authenticated: true, user: result.user, csrfToken: result.csrf }));
      }
      if (url.pathname === '/api/crm/v1/auth/session' && request.method === 'GET') {
        if (!crmAuth) return sendJson(response, 503, { error: 'CRM requiere PostgreSQL' });
        const auth = await crmAuth.authenticate(request.headers);
        if (!auth) return sendJson(response, 401, { authenticated: false });
        return sendJson(response, 200, { authenticated: true, user: auth.user, csrfToken: await crmAuth.rotateCsrf(auth.sessionId) });
      }
      if (url.pathname === '/api/crm/v1/auth/logout' && request.method === 'POST') {
        if (!crmAuth) return sendJson(response, 503, { error: 'CRM requiere PostgreSQL' });
        const auth = await crmAuth.authenticate(request.headers);
        if (!auth) return sendJson(response, 401, { error: 'No autorizado' });
        if (!crmAuth.validOrigin(request.headers) || !crmAuth.validCsrf(auth, request.headers)) return sendJson(response, 403, { error: 'Solicitud no autorizada' });
        await crmAuth.logout(auth.sessionId);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': crmAuth.logoutCookie(), ...securityHeaders() });
        return response.end(JSON.stringify({ authenticated: false }));
      }

      if (url.pathname.startsWith('/api/crm/v1')) {
        if (!crmAuth || !crmApi) return sendJson(response, 503, { error: 'CRM requiere PostgreSQL' });
        const auth = await crmAuth.authenticate(request.headers);
        if (!auth) return sendJson(response, 401, { error: 'No autorizado' });
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
        if (mutation && (!crmAuth.validOrigin(request.headers) || !crmAuth.validCsrf(auth, request.headers))) {
          return sendJson(response, 403, { error: 'Solicitud no autorizada' });
        }
        const rawBody = mutation ? await readBody(request) : '';
        const body = rawBody ? JSON.parse(rawBody) : {};
        const result = await crmApi.handle({
          method: request.method, pathname: url.pathname, query: url.searchParams, body, auth,
          requestMeta: { ipAddress: requestIp(request), userAgent: request.headers['user-agent'] },
        });
        if (!result) return sendJson(response, 404, { error: 'No encontrado' });
        response.writeHead(result.status, { ...result.headers, ...securityHeaders() });
        return response.end(result.body instanceof Buffer ? result.body : JSON.stringify(result.body));
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        if (adminToken && !adminAuth.validOrigin(request.headers)) return sendJson(response, 403, { error: 'Origen no autorizado' });
        const rawBody = await readBody(request);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const result = adminAuth.login({ password: body.password, ip: requestIp(request) });
        if (!result.ok) return sendJson(response, result.status, { error: result.error });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': result.cookie, ...securityHeaders() });
        return response.end(JSON.stringify({ authenticated: true }));
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        if (!isAuthenticated(request)) return sendJson(response, 401, { error: 'No autorizado' });
        if (adminToken && !adminAuth.validOrigin(request.headers)) return sendJson(response, 403, { error: 'Origen no autorizado' });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': adminAuth.logoutCookie(), ...securityHeaders() });
        return response.end(JSON.stringify({ authenticated: false }));
      }
      if (request.method === 'GET' && url.pathname === '/api/auth/session') {
        return sendJson(response, isAuthenticated(request) ? 200 : 401, { authenticated: isAuthenticated(request) });
      }

      if (request.method === 'GET' && url.pathname === '/api/admin/health') {
        if (!isAuthenticated(request)) return sendJson(response, 401, { error: 'No autorizado' });
        return sendJson(response, 200, {
          status: 'ok',
          repository: usePostgres ? 'postgres' : 'memory',
          operationMode: 'observer',
          processor: classifier ? 'ai_with_deterministic_fallback' : 'deterministic',
          analysis: aiRuntime,
          metaWriteEnabled: false,
          autoSync: canSync,
          syncIntervalMs,
          syncOnlyUnread,
          syncRunning,
          lastSync,
          lastSyncError,
        });
      }

      // API del panel.
      if (url.pathname.startsWith('/api/leads')) {
        if (!isAuthenticated(request)) return sendJson(response, 401, { error: 'No autorizado' });
        if (request.method !== 'GET' && adminToken && !adminAuth.validOrigin(request.headers)) {
          return sendJson(response, 403, { error: 'Origen no autorizado' });
        }
        // Importar conversaciones existentes de Messenger (solo lectura, no marca leído).
        if (request.method === 'POST' && url.pathname === '/api/leads/sync') {
          const summary = await runSync('manual');
          return sendJson(response, 200, summary);
        }
        const rawBody = request.method === 'POST' ? await readBody(request) : '';
        const body = rawBody ? JSON.parse(rawBody) : {};
        const authorizedHeaders = adminToken
          ? { ...request.headers, Authorization: `Bearer ${adminToken}` }
          : request.headers;
        const result = await leadsApi.handle({
          method: request.method, pathname: url.pathname, headers: authorizedHeaders, body, query: url.searchParams,
        });
        if (!result) return sendJson(response, 404, { error: 'No encontrado' });
        response.writeHead(result.status, { ...result.headers, ...securityHeaders() });
        return response.end(result.body instanceof Buffer ? result.body : JSON.stringify(result.body));
      }

      // Panel estático.
      if (request.method === 'GET' && url.pathname === '/login') {
        if (isAuthenticated(request)) return sendRedirect(response, '/admin');
        return serveStatic(url.pathname, response);
      }
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin')) {
        if (!isAuthenticated(request)) return sendRedirect(response, '/login');
        return serveStatic(url.pathname, response);
      }
      if (request.method === 'GET' && (url.pathname === '/crm' || url.pathname.startsWith('/crm/'))) {
        return serveCrmStatic(url.pathname, response);
      }
      if (request.method === 'GET') return serveStatic(url.pathname, response);
      return sendJson(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      console.error('[meta-server]', error);
      return sendJson(response, 400, { error: 'Solicitud inválida. Revisa los datos enviados.' });
    }
  });

  server.listen(port, host, () => {
    console.log(`[meta-server] observer escuchando en http://${host}:${port}`);
    console.log(`[meta-server] webhook:  http://${host}:${port}/webhook/meta`);
    console.log(`[meta-server] panel:    http://${host}:${port}/admin`);
  });
}

main().catch((error) => {
  console.error('[meta-server] error fatal', error);
  process.exitCode = 1;
});
