import assert from 'node:assert/strict';
import test from 'node:test';
import { CommercialService, HANDOFF_MESSAGE } from '../src/commercial/commercial-service.mjs';

const service = new CommercialService();

test('lista productos por modalidad sin mezclar modalidades comerciales', () => {
  const result = service.list_products({ modality: 'distribution_agua_renew' });
  assert.equal(result.status, 'ok');
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((product) => !product.id.startsWith('maquila_')));
  assert.ok(result.data.every((product) => !product.id.startsWith('final_customer_')));
});

test('resume precios y mínimos de varias presentaciones sin seleccionar una escala', () => {
  const service = new CommercialService();
  const result = service.get_product_comparison({ modality: 'distribution_agua_renew', requestedInformation: ['prices', 'minimums'] });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.products.length, 5);
  assert.equal(result.data.products.find((product) => product.id === 'distribution_bidon_20l').exact_price.amount_pen, 7);
  assert.equal(result.data.products.find((product) => product.id === 'distribution_botella_1l_fliptop').price_requires_context, true);
});

test('consulta precio de compra de distribución sin usar precio sugerido de reventa', () => {
  const result = service.get_purchase_price({
    productId: 'distribution_botella_1l_fliptop',
    quantity: 10,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.price_type, 'purchase');
  assert.equal(result.data.tier.price.amount_pen, 1.4);
  assert.equal(result.data.tier.package_price_pen, 14);
});

test('consulta precio de cliente final como precio de compra directo de planta', () => {
  const result = service.get_purchase_price({
    productId: 'final_customer_bidon_20l_refill',
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.price_type, 'purchase');
  assert.equal(result.data.price.amount_pen, 12);
  assert.equal(result.data.collection, 'Compra directa en planta');
});

test('las cinco ambigüedades vigentes tienen regla de bloqueo; dos fueron superadas por overrides', () => {
  const coveredIds = new Set([
    ...service.check_ambiguities({ modality: 'maquila', topic: 'first_order_labels' }).ambiguities,
    ...service.check_ambiguities({ operation: 'suggested_resale_price', productName: 'Recarga de bidón de 20 L' }).ambiguities,
    ...service.check_ambiguities({ operation: 'delivery_information' }).ambiguities,
    ...service.check_ambiguities({ operation: 'purchase_price', productId: 'maquila_galonera_10_5l' }).ambiguities,
    ...service.check_ambiguities({ topic: 'proforma_agua_de_mesa_12_unidades' }).ambiguities,
  ].map((ambiguity) => ambiguity.id));

  assert.deepEqual(
    coveredIds,
    new Set([
      'maquila_label_offer_vs_cost',
      'public_suggested_prices',
      'collection_points',
      'maquila_galonera_scope',
      'proforma_package_mismatch',
    ]),
  );
  // maquila_20l_minimum y bidon_new_maquila_price_components quedan documentadas
  // en el JSON fuente pero ya no bloquean (superadas por commercial_overrides.json).
  assert.equal(service.check_ambiguities({ operation: 'purchase_price', productId: 'maquila_bidon_20l', quantity: 30 }).blocked, false);
  assert.equal(service.check_ambiguities({ operation: 'purchase_price', productId: 'maquila_bidon_20l', purchaseType: 'new_bidon_first_refill', quantity: 50 }).blocked, false);
});

test('CASO 5: maquila de bidones 20 L no ofrece la excepción de 30: below_minimum con mínimo vigente 50', () => {
  const result = service.get_purchase_price({
    productId: 'maquila_bidon_20l',
    purchaseType: 'refill_with_own_container',
    quantity: 30,
  });
  assert.equal(result.status, 'below_minimum');
  assert.equal(result.handoff_required, undefined);
  assert.equal(result.data.minimum.value, 50);
  assert.equal(result.data.minimum.unit, 'unidades');
  assert.equal(result.data.quantity, 30);
  assert.match(result.message, /50/);
});

test('maquila de bidones 20 L sin cantidad solicita cantidad sin derivar', () => {
  const result = service.get_purchase_price({
    productId: 'maquila_bidon_20l',
  });
  assert.equal(result.status, 'input_required');
  assert.deepEqual(result.required, ['quantity']);
  assert.equal(result.handoff_required, undefined);
});

test('permite precio de maquila de bidones cuando la consulta no depende del mínimo ambiguo', () => {
  const result = service.get_purchase_price({
    productId: 'maquila_bidon_20l',
    purchaseType: 'refill_with_own_container',
    fulfillment: 'plant_collection',
    quantity: 500,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.tier.price.amount_pen, 5.8);
});

test('maquila de más de 400 recargas en punto autorizado solicita cambio o confirmación de recojo', () => {
  const result = service.get_purchase_price({
    productId: 'maquila_bidon_20l',
    purchaseType: 'refill_with_own_container',
    fulfillment: 'authorized_collection_point',
    quantity: 500,
  });
  assert.equal(result.status, 'fulfillment_confirmation_required');
  assert.equal(result.current_fulfillment, 'authorized_collection_point');
  assert.equal(result.next_action, 'confirm_or_change_fulfillment');
  assert.match(result.message, /recojo en planta/);
});

test('CASO 6: consulta el bidón nuevo de maquila (S/ 19) cuando están todos los datos', () => {
  const result = service.get_purchase_price({
    productId: 'maquila_bidon_20l',
    purchaseType: 'new_bidon_first_refill',
    quantity: 50,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.price.amount_pen, 19);
  assert.equal(result.data.purchase_type, 'new_bidon_first_refill');
  assert.deepEqual(result.data.inclusions, ['envase', 'primera recarga']);
  assert.deepEqual(result.data.exclusions, ['etiqueta personalizada']);
  assert.equal(result.data.label_included, false);
  assert.equal(result.data.minimum.value, 50);
  assert.equal(result.data.fulfillment, 'plant_collection');
  assert.equal(result.data.collection, 'recojo en planta');
});

test('bloquea promesa de etiquetas de primer pedido', () => {
  const result = service.get_additional_service('Etiquetas personalizadas', {
    topic: 'first_order_labels',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.ambiguities[0].id, 'maquila_label_offer_vs_cost');
});

test('bloquea precios sugeridos que tienen rangos distintos en la fuente', () => {
  const result = service.list_suggested_resale_prices({
    productName: 'Botella de 1 L',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.ambiguities[0].id, 'public_suggested_prices');

  const allSuggestedPrices = service.list_suggested_resale_prices();
  assert.equal(allSuggestedPrices.status, 'partial');
  assert.deepEqual(allSuggestedPrices.blocked_products, ['Recarga de bidón de 20 L', 'Botella de 1 L']);
  assert.deepEqual(
    new Set(allSuggestedPrices.data.prices.map((item) => item.product)),
    new Set(['Bidón completo de 20 L', 'Botella de 625 ml']),
  );
});

test('mantiene disponible el precio sugerido inequívoco de botella de 625 ml', () => {
  const result = service.list_suggested_resale_prices({ productName: 'Botella de 625 ml' });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.prices.length, 1);
  assert.equal(result.data.prices[0].range_pen, 'S/ 1.20');
});

test('la información de recojo exige modalidad y no da direcciones exactas', () => {
  const generic = service.get_delivery_information({});
  assert.equal(generic.status, 'blocked');
  assert.equal(generic.ambiguities[0].id, 'collection_points');

  const exact = service.get_delivery_information({
    modality: 'distribution_agua_renew',
    requireExactLocation: true,
  });
  assert.equal(exact.status, 'blocked');
  assert.equal(exact.ambiguities[0].id, 'collection_points');

  const documented = service.get_delivery_information({ modality: 'maquila' });
  assert.equal(documented.status, 'ok');
  assert.deepEqual(documented.data.collection_points, ['San Luis', 'Puente Piedra', 'San Juan de Miraflores']);
});

test('bloquea cotizar galonera de maquila si requiere definir su alcance', () => {
  const result = service.get_purchase_price({
    productId: 'maquila_galonera_10_5l',
    quantity: 50,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.ambiguities[0].id, 'maquila_galonera_scope');
});

test('proforma de 12 unidades no puede convertirse en precio general', () => {
  const result = service.check_ambiguities({
    topic: 'proforma_agua_de_mesa_12_unidades',
  });
  assert.equal(result.blocked, true);
  assert.equal(result.ambiguities[0].id, 'proforma_package_mismatch');
});

test('la derivación humana devuelve un contrato explícito sin llamar a IA', () => {
  const result = service.request_human_handoff({
    reason: 'Condición ambigua',
    context: { ambiguity_id: 'maquila_20l_minimum' },
  });
  assert.equal(result.status, 'human_handoff_requested');
  assert.equal(result.handoff_required, true);
  assert.equal(result.message, HANDOFF_MESSAGE);
});

for (const [quantity, expectedPrice] of [
  [400, 6.0],
  [401, 5.8],
  [650, 5.8],
  [651, 5.5],
  [700, 5.5],
]) {
  test(`maquila 20 L aplica la escala documentada para ${quantity} recargas`, () => {
    const result = service.get_purchase_price({
      productId: 'maquila_bidon_20l',
      purchaseType: 'refill_with_own_container',
      fulfillment: 'plant_collection',
      quantity,
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.tier.price.amount_pen, expectedPrice);
  });
}

for (const [quantity, unitPrice, packagePrice] of [
  [20, 1.5, 15],
  [30, 1.5, 15],
  [31, 1.4, 14],
  [50, 1.4, 14],
  [51, 1.3, 13],
]) {
  test(`maquila botella de 1 L aplica la escala documentada para ${quantity} paquetes`, () => {
    const result = service.get_purchase_price({
      productId: 'maquila_botella_1l_fliptop',
      quantity,
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.tier.price.amount_pen, unitPrice);
    assert.equal(result.data.tier.package_price_pen, packagePrice);
  });
}

for (const [quantity, unitPrice, packagePrice] of [
  [5, 1.5, 15],
  [9, 1.5, 15],
  [10, 1.4, 14],
  [20, 1.4, 14],
  [21, 1.3, 13],
]) {
  test(`distribución botella de 1 L aplica la escala documentada para ${quantity} paquetes`, () => {
    const result = service.get_purchase_price({
      productId: 'distribution_botella_1l_fliptop',
      quantity,
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.tier.price.amount_pen, unitPrice);
    assert.equal(result.data.tier.package_price_pen, packagePrice);
  });
}

for (const [quantity, unitPrice, packagePrice] of [
  [20, 0.8, 12],
  [35, 0.8, 12],
  [36, 0.75, 11.25],
  [59, 0.75, 11.25],
  [60, 0.7, 10.5],
]) {
  test(`maquila botella de 625 ml aplica la escala documentada para ${quantity} paquetes`, () => {
    const result = service.get_purchase_price({
      productId: 'maquila_botella_625ml_rosca',
      quantity,
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.tier.price.amount_pen, unitPrice);
    assert.equal(result.data.tier.package_price_pen, packagePrice);
  });
}

for (const [quantity, unitPrice, packagePrice] of [
  [5, 0.67, 10.05],
  [15, 0.67, 10.05],
  [16, 0.63, 9.45],
  [30, 0.63, 9.45],
  [31, 0.6, 9],
]) {
  test(`distribución botella de 625 ml aplica la escala documentada para ${quantity} paquetes`, () => {
    const result = service.get_purchase_price({
      productId: 'distribution_botella_625ml_rosca',
      quantity,
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.tier.price.amount_pen, unitPrice);
    assert.equal(result.data.tier.package_price_pen, packagePrice);
  });
}

test('cliente final conserva los precios directos de planta documentados', () => {
  const refill = service.get_purchase_price({ productId: 'final_customer_bidon_20l_refill' });
  const newBidon = service.get_purchase_price({ productId: 'final_customer_bidon_20l_new' });

  assert.equal(refill.status, 'ok');
  assert.equal(refill.data.price.amount_pen, 12);
  assert.equal(newBidon.status, 'ok');
  assert.equal(newBidon.data.price.amount_pen, 24);
  assert.deepEqual(newBidon.data.price.includes, ['envase', 'primera recarga']);
});

for (const district of ['Puente Piedra', 'Carabayllo']) {
  test(`documenta delivery gratuito de distribución para ${district}`, () => {
    const result = service.get_delivery_information({
      modality: 'distribution_agua_renew',
      district,
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.data.delivery_cost_status, 'free');
    assert.equal(result.data.district, district);
  });
}

test('delivery de distribución fuera de las condiciones gratuitas requiere asesor', () => {
  const result = service.get_delivery_information({
    modality: 'distribution_agua_renew',
    district: 'Cercado de Lima',
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.handoff_required, true);
  assert.match(result.reason, /cotización personalizada/);
});

test('devuelve not_found para producto y modalidad inválidos', () => {
  assert.equal(service.get_product('producto_inexistente').status, 'not_found');
  assert.equal(service.get_purchase_price({ productId: 'producto_inexistente', quantity: 10 }).status, 'not_found');
  assert.equal(service.get_commercial_modality('modalidad_inexistente').status, 'not_found');
  assert.equal(service.list_products({ modality: 'modalidad_inexistente' }).status, 'not_found');
  assert.equal(
    service.get_delivery_information({ modality: 'modalidad_inexistente' }).status,
    'not_found',
  );
});

for (const quantity of [-1, 0, 20.5, '20', Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`rechaza cantidad inválida: ${String(quantity)}`, () => {
    const result = service.get_purchase_price({
      productId: 'maquila_botella_1l_fliptop',
      quantity,
    });
    assert.equal(result.status, 'invalid_input');
    assert.equal(result.field, 'quantity');
  });
}

test('requiere cantidad cuando una escala de precio la necesita', () => {
  const result = service.get_purchase_price({
    productId: 'distribution_botella_625ml_rosca',
  });
  assert.equal(result.status, 'input_required');
  assert.deepEqual(result.required, ['quantity']);
});

// ── BLOQUE A · FASE 1/2: reglas vigentes y cotización completa ──

test('CASO 1: maquila 625 ml, 20 paquetes: precio, paquete de 15, mínimo 20, etiqueta incluida', () => {
  const result = service.get_purchase_price({ productId: 'maquila_botella_625ml_rosca', quantity: 20 });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.tier.price.amount_pen, 0.8);
  assert.equal(result.data.tier.package_price_pen, 12);
  assert.deepEqual(result.data.package, { contents: 15, unit: 'botellas', per: 'paquete' });
  assert.deepEqual(result.data.minimum, { value: 20, unit: 'paquetes' });
  assert.equal(result.data.label_included, true);
});

test('CASO 2: maquila 625 ml, 5 paquetes: no cotiza; mínimo 20 de forma estructurada', () => {
  const result = service.get_purchase_price({ productId: 'maquila_botella_625ml_rosca', quantity: 5 });
  assert.equal(result.status, 'below_minimum');
  assert.equal(result.handoff_required, undefined);
  assert.equal(result.data.quantity, 5);
  assert.equal(result.data.minimum.value, 20);
  assert.equal(result.data.minimum.unit, 'paquetes');
  assert.match(result.message, /mínimo vigente/);
});

test('CASO 3: maquila 1 L, 20 paquetes: precio, paquete de 10, mínimo 20, etiqueta incluida', () => {
  const result = service.get_purchase_price({ productId: 'maquila_botella_1l_fliptop', quantity: 20 });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.tier.price.amount_pen, 1.5);
  assert.equal(result.data.tier.package_price_pen, 15);
  assert.deepEqual(result.data.package, { contents: 10, unit: 'botellas', per: 'paquete' });
  assert.deepEqual(result.data.minimum, { value: 20, unit: 'paquetes' });
  assert.equal(result.data.label_included, true);
});

test('CASO 4: maquila bidón 20 L, 50 recargas con envase propio: S/ 6.00 y mínimo 50', () => {
  const result = service.get_purchase_price({
    productId: 'maquila_bidon_20l', purchaseType: 'refill_with_own_container',
    fulfillment: 'plant_collection', quantity: 50,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.data.tier.price.amount_pen, 6);
  assert.equal(result.data.purchase_type, 'refill_with_own_container');
  assert.equal(result.data.minimum.value, 50);
  assert.equal(result.data.label_included, false);
});

test('CASO 7: etiqueta personalizada: 625 ml y 1 L incluida; 20 L nuevo no incluida', () => {
  assert.equal(service.labelIncluded('maquila_botella_625ml_rosca'), true);
  assert.equal(service.labelIncluded('maquila_botella_1l_fliptop'), true);
  assert.equal(service.labelIncluded('maquila_bidon_20l', 'new_bidon_first_refill'), false);
  assert.equal(service.labelIncluded('maquila_bidon_20l', 'refill_with_own_container'), false);
});

test('CASO 8: la forma de pago general de maquila no está documentada y no reutiliza el 50% del logo', () => {
  const policy = service.get_payment_policy();
  assert.equal(policy.status, 'ok');
  assert.equal(policy.data.maquila_general.status, 'not_documented');
  assert.ok(policy.data.maquila_general.do_not_reuse.includes('Creación de logotipo profesional — Pack Básico'));
  // El 50% de adelanto pertenece únicamente al servicio de logotipo.
  const logo = service.get_additional_service('Creación de logotipo profesional — Pack Básico');
  assert.equal(logo.status, 'ok');
  assert.match(logo.data.payment, /50%/);
});
