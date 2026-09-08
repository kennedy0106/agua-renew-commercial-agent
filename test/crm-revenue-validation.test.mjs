import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCalendarRange } from '../src/crm/crm-revenue-repository.mjs';

test('agenda acepta un intervalo válido', () => {
  const result = validateCalendarRange('2026-09-02T10:00:00-05:00', '2026-09-02T11:00:00-05:00');
  assert.equal(result.starts.toISOString(), '2026-09-02T15:00:00.000Z');
  assert.equal(result.ends.toISOString(), '2026-09-02T16:00:00.000Z');
});

test('agenda rechaza una fecha de fin anterior al inicio', () => {
  assert.throws(
    () => validateCalendarRange('2026-09-02T12:00:00-05:00', '2026-09-02T11:00:00-05:00'),
    /no puede ser anterior/,
  );
});

test('agenda rechaza fechas ilegibles', () => {
  assert.throws(() => validateCalendarRange('fecha', 'otra fecha'), /no son válidas/);
});
