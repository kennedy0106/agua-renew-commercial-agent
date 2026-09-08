function pdfText(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/([\\()])/g, '\\$1');
}

function money(value) {
  return `S/ ${Number(value ?? 0).toFixed(2)}`;
}

export function createQuotePdf(quote) {
  const issued = new Date(quote.created_at).toLocaleDateString('es-PE');
  const validUntil = quote.valid_until ? new Date(`${String(quote.valid_until).slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE') : 'Por confirmar';
  const lines = [
    ['F2', 22, 54, 790, 'AGUA RENEW'],
    ['F1', 10, 54, 773, 'SOLUCIONES DE AGUA PARA NEGOCIOS'],
    ['F2', 13, 350, 790, `COTIZACION ${quote.quote_number}`],
    ['F1', 10, 350, 773, `Emitida: ${issued}`],
    ['F1', 10, 350, 758, `Valida hasta: ${validUntil}`],
    ['F2', 11, 54, 718, 'CLIENTE'],
    ['F1', 12, 54, 698, quote.contact_name],
    ['F1', 10, 54, 682, quote.phone_e164 || 'Telefono no registrado'],
    ['F1', 10, 54, 666, quote.email || 'Correo no registrado'],
    ['F2', 10, 54, 625, 'PRODUCTO / SERVICIO'],
    ['F2', 10, 365, 625, 'CANT.'],
    ['F2', 10, 425, 625, 'P. UNIT.'],
    ['F2', 10, 515, 625, 'TOTAL'],
  ];
  let y = 598;
  for (const item of quote.items) {
    lines.push(['F1', 10, 54, y, String(item.description).slice(0, 48)]);
    lines.push(['F1', 10, 375, y, Number(item.quantity).toFixed(0)]);
    lines.push(['F1', 10, 425, y, money(item.unit_price)]);
    lines.push(['F1', 10, 515, y, money(item.line_total)]);
    y -= 24;
  }
  y = Math.min(y - 18, 520);
  if (Number(quote.discount_total ?? 0) > 0) {
    lines.push(['F1', 10, 410, y + 20, 'SUBTOTAL']);
    lines.push(['F1', 10, 500, y + 20, money(quote.subtotal)]);
    lines.push(['F1', 10, 410, y + 4, 'DESCUENTO']);
    lines.push(['F1', 10, 500, y + 4, `- ${money(quote.discount_total)}`]);
    y -= 20;
  }
  lines.push(['F2', 12, 410, y, 'TOTAL']);
  lines.push(['F2', 14, 500, y, money(quote.total)]);
  lines.push(['F2', 10, 54, 150, 'CONDICIONES']);
  lines.push(['F1', 9, 54, 132, String(quote.terms || 'Precios expresados en soles. La disponibilidad y entrega se coordinan con el asesor comercial.').slice(0, 92)]);
  lines.push(['F1', 9, 54, 116, `Asesor: ${quote.created_by_name || 'Equipo comercial Agua ReNew'}`]);
  lines.push(['F2', 10, 54, 72, 'AGUA RENEW  |  Calidad que impulsa tu negocio']);

  const commands = [
    '0.07 0.34 0.38 rg 0 735 612 107 re f',
    '0.95 0.98 0.97 rg 40 642 532 78 re f',
    '0.07 0.34 0.38 RG 0.8 w 40 638 m 572 638 l S',
    '0.82 0.87 0.86 RG 0.5 w 40 160 m 572 160 l S',
  ];
  for (const [font, size, x, lineY, value] of lines) {
    const white = lineY > 735 || lineY < 90;
    commands.push(`${white ? '1 1 1' : '0.08 0.12 0.13'} rg BT /${font} ${size} Tf ${x} ${lineY} Td (${pdfText(value)}) Tj ET`);
  }
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'ascii');
}
