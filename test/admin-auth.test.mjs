import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminAuth } from '../src/admin/admin-auth.mjs';

test('auth: login crea cookie HttpOnly y la sesión expira', () => {
  let now = new Date('2026-08-31T12:00:00Z');
  const auth = new AdminAuth({ secret: 'x'.repeat(32), ttlMs: 1000, secure: true, clock: () => now });
  const login = auth.login({ password: 'x'.repeat(32), ip: '1.2.3.4' });
  assert.equal(login.ok, true);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Strict/);
  assert.match(login.cookie, /Secure/);
  const cookie = login.cookie.split(';')[0];
  assert.equal(auth.isAuthenticated({ cookie }), true);
  now = new Date(now.getTime() + 1001);
  assert.equal(auth.isAuthenticated({ cookie }), false);
});

test('auth: limita cinco claves incorrectas por IP', () => {
  const auth = new AdminAuth({ secret: 'correcta'.repeat(4) });
  for (let index = 0; index < 5; index += 1) assert.equal(auth.login({ password: 'mala', ip: 'x' }).status, 401);
  assert.equal(auth.login({ password: 'correcta'.repeat(4), ip: 'x' }).status, 429);
});

test('auth: valida Origin para mutaciones con cookie y permite bearer', () => {
  const auth = new AdminAuth({ secret: 'x'.repeat(32) });
  assert.equal(auth.validOrigin({ origin: 'https://panel.example.com', host: 'panel.example.com' }), true);
  assert.equal(auth.validOrigin({ origin: 'https://evil.example', host: 'panel.example.com' }), false);
  assert.equal(auth.validOrigin({ authorization: `Bearer ${'x'.repeat(32)}` }), true);
});
