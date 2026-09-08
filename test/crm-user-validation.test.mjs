import test from 'node:test';
import assert from 'node:assert/strict';

import { CrmRepository } from '../src/crm/crm-repository.mjs';

const actor = { id: '00000000-0000-4000-8000-000000000901', role: 'ADMIN' };
const repository = new CrmRepository({ pool: { query: async () => { throw new Error('La validación no debe consultar la base'); } } });

test('CRM usuarios: rechaza nombre ausente antes de persistir', async () => {
  await assert.rejects(repository.createUser({ email: 'ana@example.com', displayName: undefined, password: 'clave-segura-123', role: 'ADVISOR' }, actor), /nombre es obligatorio/i);
});

test('CRM usuarios: rechaza correo inválido antes de persistir', async () => {
  await assert.rejects(repository.createUser({ email: 'correo-invalido', displayName: 'Ana Torres', password: 'clave-segura-123', role: 'ADVISOR' }, actor), /correo inválido/i);
});
