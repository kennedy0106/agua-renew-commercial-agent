#!/usr/bin/env node
/**
 * Intercambia un access token de corto plazo de la página por uno de LARGO PLAZO
 * (validez ~60 días) usando la Graph API, y lo guarda en META_PAGE_ACCESS_TOKEN del .env.
 *
 * Uso:
 *   node scripts/exchange-token.mjs <TOKEN_CORTO>
 *
 * El token corto se pasa por argumento (no se imprime ni queda en el código).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadEnvironment } from '../src/config/environment.mjs';

loadEnvironment();

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, '.env');

const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
const shortToken = process.argv[2];

if (!appId || !appSecret) {
  console.error('Falta META_APP_ID o META_APP_SECRET en el .env.');
  process.exit(1);
}
if (!shortToken) {
  console.error('Pasa el token corto como argumento: node scripts/exchange-token.mjs <TOKEN_CORTO>');
  process.exit(1);
}

const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;

const response = await fetch(url);
const data = await response.json();

if (!response.ok || !data.access_token) {
  console.error('Error al intercambiar el token:');
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const longToken = data.access_token;
const expiresIn = data.expires_in; // segundos (~60 días = 5184000)

// Actualizar META_PAGE_ACCESS_TOKEN en el .env preservando el resto del archivo.
if (data.expires_in && data.expires_in < 60 * 60 * 24 * 30) {
  console.warn(`⚠️  Validez corta (${Math.round(data.expires_in / 3600)} h). Revisa permisos.`);
}

const env = readFileSync(envPath, 'utf8');
const line = new RegExp(`^META_PAGE_ACCESS_TOKEN=.*$`, 'm');
const replaced = line.test(env)
  ? env.replace(line, `META_PAGE_ACCESS_TOKEN=${longToken}`)
  : `${env.trimEnd()}\nMETA_PAGE_ACCESS_TOKEN=${longToken}\n`;
writeFileSync(envPath, replaced);

console.log('✅ Token de largo plazo guardado en META_PAGE_ACCESS_TOKEN (.env).');
console.log(`   Validez: ~${Math.round((expiresIn ?? 0) / 86400)} días`);
console.log('   (No imprimimos el token por seguridad).');
