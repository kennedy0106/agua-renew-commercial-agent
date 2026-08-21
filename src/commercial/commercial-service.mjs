import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KNOWLEDGE_FILE = fileURLToPath(
  new URL('../../knowledge/agua_renew_commercial_data.json', import.meta.url),
);
const OVERRIDES_FILE = fileURLToPath(
  new URL('../../knowledge/commercial_overrides.json', import.meta.url),
);

const HANDOFF_MESSAGE =
  'Para confirmarlo correctamente, te derivaré con un asesor.';

const AMBIGUITY_RULES = {
  // NOTA: 'maquila_20l_minimum' y 'bidon_new_maquila_price_components' fueron
  // superadas por las reglas vigentes en knowledge/commercial_overrides.json
  // (mínimo público 50, sin excepción de 30; S/ 19 consultable). La
  // documentación histórica se conserva en el JSON fuente, pero ya no bloquea.
  maquila_label_offer_vs_cost: (context) =>
    context.modality === 'maquila' &&
    (context.topic === 'first_order_labels' || context.withPersonalizedLabels === true),
  public_suggested_prices: (context) =>
    context.operation === 'suggested_resale_price' &&
    ['Recarga de bidón de 20 L', 'Botella de 1 L'].includes(context.productName),
  collection_points: (context) =>
    context.operation === 'delivery_information' &&
    (!context.modality || context.requireExactLocation === true),
  maquila_galonera_scope: (context) =>
    context.productId === 'maquila_galonera_10_5l' &&
    ['purchase_price', 'product_scope'].includes(context.operation),
  proforma_package_mismatch: (context) =>
    context.topic === 'proforma_agua_de_mesa_12_unidades',
};

function copy(value) {
  return structuredClone(value);
}

function success(data) {
  return { status: 'ok', data: copy(data) };
}

function notFound(entity, value) {
  return {
    status: 'not_found',
    error: `${entity} no encontrado: ${value}`,
  };
}

function blocked(ambiguities) {
  return {
    status: 'blocked',
    blocked: true,
    message: HANDOFF_MESSAGE,
    ambiguities: copy(ambiguities),
    handoff_required: true,
  };
}

function advisorRequired(reason) {
  return {
    status: 'blocked',
    blocked: true,
    message: HANDOFF_MESSAGE,
    reason,
    handoff_required: true,
  };
}

function invalidQuantity(quantity) {
  return {
    status: 'invalid_input',
    field: 'quantity',
    value: quantity,
    message: 'La cantidad debe ser un número entero positivo.',
  };
}

