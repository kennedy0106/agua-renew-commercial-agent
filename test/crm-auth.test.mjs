import test from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../src/crm/crm-auth.mjs';

test('CRM auth: scrypt valida la contraseña sin almacenarla en claro', async () => {
  const encoded = await hashPassword('Una-clave-segura-2026');
  assert.match(encoded, /^scrypt-v1\$/);
  assert.equal(encoded.includes('Una-clave-segura-2026'), false);
  assert.equal(await verifyPassword('Una-clave-segura-2026', encoded), true);
  assert.equal(await verifyPassword('clave-equivocada', encoded), false);
});

test('CRM auth: exige un mínimo de 12 caracteres', async () => {
  await assert.rejects(() => hashPassword('corta'), /12 caracteres/);
});
