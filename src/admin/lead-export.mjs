import { productLabel } from '../leads/lead-states.mjs';

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const MODALITY_SHORT = {
  maquila: 'Maquila',
  distribution_agua_renew: 'Distribución Agua ReNew',
  final_customer: 'Consumo propio',
};

/** Columnas del export según FASE_1 §45. */
const COLUMNS = [
  ['ID', (lead) => lead.id],
  ['Fecha de creación', (lead) => lead.createdAt ?? ''],
  ['Canal', (lead) => ({ instagram: 'Instagram', facebook_messenger: 'Facebook' }[lead.sourceChannel] ?? lead.sourceChannel ?? '')],
  ['Origen', (lead) => lead.sourceOrigin ?? ''],
  ['Usuario Meta', (lead) => lead.metaUsername ?? ''],
  ['Tipo de conversación', (lead) => lead.conversationType ?? ''],
  ['Confianza clasificación', (lead) => (lead.classificationConfidence === null || lead.classificationConfidence === undefined ? '' : String(lead.classificationConfidence))],
  ['WhatsApp', (lead) => lead.phoneE164 ?? ''],
  ['Producto', (lead) => capitalize(productLabel(lead.product) ?? '')],
  ['Modalidad', (lead) => MODALITY_SHORT[lead.modality] ?? ''],
  ['Estado', (lead) => lead.status ?? ''],
  ['Modo de control', (lead) => lead.controlMode ?? ''],
  ['Fecha apertura WhatsApp', (lead) => lead.whatsappOpenedAt ?? ''],
  ['Fecha de contacto', (lead) => lead.contactedAt ?? ''],
  ['Fecha confirmación Meta', (lead) => lead.metaConfirmationSentAt ?? ''],
];

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV con BOM (compatible Excel/Unicode). */
export function leadsToCsv(leads) {
  const lines = [COLUMNS.map(([name]) => name).join(',')];
  for (const lead of leads) {
    lines.push(COLUMNS.map(([, get]) => csvEscape(get(lead))).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

// ── XLSX mínimo (sin dependencias): ZIP stored + hojas con inline strings ──

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index) {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function sheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function makeLocalHeader(nameBuffer, data) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // flags
  header.writeUInt16LE(0, 8); // method: stored
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28); // extra length
  return header;
}

function makeCentralHeader(localHeader, nameBuffer, data, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4); // version made by
  header.writeUInt16LE(20, 6); // version needed
  header.writeUInt16LE(0, 8); // flags
  header.writeUInt16LE(0, 10); // method: stored
  header.writeUInt16LE(0, 12); // mod time
  header.writeUInt16LE(0, 14); // mod date
  header.writeUInt32LE(localHeader.readUInt32LE(14), 16); // crc
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30); // extra length
  header.writeUInt16LE(0, 32); // comment length
  header.writeUInt16LE(0, 34); // disk number
  header.writeUInt16LE(0, 36); // internal attrs
  header.writeUInt32LE(0, 38); // external attrs
  header.writeUInt32LE(offset, 42); // local header offset
  return header;
}

/** XLSX mínimo válido (ZIP sin compresión, inline strings). */
export function leadsToXlsx(leads) {
  const headerRow = COLUMNS.map(([name]) => name);
  const dataRows = leads.map((lead) => COLUMNS.map(([, get]) => get(lead) ?? ''));
  const rows = [headerRow, ...dataRows];

  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(rows)) },
  ];

  // Parte local: headers + nombres + datos.
  const parts = [];
  const localHeaders = [];
  let offset = 0;
  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const localHeader = makeLocalHeader(nameBuffer, file.data);
    localHeaders.push(localHeader);
    parts.push(localHeader, nameBuffer, file.data);
    offset += 30 + nameBuffer.length + file.data.length;
  }

  // Directorio central + EOCD.
  const central = [];
  let centralOffset = 0;
  for (let i = 0; i < files.length; i += 1) {
    const nameBuffer = Buffer.from(files[i].name, 'utf8');
    const entryOffset = centralOffset;
    centralOffset += 30 + nameBuffer.length + files[i].data.length;
    // El offset del directorio central es el del local header, no el del central.
    central.push(makeCentralHeader(localHeaders[i], nameBuffer, files[i].data, entryOffset));
    central.push(nameBuffer);
  }
  const centralSize = central.reduce((sum, buffer) => sum + buffer.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16); // offset del directorio central
  return Buffer.concat([...parts, ...central, eocd]);
}
