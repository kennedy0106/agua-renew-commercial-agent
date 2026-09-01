#!/usr/bin/env node
/**
 * Simulador de webhook de Meta para desarrollo local.
 *
 * Uso:
 *   node scripts/mock-meta.mjs "20 litros con mi marca, mi número es 955623069"
 *   node scripts/mock-meta.mjs "Somos una agencia de marketing" --user cust-2
 *   node scripts/mock-meta.mjs "hola" --origin ad_automation --url http://localhost:4000
 *
 * Envía un webhook real (con firma HMAC si META_APP_SECRET está en .env) al
 * servidor local y muestra el resumen procesado.
 */
import { loadEnvironment } from '../src/config/environment.mjs';
import { createHmac } from 'node:crypto';

loadEnvironment();

const [text, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
if (!text) {
  console.error('Uso: node scripts/mock-meta.mjs "<mensaje>" [--user id] [--origin ad_automation|organic_dm] [--url http://localhost:4000]');
  process.exit(1);
}

const baseUrl = args.url ?? process.env.META_SERVER_URL ?? 'http://localhost:4000';
const user = args.user ?? 'mock-user-1';
const origin = args.origin ?? 'organic_dm';
const appSecret = process.env.META_APP_SECRET ?? null;
const mid = `mock-mid-${Date.now()}`;

const payload = {
  object: 'instagram',
  entry: [{
    id: 'ig-business',
    time: Date.now(),
    messaging: [{
      sender: { id: user },
      recipient: { id: 'ig-business' },
      timestamp: Date.now(),
      message: { mid, text },
    }],
  }],
};

// El origen no viaja en el webhook real: se infiere por el texto/flag.
if (origin !== 'organic_dm') {
  // Marca el mensaje como automatización vía metadata simulada (solo dev).
  payload.entry[0].messaging[0].message.is_echo = origin === 'ad_automation';
}

const rawBody = JSON.stringify(payload);
const headers = { 'Content-Type': 'application/json' };
if (appSecret) {
  headers['X-Hub-Signature-256'] = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

console.log(`→ POST ${baseUrl}/webhook/meta (${user}): "${text}"`);
const response = await fetch(`${baseUrl}/webhook/meta`, { method: 'POST', headers, body: rawBody });
const result = await response.json();
console.log(`← ${response.status}`, JSON.stringify(result, null, 2));

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].startsWith('--')) out[list[i].slice(2)] = list[i + 1];
  }
  return out;
}
