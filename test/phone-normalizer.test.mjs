import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePhone } from '../src/leads/phone-normalizer.mjs';

test('normaliza variantes de un número peruano al formato E.164', () => {
  assert.equal(normalizePhone('955 623 069'), '+51955623069');
  assert.equal(normalizePhone('955-623-069'), '+51955623069');
  assert.equal(normalizePhone('+51 955623069'), '+51955623069');
  assert.equal(normalizePhone('51955623069'), '+51955623069');
  assert.equal(normalizePhone('955.623.069'), '+51955623069');
  assert.equal(normalizePhone('967309516'), '+51967309516');
  assert.equal(normalizePhone('(51) 955 623 069'), '+51955623069');
});

test('devuelve null para entradas no válidas', () => {
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('9876543210'), null); // 10 dígitos
  assert.equal(normalizePhone('+519876543210'), null); // 11 dígitos después del 51
  assert.equal(normalizePhone('123456789'), null); // no empieza con 9 (móvil peruano)
});

test('acepta número con texto alrededor (mensaje libre)', () => {
  assert.equal(normalizePhone('Mi número es 955623069, gracias'), '+51955623069');
  assert.equal(normalizePhone('999999999'), '+51999999999');
});
