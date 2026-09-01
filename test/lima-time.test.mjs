import assert from 'node:assert/strict';
import test from 'node:test';
import { greetingForDate, nowInLima } from '../src/shared/lima-time.mjs';

test('saludo Buenos días entre 05:00 y 11:59 hora Lima', () => {
  // UTC 10:00 = Lima 05:00
  assert.equal(greetingForDate(new Date('2026-08-24T10:00:00Z')), 'Buenos días');
  // UTC 16:59:59 = Lima 11:59:59
  assert.equal(greetingForDate(new Date('2026-08-24T16:59:59Z')), 'Buenos días');
});

test('saludo Buenas tardes entre 12:00 y 18:59 hora Lima', () => {
  // UTC 17:00 = Lima 12:00
  assert.equal(greetingForDate(new Date('2026-08-24T17:00:00Z')), 'Buenas tardes');
  // UTC 23:59:59 = Lima 18:59:59
  assert.equal(greetingForDate(new Date('2026-08-24T23:59:59Z')), 'Buenas tardes');
});

test('saludo Buenas noches entre 19:00 y 04:59 hora Lima', () => {
  // UTC 00:00 del 25 = Lima 19:00 del 24
  assert.equal(greetingForDate(new Date('2026-08-25T00:00:00Z')), 'Buenas noches');
  // UTC 09:59:59 = Lima 04:59:59
  assert.equal(greetingForDate(new Date('2026-08-24T09:59:59Z')), 'Buenas noches');
});

test('nowInLima devuelve un Date válido', () => {
  const d = nowInLima();
  assert.ok(d instanceof Date);
  assert.ok(!Number.isNaN(d.getTime()));
});
