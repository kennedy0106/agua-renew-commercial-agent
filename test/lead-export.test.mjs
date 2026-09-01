import assert from 'node:assert/strict';
import test from 'node:test';
import { leadsToCsv, leadsToXlsx } from '../src/admin/lead-export.mjs';

const LEAD = {
  id: '1', sourceChannel: 'instagram', sourceOrigin: 'organic_dm', sourceAdId: null,
  metaUserId: 'ig-1', metaUsername: '@usuario',
  conversationType: 'commercial_lead', classificationConfidence: 0.95,
  phoneE164: '+51955623069', product: '20l', modality: 'maquila',
  status: 'READY_FOR_WHATSAPP', controlMode: 'AUTO',
  whatsappOpenedAt: null, contactedAt: null, metaConfirmationSentAt: null,
  createdAt: '2026-08-24T10:00:00.000Z', updatedAt: '2026-08-24T10:00:00.000Z',
};

test('CSV: BOM, encabezados, datos y escape de comas', () => {
  const csv = leadsToCsv([LEAD, { ...LEAD, id: '2', metaUsername: 'con, coma' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /ID,Fecha de creación,Canal,Origen,Usuario Meta,Tipo de conversación,Confianza clasificación,WhatsApp,Producto,Modalidad,Estado,Modo de control/);
  assert.match(csv, /Instagram/);
  assert.match(csv, /\+51955623069/);
  assert.match(csv, /"con, coma"/);
});

test('CSV: campos vacíos quedan vacíos (no inventa datos)', () => {
  const csv = leadsToCsv([{ ...LEAD, product: null, modality: null, phoneE164: null }]);
  assert.ok(csv.includes(',,,'));
});

test('CSV: valores legibles para producto y modalidad', () => {
  const csv = leadsToCsv([LEAD]);
  assert.match(csv, /Bidón de 20 L/);
  assert.match(csv, /Maquila/);
});

test('XLSX: genera un zip válido con hoja de datos', () => {
  const buffer = leadsToXlsx([LEAD]);
  assert.equal(buffer[0], 0x50); // 'P'
  assert.equal(buffer[1], 0x4B); // 'K'
  const sheet = extractFromZip(buffer, 'xl/worksheets/sheet1.xml');
  assert.match(sheet, /commercial_lead/);
  assert.match(sheet, /@usuario/);
  assert.match(sheet, /READY_FOR_WHATSAPP/);
  const contentTypes = extractFromZip(buffer, '[Content_Types].xml');
  assert.match(contentTypes, /worksheet/);
});

/** Extrae el contenido de una entrada de un zip (método stored) para verificación en tests. */
function extractFromZip(buffer, entryName) {
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + buffer.readUInt32LE(offset + 18));
    if (name === entryName) {
      if (method !== 0) throw new Error('zip entry no stored');
      return data.toString('utf8');
    }
    offset = dataStart + data.length;
  }
  throw new Error(`entrada ${entryName} no encontrada en el zip`);
}