function parseRange(text) {
  const numbers = [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (text.startsWith('hasta ') && numbers.length === 1) {
    return { min: 0, max: numbers[0] };
  }
  if (text.startsWith('desde ') && numbers.length === 1) {
    return { min: numbers[0], max: Number.POSITIVE_INFINITY };
  }
  if (numbers.length >= 2) {
    return { min: numbers[0], max: numbers[1] };
  }
  return null;
}

function findTier(tiers, quantity) {
  return tiers.find((tier) => {
    const range = parseRange(tier.quantity);
    return range && quantity >= range.min && quantity <= range.max;
  });
}

/**
 * Read-only commercial domain layer. It never reads the original Word files.
 * The constructor accepts data only to make tests and future persistence adapters simple.
 */
export class CommercialService {
  constructor(data = JSON.parse(readFileSync(KNOWLEDGE_FILE, 'utf8')), overrides = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8'))) {
    this.data = copy(data);
    this.overrides = copy(overrides);
    this.productsById = new Map();

    for (const [modality, products] of Object.entries(this.data.products)) {
      for (const product of products) {
        this.productsById.set(product.id, { ...product, modality });
      }
    }

    this.applyVigentOverrides();
  }

  /** Aplica las reglas comerciales vigentes sobre los productos en memoria:
   * el override prevalece sobre el documento normalizado. */
  applyVigentOverrides() {
    const rules = this.overrides.overrides ?? {};
    const labels = this.overrides.label_policy ?? {};
    for (const [productId, product] of this.productsById) {
      const rule = rules[productId];
      if (rule?.public_minimum) product.minimum = copy(rule.public_minimum);
      const labelRule = labels[productId];
      if (labelRule && typeof labelRule.label_included === 'boolean' && !product.prices) {
        product.label_included = labelRule.label_included;
      }
    }
    // El bidón de 20 L tiene reglas por tipo de compra; expone el hecho público
    // dominante (etiqueta no incluida) y los tipos de compra consultables.
    const bidon = this.productsById.get('maquila_bidon_20l');
    if (bidon) {
      bidon.purchase_types = ['refill_with_own_container', 'new_bidon_first_refill'];
      bidon.label_included = this.labelIncluded('maquila_bidon_20l', 'new_bidon_first_refill');
    }
  }

  labelIncluded(productId, purchaseType = null) {
    const labelRule = this.overrides.label_policy?.[productId];
    if (!labelRule) return null;
    if (purchaseType && typeof labelRule[purchaseType]?.label_included === 'boolean') {
      return labelRule[purchaseType].label_included;
    }
    if (typeof labelRule.label_included === 'boolean') return labelRule.label_included;
    return null;
  }

  /** Exclusiones de etiqueta derivadas de la regla vigente (no de texto libre). */
  labelExclusions(productId, purchaseType = null) {
    return this.labelIncluded(productId, purchaseType) === false ? ['etiqueta personalizada'] : [];
  }

  get_payment_policy() {
    const policy = this.overrides.payment_policy ?? {};
    return success(policy);
  }

  check_ambiguities(context = {}) {
    const documentedById = new Map(
      this.data.ambiguities_and_conflicts.map((ambiguity) => [ambiguity.id, ambiguity]),
    );

    const matches = Object.entries(AMBIGUITY_RULES)
      .filter(([id, matchesContext]) => documentedById.has(id) && matchesContext(context))
      .map(([id]) => documentedById.get(id));

    return {
      blocked: matches.length > 0,
      ambiguities: copy(matches),
    };
  }

  request_human_handoff({ reason = 'Consulta comercial requiere revisión humana', context = {} } = {}) {
    return {
      status: 'human_handoff_requested',
      handoff_required: true,
      message: HANDOFF_MESSAGE,
      reason,
      context: copy(context),
    };
  }

  get_commercial_modality(modality) {
    const value = this.data.commercial_modalities[modality];
    return value ? success({ id: modality, ...value }) : notFound('Modalidad comercial', modality);
  }

  list_additional_services() {
    return success(this.data.additional_services.map((service) => ({
      name: service.name,
      documented_description: service.documented_description ?? null,
    })));
  }

  list_suggested_resale_products() {
    return success([...new Set(this.data.suggested_public_sale_prices.map((item) => item.product))]);
  }

  /** Vista efectiva del catálogo: productos con las reglas vigentes aplicadas.
   * Única representación usada por toda operación comercial pública. La fuente
   * documental (this.data.products) permanece intacta. */
  effectiveProducts(modality = null) {
    if (modality) {
      if (!this.data.products[modality]) return null;
      return [...this.productsById.values()].filter((product) => product.modality === modality);
    }
    return [...this.productsById.values()];
  }

  list_products({ modality } = {}) {
    const entries = this.effectiveProducts(modality);
    if (!entries) return notFound('Modalidad comercial', modality);
    return success(entries.map((product) => ({ ...product })));
  }

  /**
   * Returns a factual overview for a multi-product information request.
   * It deliberately does not select a tier or calculate a price when quantity is required.
   */
  get_product_comparison({ modality, requestedInformation = [] } = {}) {
    const effective = this.effectiveProducts(modality);
    if (!effective) return notFound('Modalidad comercial', modality);
    const allowedInformation = new Set(['prices', 'minimums']);
    if (!Array.isArray(requestedInformation) || requestedInformation.length === 0 ||
      requestedInformation.some((item) => !allowedInformation.has(item))) {
      return { status: 'invalid_input', field: 'requestedInformation', message: 'La información solicitada no es válida.' };
    }
    const products = effective.map((product) => {
      const exactPrice = product.price ? copy(product.price) : null;
      const priceRequiresContext = !exactPrice && Boolean(product.tiers || product.prices || product.offers);
      return {
        id: product.id,
        name: product.name,
        minimum: product.minimum ? copy(product.minimum) : null,
        exact_price: exactPrice,
        price_requires_context: priceRequiresContext,
      };
    });
    return success({ modality, requested_information: [...requestedInformation], products });
  }

  get_product(productId, { includeScope = false } = {}) {
    const product = this.productsById.get(productId);
    if (!product) return notFound('Producto', productId);

    const ambiguityCheck = this.check_ambiguities({
      operation: includeScope ? 'product_scope' : 'product_details',
      productId,
      modality: product.modality,
    });
    if (ambiguityCheck.blocked) return blocked(ambiguityCheck.ambiguities);

    return success(product);
  }

  get_purchase_price({ productId, quantity, purchaseType, fulfillment, withPersonalizedLabels = false } = {}) {
    const product = this.productsById.get(productId);
    if (!product) return notFound('Producto', productId);

    if (
      quantity !== undefined &&
      (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0)
    ) {
      return invalidQuantity(quantity);
    }

    const ambiguityCheck = this.check_ambiguities({
      operation: 'purchase_price',
      modality: product.modality,
      productId,
      quantity,
      purchaseType,
      fulfillment,
      withPersonalizedLabels,
    });
    if (ambiguityCheck.blocked) return blocked(ambiguityCheck.ambiguities);

    // Mínimo vigente: el override prevalece sobre el documento. Un pedido por
    // debajo del mínimo es una situación comercial explicable (below_minimum),
    // no un error técnico ni una ambigüedad.
    const minimum = product.minimum ?? null;
    if (minimum && Number.isFinite(quantity) && quantity < minimum.value) {
      return {
        status: 'below_minimum',
        data: {
          product_id: productId,
          modality: product.modality,
          quantity,
          minimum: copy(minimum),
          package: product.package ? copy(product.package) : null,
          label_included: this.labelIncluded(productId, purchaseType),
        },
        message: `El pedido mínimo vigente es de ${minimum.value} ${minimum.unit}.`,
      };
    }

    if (productId === 'maquila_bidon_20l') {
      if (!Number.isFinite(quantity)) {
        return { status: 'input_required', required: ['quantity'] };
      }
      if (purchaseType !== 'refill_with_own_container' && purchaseType !== 'new_bidon_first_refill') {
        return {
          status: 'input_required',
          required: ['purchaseType'],
          allowed_purchase_types: ['refill_with_own_container', 'new_bidon_first_refill'],
        };
      }

      if (purchaseType === 'new_bidon_first_refill') {
        // Bidón nuevo (envase + primera recarga): precio documentado S/ 19,
        // consultable cuando todos los datos requeridos están presentes.
        const newBidon = product.prices.find((entry) => entry.scope?.includes('bidón nuevo'));
        if (newBidon?.price) {
          return success({
            product_id: productId,
            modality: product.modality,
            price_type: 'purchase',
            purchase_type: 'new_bidon_first_refill',
            quantity,
            price: { ...copy(newBidon.price) },
            minimum: copy(minimum),
            inclusions: ['envase', 'primera recarga'],
            exclusions: this.labelExclusions(productId, 'new_bidon_first_refill'),
            label_included: this.labelIncluded(productId, 'new_bidon_first_refill'),
            fulfillment: 'plant_collection',
            collection: 'recojo en planta',
          });
        }
        return { status: 'not_available', message: 'No hay un precio documentado para el bidón nuevo de maquila.' };
      }

      if (quantity > 400 && fulfillment === 'authorized_collection_point') {
        return {
          status: 'fulfillment_confirmation_required',
          current_fulfillment: fulfillment,
          allowed_fulfillments: ['plant_collection', 'authorized_collection_point'],
          next_action: 'confirm_or_change_fulfillment',
          message:
            'La escala documentada para más de 400 recargas corresponde a recojo en planta. Confirme si desea cambiar el recojo a planta o solicitar atención de un asesor.',
        };
      }

      if (quantity > 400 && fulfillment !== 'plant_collection') {
        return {
          status: 'input_required',
          required: ['fulfillment'],
          allowed_fulfillments: ['plant_collection', 'authorized_collection_point'],
          message: 'Para aplicar la escala documentada de más de 400 recargas, indique el tipo de recojo.',
        };
      }

      const tier = findTier(product.prices[1].tiers, quantity);
      return tier
        ? success({
            product_id: productId,
            modality: product.modality,
            price_type: 'purchase',
            purchase_type: 'refill_with_own_container',
            quantity,
            tier,
            minimum: copy(minimum),
            label_included: this.labelIncluded(productId, 'refill_with_own_container'),
            exclusions: this.labelExclusions(productId, 'refill_with_own_container'),
            fulfillment: fulfillment ?? 'plant_collection_or_authorized_collection_point',
          })
        : { status: 'input_required', required: ['quantity'] };
    }

    if (product.tiers) {
      if (!Number.isFinite(quantity)) {
        return { status: 'input_required', required: ['quantity'] };
      }
      const tier = findTier(product.tiers, quantity);
      return tier
        ? success({
            product_id: productId,
            modality: product.modality,
            price_type: 'purchase',
            purchase_type: purchaseType ?? null,
            quantity,
            tier,
            minimum: minimum ? copy(minimum) : null,
            package: product.package ? copy(product.package) : null,
            inclusions: Array.isArray(product.inclusions) ? copy(product.inclusions) : [],
            exclusions: Array.isArray(product.excludes) ? copy(product.excludes) : [],
            label_included: this.labelIncluded(productId, purchaseType),
            collection: product.collection ?? null,
          })
        : { status: 'not_available', message: 'La cantidad está fuera de las escalas documentadas.' };
    }

    if (product.price) {
      return success({
        product_id: productId,
        modality: product.modality,
        price_type: 'purchase',
        purchase_type: purchaseType ?? null,
        quantity: quantity ?? null,
        price: product.price,
        minimum: minimum ? copy(minimum) : null,
        inclusions: Array.isArray(product.inclusions) ? copy(product.inclusions) : [],
        exclusions: Array.isArray(product.excludes) ? copy(product.excludes) : [],
        collection: product.collection ?? null,
      });
    }

    return { status: 'not_available', message: 'No hay un precio de compra consultable para este producto.' };
  }

  get_delivery_information({ modality, district, requireExactLocation = false } = {}) {
    const ambiguityCheck = this.check_ambiguities({
      operation: 'delivery_information',
      modality,
      requireExactLocation,
    });
    if (ambiguityCheck.blocked) return blocked(ambiguityCheck.ambiguities);

    const modalityResult = this.get_commercial_modality(modality);
    if (modalityResult.status !== 'ok') return modalityResult;

    const information = this.data.delivery_and_collection[modality];
    if (!information) {
      return {
          status: 'not_available',
          message: 'No hay información de entrega documentada para esta modalidad.',
      };
    }

    if (modality === 'distribution_agua_renew' && district) {
      if (['Puente Piedra', 'Carabayllo'].includes(district)) {
        return success({
          modality,
          district,
          delivery_cost_status: 'free',
          ...information,
        });
      }
      return advisorRequired(
        'El costo de delivery fuera de Puente Piedra y Carabayllo requiere cotización personalizada.',
      );
    }

    return success({ modality, ...information });
  }

  get_additional_service(serviceName, { topic } = {}) {
    const service = this.data.additional_services.find((item) => item.name === serviceName);
    if (!service) return notFound('Servicio adicional', serviceName);

    const ambiguityCheck = this.check_ambiguities({
      modality: 'maquila',
      topic,
    });
    if (ambiguityCheck.blocked) return blocked(ambiguityCheck.ambiguities);

    return success(service);
  }

  list_suggested_resale_prices({ productName } = {}) {
    const ambiguityCheck = this.check_ambiguities({
      operation: 'suggested_resale_price',
      productName,
    });
    if (ambiguityCheck.blocked) return blocked(ambiguityCheck.ambiguities);

    if (productName) {
      const prices = this.data.suggested_public_sale_prices.filter(
        (item) => item.product === productName,
      );
      return success({ price_type: 'suggested_resale', prices });
    }

    const ambiguousProducts = ['Recarga de bidón de 20 L', 'Botella de 1 L'];
    const prices = this.data.suggested_public_sale_prices.filter(
      (item) => !ambiguousProducts.includes(item.product),
    );
    return {
      status: 'partial',
      data: { price_type: 'suggested_resale', prices: copy(prices) },
      blocked_products: ambiguousProducts,
      message: 'Algunos precios sugeridos requieren confirmación con un asesor.',
      handoff_required_for_blocked_products: true,
    };
  }
}

export { HANDOFF_MESSAGE };
