import assert from 'node:assert/strict';
import test from 'node:test';
import { productIdFor } from '../src/leads/product-catalog-map.mjs';
import { buildWhatsAppLink } from '../src/leads/whatsapp-link.mjs';

test('mapeo {product, modality} → productId del CommercialAgent', () => {
  assert.equal(productIdFor({ product: '20l', modality: 'maquila' }), 'maquila_bidon_20l');
  assert.equal(productIdFor({ product: '20l', modality: 'distribution_agua_renew' }), 'distribution_bidon_20l');
  assert.equal(productIdFor({ product: '20l', modality: 'final_customer' }), 'final_customer_bidon_20l_new');
  assert.equal(productIdFor({ product: '1l', modality: 'maquila' }), 'maquila_botella_1l_fliptop');
  assert.equal(productIdFor({ product: '625ml', modality: 'maquila' }), 'maquila_botella_625ml_rosca');
  assert.equal(productIdFor({ product: '10_5l', modality: 'distribution_agua_renew' }), 'distribution_galonera_10_5l');
});

test('mapeo devuelve null para combinaciones sin producto o sin modalidad', () => {
  assert.equal(productIdFor({ product: '20l', modality: null }), null);
  assert.equal(productIdFor({ product: null, modality: 'maquila' }), null);
  assert.equal(productIdFor({ product: '1l', modality: 'final_customer' }), null); // no existe en catálogo
  assert.equal(productIdFor({}), null);
});

test('enlace WhatsApp: producto + modalidad conocidos', () => {
  const link = buildWhatsAppLink({
    phoneE164: '+51955623069', product: '625ml', modality: 'maquila',
    channel: 'instagram', date: new Date('2026-08-24T17:00:00Z'), // 12:00 Lima → Buenas tardes
  });
  assert.match(link.url, /^https:\/\/wa\.me\/51955623069\?text=/);
  assert.match(link.message, /Buenas tardes/);
  assert.match(link.message, /Instagram/);
  assert.match(link.message, /botellas de 625 ml/);
  assert.match(link.message, /su propia marca/);
  assert.equal(decodeURIComponent(link.url.split('?text=')[1]), link.message);
});

test('enlace WhatsApp: solo producto (no inventa modalidad)', () => {
  const link = buildWhatsAppLink({
    phoneE164: '+51955623069', product: '20l', modality: null,
    channel: 'instagram', date: new Date('2026-08-24T17:00:00Z'),
  });
  assert.match(link.message, /bidones de 20 L/);
  assert.doesNotMatch(link.message, /propia marca/);
  assert.doesNotMatch(link.message, /distribuci/);
});

test('enlace WhatsApp: solo modalidad (no inventa producto)', () => {
  const link = buildWhatsAppLink({
    phoneE164: '+51955623069', product: null, modality: 'maquila',
    channel: 'instagram', date: new Date('2026-08-24T17:00:00Z'),
  });
  assert.match(link.message, /su propia marca/);
  assert.doesNotMatch(link.message, /botella|bidón|galonera/);
});

test('enlace WhatsApp: sin datos → mensaje genérico, sin inventar nada', () => {
  const link = buildWhatsAppLink({
    phoneE164: '+51955623069', product: null, modality: null,
    channel: 'facebook_messenger', date: new Date('2026-08-24T17:00:00Z'),
  });
  assert.match(link.message, /Facebook/);
  assert.match(link.message, /información solicitada/);
  assert.doesNotMatch(link.message, /botella|bidón|galonera|propia marca/);
});

test('enlace WhatsApp: requiere teléfono válido', () => {
  assert.throws(() => buildWhatsAppLink({ phoneE164: null, product: null, modality: null, channel: 'instagram' }), /teléfono/);
});
