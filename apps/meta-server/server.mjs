import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

// Red de seguridad: un fallo puntual de conexión (p. ej. Postgres/Neon) no debe
// tumbar el servidor; se registra y se sigue sirviendo.
process.on('unhandledRejection', (reason) => { console.error('[servidor] unhandledRejection:', reason?.message ?? reason); });
process.on('uncaughtException', (err) => { console.error('[servidor] uncaughtException:', err?.message ?? err); });
import { fileURLToPath } from 'node:url';

import { loadEnvironment, aiConfigurationFromEnvironment } from '../../src/config/environment.mjs';
import { PostgresLeadRepository } from '../../src/leads/postgres-lead-repository.mjs';
import { InMemoryLeadRepository } from '../../src/leads/in-memory-lead-repository.mjs';
import { LeadService } from '../../src/leads/lead-service.mjs';
import { SocialLeadIntake } from '../../src/meta/social-lead-intake.mjs';
import { MetaWebhookHandler } from '../../src/meta/meta-webhook-handler.mjs';
import { MetaMessageSender } from '../../src/meta/meta-message-sender.mjs';
import { IntakeClassifier } from '../../src/ai/intake-classifier.mjs';
import { DeepSeekProvider } from '../../src/ai/deepseek-provider.mjs';
import { LeadsApi } from '../../src/admin/leads-api.mjs';
import { syncConversations } from '../../src/meta/conversation-sync.mjs';
import { MetaOutboxWorker } from '../../src/meta/outbox-worker.mjs';
import { AdminAuth } from '../../src/admin/admin-auth.mjs';

loadEnvironment();

const appDirectory = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(appDirectory, 'public');
const port = Number(process.env.PORT_META ?? 4000);
const connectionString = process.env.DATABASE_URL;
const verifyToken = process.env.META_VERIFY_TOKEN ?? 'agua-renew-dev';
const appSecret = process.env.META_APP_SECRET ?? null;
const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN ?? null;
const adminToken = process.env.ADMIN_API_TOKEN ?? null;
const windowHours = Number(process.env.META_WINDOW_HOURS ?? 24);
const production = process.env.NODE_ENV === 'production';
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
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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
      response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
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
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(resolved)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

function sendRedirect(response, location) {
  response.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  response.end();
}

function requestIp(request) {
  return String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
}

function isAuthenticated(request) {
  return !adminToken || adminAuth.isAuthenticated(request.headers);
}

async function verifySchema(pool) {
  const result = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = '010_lead_runtime_reliability.sql'");
  if (!result.rowCount) {
    const error = new Error('Esquema desactualizado: ejecute pnpm migrate con DATABASE_URL_UNPOOLED.');
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
      console.log('[meta-server] PostgreSQL conectado; esquema 010 verificado.');
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

  const ai = aiConfigurationFromEnvironment();
  const provider = ai.enabled && ai.deepseek?.apiKey && ai.deepseek?.baseUrl
    ? new DeepSeekProvider({ apiKey: ai.deepseek.apiKey, model: ai.deepseek.model, baseUrl: ai.deepseek.baseUrl, timeoutMs: ai.deepseek.timeoutMs, thinkingMode: ai.deepseek.thinkingMode })
    : null;
  const classifier = new IntakeClassifier({ provider });
  const sender = new MetaMessageSender({
    pageAccessToken,
    mode: pageAccessToken ? 'live' : 'mock',
    pageId: process.env.META_PAGE_ID,
    igUserId: process.env.META_IG_USER_ID,
  });
  const intake = new SocialLeadIntake();
  const leadService = new LeadService({ repository, router: classifier, intake, sender, windowHours, autoReplyEnabled: process.env.AUTOREPLY_ENABLED === 'true' });
  // Resolver de username (Graph API) cuando el envío live está configurado.
  const profileResolver = pageAccessToken ? ({ igUserId, channel }) => sender.fetchUsername({ igUserId, channel }) : null;
  const webhookHandler = new MetaWebhookHandler({ verifyToken, appSecret, leadService, repository, profileResolver });
  const leadsApi = new LeadsApi({ leadService, repository, adminToken });
  const outboxEnabled = process.env.OUTBOX_WORKER_ENABLED !== 'false';
  const outboxWorker = new MetaOutboxWorker({
    repository, sender,
    intervalMs: Number(process.env.OUTBOX_INTERVAL_MS ?? 5000),
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 10),
  });
  if (outboxEnabled) outboxWorker.start();

  // Sincronización automática de conversaciones no leídas (solo lectura, no marca leído).
  const syncIntervalMs = Number(process.env.META_SYNC_INTERVAL_MS ?? 120000);
  const canSync = Boolean(process.env.META_PAGE_ID && pageAccessToken);
  let syncRunning = false;
  let lastSync = null;
  let lastSyncError = null;
  async function runSync(reason) {
    if (!canSync) return { skipped: true, reason: 'sin META_PAGE_ID/pageAccessToken' };
    if (syncRunning) return { skipped: true, reason: 'ya en curso' };
    syncRunning = true;
    try {
      const summary = await syncConversations({ repository, pageId: process.env.META_PAGE_ID, pageAccessToken, onlyUnread: true });
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
    console.log(`[meta-server] auto-sync cada ${Math.round(syncIntervalMs / 1000)}s (solo conversaciones no leídas).`);
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      // Handshake de suscripción del webhook de Meta.
      if (request.method === 'GET' && url.pathname === '/webhook/meta') {
        const verification = webhookHandler.verifySubscription(Object.fromEntries(url.searchParams));
        if (!verification.verified) return sendJson(response, 403, { error: 'Verificación fallida' });
        response.writeHead(200, { 'Content-Type': 'text/plain' });
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

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        if (adminToken && !adminAuth.validOrigin(request.headers)) return sendJson(response, 403, { error: 'Origen no autorizado' });
        const rawBody = await readBody(request);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const result = adminAuth.login({ password: body.password, ip: requestIp(request) });
        if (!result.ok) return sendJson(response, result.status, { error: result.error });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': result.cookie, 'Cache-Control': 'no-store' });
        return response.end(JSON.stringify({ authenticated: true }));
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
        if (!isAuthenticated(request)) return sendJson(response, 401, { error: 'No autorizado' });
        if (adminToken && !adminAuth.validOrigin(request.headers)) return sendJson(response, 403, { error: 'Origen no autorizado' });
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': adminAuth.logoutCookie(), 'Cache-Control': 'no-store' });
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
          sender: sender.mode,
          ai: provider ? 'deepseek' : 'deterministic',
          autoReply: leadService.autoReplyEnabled,
          autoSync: canSync,
          syncIntervalMs,
          syncRunning,
          lastSync,
          lastSyncError,
          outboxEnabled,
          outboxRunning: outboxWorker.running,
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
        response.writeHead(result.status, { ...result.headers, 'Cache-Control': 'no-store' });
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
      if (request.method === 'GET') return serveStatic(url.pathname, response);
      return sendJson(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      console.error('[meta-server]', error);
      return sendJson(response, 400, { error: 'Solicitud inválida. Revisa los datos enviados.' });
    }
  });

  server.listen(port, () => {
    console.log(`[meta-server] escuchando en http://localhost:${port}`);
    console.log(`[meta-server] webhook:  http://localhost:${port}/webhook/meta`);
    console.log(`[meta-server] panel:    http://localhost:${port}/admin`);
  });
}

main().catch((error) => {
  console.error('[meta-server] error fatal', error);
  process.exitCode = 1;
});
