import test from 'node:test';
import assert from 'node:assert/strict';

import { createQuotePdf } from '../src/crm/quote-pdf.mjs';

test('CRM: genera una cotización PDF válida y autocontenida', () => {
  const pdf = createQuotePdf({
    quote_number: 'AR-2026-000001', created_at: '2026-09-01T12:00:00Z', valid_until: null,
    contact_name: 'Cliente de prueba', phone_e164: '+51999999999', email: null,
    created_by_name: 'Asesor', total: 128.5,
    items: [{ description: 'Botella 625 ml', quantity: 20, unit_price: 6.425, line_total: 128.5 }],
  });
  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 8).toString('ascii'), '%PDF-1.4');
  assert.match(pdf.toString('ascii'), /AR-2026-000001/);
  assert.match(pdf.toString('ascii'), /%%EOF$/);
});
