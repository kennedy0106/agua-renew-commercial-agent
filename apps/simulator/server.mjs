import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConversationEngine } from '../../src/conversation/conversation-engine.mjs';
import { PostgresConversationRepository } from '../../src/repository/postgres-conversation-repository.mjs';
import { runMigrations } from '../../scripts/migrate.mjs';
import { DeepSeekProvider } from '../../src/ai/deepseek-provider.mjs';
import { AIInterpreter } from '../../src/ai/ai-interpreter.mjs';
import { CommercialAgent } from '../../src/ai/commercial-agent.mjs';
import { CommercialToolRegistry } from '../../src/ai/commercial-tool-registry.mjs';
import { CommercialService } from '../../src/commercial/commercial-service.mjs';
import { aiConfigurationFromEnvironment, loadEnvironment } from '../../src/config/environment.mjs';

loadEnvironment();
const appDirectory = fileURLToPath(new URL('.', import.meta.url));
const publicDirectory = join(appDirectory, 'public');
const port = Number(process.env.PORT ?? 3000);
// Conexión siempre desde entorno; el valor de desarrollo local va en .env
// (ver .env.example y docker-compose.yml).
const connectionString = process.env.DATABASE_URL;
const conversations = new Map();
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const resolved = normalize(join(publicDirectory, requested));
  if (!resolved.startsWith(publicDirectory)) return sendJson(response, 403, { error: 'Forbidden' });
  try {
    const file = await readFile(resolved);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(resolved)] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

let repository;
let aiInterpreter;
let commercialAgent;
let conversationArchitecture = 'agent';
const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(response, 200, { status: 'ok', mode: 'deterministic', integrations: [] });
    }
    if (request.method === 'POST' && url.pathname === '/api/conversations') {
      const body = await readJson(request);
      const id = randomUUID();
      const engine = new ConversationEngine({ repository, aiInterpreter, commercialAgent, conversationArchitecture });
      conversations.set(id, engine);
      const snapshot = await engine.initialize({
        customerExternalId: body.customerExternalId ?? 'local-demo-customer',
        channel: 'local',
        newConversation: body.newConversation === true,
        mode: 'ai',
      });
      return sendJson(response, 201, { id, ...snapshot });
    }
    const eventMatch = url.pathname.match(/^\/api\/conversations\/([0-9a-f-]+)\/events$/i);
    if (request.method === 'POST' && eventMatch) {
      const engine = conversations.get(eventMatch[1]);
      if (!engine) return sendJson(response, 404, { error: 'Conversation not found' });
      const event = await readJson(request);
      return sendJson(response, 200, await engine.dispatch(event));
    }
    if (request.method === 'GET') return serveStatic(url.pathname, response);
    return sendJson(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    // Nunca exponer detalles internos (p. ej. cadena de conexión) al navegador.
    console.error('[api]', error);
    return sendJson(response, 400, { error: 'Solicitud inválida. Revisa los datos enviados.' });
  }
});

async function main() {
  if (!connectionString) {
    console.error('DATABASE_URL no está definida. Copie .env.example a .env y configúrela antes de iniciar.');
    process.exitCode = 1;
    return;
  }
  repository = new PostgresConversationRepository({ connectionString });
  await repository.connect();
  await runMigrations(repository.pool);
  const aiConfig = aiConfigurationFromEnvironment();
  conversationArchitecture = aiConfig.conversationArchitecture;
  if (aiConfig.enabled && aiConfig.provider === 'deepseek') {
    const commercialService = new CommercialService();
    const provider = new DeepSeekProvider(aiConfig.deepseek);
    aiInterpreter = new AIInterpreter({ provider, commercialService });
    commercialAgent = new CommercialAgent({ provider, tools: new CommercialToolRegistry({ commercialService }) });
  }
  server.listen(port, '127.0.0.1', () => {
    console.log(`Simulador local listo en http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
