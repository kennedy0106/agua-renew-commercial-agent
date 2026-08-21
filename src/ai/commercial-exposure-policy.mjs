const RESTRICTED_KEYS = new Set([
  'source', 'sources', 'source_of_truth', 'internal_notes', 'technical_metadata',
  'ambiguities', 'ambiguity_ids', 'needs_advisor_confirmation', 'effective_unit_cost_pen',
  'cost', 'costs', 'margin', 'margins', 'supplier', 'suppliers', 'capacity', 'equipment',
]);

const RESTRICTED_TERMS = [
  'ósmosis', 'osmosis', 'uv', 'ozono', 'lavado', 'desinfección', 'desinfeccion',
  'abrillantador', 'químic', 'quimic', 'equipamiento', 'maquinaria', 'capacidad productiva',
  'proceso de producción', 'proceso de produccion',
];

const LEVELS = Object.freeze({
  PUBLIC_COMMERCIAL: 'PUBLIC_COMMERCIAL',
  CONTEXTUAL_COMMERCIAL: 'CONTEXTUAL_COMMERCIAL',
  RESTRICTED: 'RESTRICTED',
  HUMAN_ONLY: 'HUMAN_ONLY',
});

const copy = (value) => structuredClone(value);

function containsRestrictedTerm(value) {
  const text = String(value ?? '').toLocaleLowerCase();
  return RESTRICTED_TERMS.some((term) => term.length <= 2
    ? new RegExp(`\\b${term}\\b`, 'i').test(text)
    : text.includes(term));
}

function withoutRestricted(value, removed, path = '') {
  if (Array.isArray(value)) {
    return value.map((item, index) => withoutRestricted(item, removed, `${path}[${index}]`))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && containsRestrictedTerm(value)) {
      removed.push(path || 'restricted_text');
      return undefined;
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const childPath = path ? `${path}.${key}` : key;
    if (RESTRICTED_KEYS.has(key)) { removed.push(childPath); return []; }
    const safe = withoutRestricted(item, removed, childPath);
    return safe === undefined ? [] : [[key, safe]];
  }));
}

function productSummary(product, { includeContext = false } = {}) {
  return {
    id: product.id,
    name: product.name,
    modality: product.modality,
    unit: product.unit ?? null,
    package: product.package ? copy(product.package) : null,
    minimum: includeContext && product.minimum ? copy(product.minimum) : null,
  };
}

function safeProduct(product, removed = []) {
  const inclusions = Array.isArray(product.inclusions)
    ? withoutRestricted(copy(product.inclusions), removed, 'inclusions')
    : [];
  return {
    ...productSummary(product, { includeContext: true }),
    collection: product.collection ?? null,
    excludes: Array.isArray(product.excludes) ? copy(product.excludes) : [],
    inclusions,
    label_included: product.label_included ?? null,
    purchase_types: Array.isArray(product.purchase_types) ? copy(product.purchase_types) : null,
  };
}

function safeQuote(data, removed = []) {
  const inclusions = Array.isArray(data.inclusions)
    ? withoutRestricted(copy(data.inclusions), removed, 'inclusions')
    : [];
  return {
    product_id: data.product_id,
    modality: data.modality,
    price_type: data.price_type,
    purchase_type: data.purchase_type ?? null,
    quantity: data.quantity ?? null,
    tier: data.tier ? copy(data.tier) : null,
    price: data.price ? copy(data.price) : null,
    minimum: data.minimum ? copy(data.minimum) : null,
    package: data.package ? copy(data.package) : null,
    inclusions,
    exclusions: Array.isArray(data.exclusions) ? copy(data.exclusions) : [],
    label_included: data.label_included ?? null,
    fulfillment: data.fulfillment ?? null,
    collection: data.collection ?? null,
  };
}

/**
 * Normaliza texto libre a texto plano apto para WhatsApp. Es el único punto de
 * saneo de formato: elimina de forma sistemática (no por parches) los marcadores
 * de Markdown y construcciones que no aplican en un chat de texto — énfasis,
 * encabezados, reglas, listas, citas, código, enlaces, tablas y etiquetas HTML.
 * Conserva los saltos de línea para que las listas se lean en líneas separadas.
 */
function normalizeWhatsAppText(text) {
  return String(text ?? '')
    .replace(/<[^>]*>/g, '')                       // etiquetas HTML (seguridad)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // [texto](url) -> texto
    .replace(/\*\*/g, '')                          // **negrita**
    .replace(/__/g, '')                            // __negrita__
    .replace(/~~/g, '')                            // ~~tachado~~
    .replace(/(^|\n)\s{0,3}#{1,6}\s*/g, '$1')      // encabezados # ## ###
    .replace(/(^|\n)\s*(?:---+|\*{3,}|_{3,})\s*$/gm, '$1') // reglas horizontales
    .replace(/(^|\n)[ \t]*(?:[-*+•]|\d+[.)])[ \t]+/gm, '$1') // listas - * + • 1. 1)
    .replace(/(^|\n)\s*>\s?/gm, '$1')              // citas >
    .replace(/```[a-zA-Z0-9]*\s*/g, '')            // cercas de código
    .replace(/`/g, '')                             // código inline
    .replace(/\|/g, ' · ')                         // tablas
    .replace(/[ \t]+/g, ' ')                       // colapsar espacios
    .replace(/\n{3,}/g, '\n\n')                    // limitar saltos seguidos
    .trim();
}

/**
 * Controls what may leave the commercial domain. It deliberately projects
 * results instead of relying on the language model to hide sensitive fields.
 */
export class CommercialExposurePolicy {
  static levels = LEVELS;

  project({ toolName, result, args = {} }) {
    const audit = {
      tool: toolName,
      factsAvailable: result?.data && typeof result.data === 'object' ? Object.keys(result.data) : [],
      factsAllowed: [],
      restrictedFieldsRemoved: [],
      technicalDetailsSuppressed: false,
      exposureLevel: LEVELS.PUBLIC_COMMERCIAL,
    };
    if (!result || typeof result !== 'object') return { result, audit };

    const base = { status: result.status };
    if (result.message) base.message = result.message;
    if (result.handoff_required) base.handoff_required = true;
    if (result.reason) base.reason = result.reason;

    if (toolName === 'get_product_catalog') {
      const products = result.data?.products ?? [];
      base.data = { modality: result.data?.modality ?? args.modality ?? null, products: products.map(productSummary) };
      if (Array.isArray(result.unavailable)) {
        base.unavailable = result.unavailable.map((item) => ({ id: item.id ?? null, status: item.status ?? 'not_available', message: item.message ?? null }));
      }
      audit.factsAllowed = ['modality', 'products.id', 'products.name', 'products.package', 'products.minimum'];
    } else if (toolName === 'get_modality_overview') {
      const data = result.data ?? {};
      base.data = {
        id: data.id ?? args.modality,
        description: data.documented_description ?? data.description ?? null,
        products: (data.products ?? []).map(productSummary),
      };
      audit.factsAllowed = ['id', 'description', 'products.summary'];
    } else if (toolName === 'get_product_information') {
      base.data = result.data ? safeProduct(result.data, audit.restrictedFieldsRemoved) : null;
      audit.factsAllowed = ['id', 'name', 'modality', 'unit', 'package', 'minimum', 'collection', 'excludes', 'inclusions', 'label_included', 'purchase_types'];
    } else if (toolName === 'get_service_information') {
      const data = result.data ?? {};
      base.data = {
        name: data.name ?? null,
        description: data.documented_description ?? null,
        price: data.price ? copy(data.price) : null,
        policy: data.policy ?? null,
        delivery_time: data.delivery_time ?? null,
      };
      audit.exposureLevel = LEVELS.CONTEXTUAL_COMMERCIAL;
      audit.factsAllowed = ['name', 'description', 'standard_price', 'policy', 'delivery_time'];
    } else if (toolName === 'get_quote') {
      base.data = result.data ? safeQuote(result.data, audit.restrictedFieldsRemoved) : null;
      for (const key of ['required', 'allowed_purchase_types', 'allowed_fulfillments', 'current_fulfillment', 'next_action']) {
        if (result[key] !== undefined) base[key] = copy(result[key]);
      }
      audit.exposureLevel = LEVELS.CONTEXTUAL_COMMERCIAL;
      audit.factsAllowed = ['product_id', 'quantity', 'applicable_price_or_tier', 'minimum', 'package', 'inclusions', 'exclusions', 'label_included', 'purchase_type', 'fulfillment_or_collection'];
    } else if (toolName === 'get_delivery_options') {
      const data = result.data ? withoutRestricted(result.data, audit.restrictedFieldsRemoved) : null;
      base.data = data;
      audit.exposureLevel = LEVELS.CONTEXTUAL_COMMERCIAL;
      audit.factsAllowed = ['modality', 'district', 'delivery', 'free_delivery', 'collection_points'];
    } else if (toolName === 'knowledge_lookup') {
      // Product claims contain production details and are never exposed verbatim.
      if (args.topic === 'product_info') {
        base.status = 'restricted_information';
        base.data = { category: 'technical_information_request', summary: 'Solo se puede compartir información comercial general de las presentaciones.' };
        audit.exposureLevel = LEVELS.RESTRICTED;
        audit.restrictedFieldsRemoved.push('knowledge.product_info');
      } else {
        base.data = withoutRestricted(result.data, audit.restrictedFieldsRemoved);
        audit.factsAllowed = ['approved_commercial_summary'];
      }
    } else if (toolName === 'get_information_boundary') {
      base.data = copy(result.data);
      audit.exposureLevel = LEVELS.RESTRICTED;
      audit.factsAllowed = ['approved_high_level_response', 'handoff_category'];
    } else {
      base.data = result.data ? withoutRestricted(result.data, audit.restrictedFieldsRemoved) : result.data;
      if (result.context?.lead_summary) base.context = { lead_summary: copy(result.context.lead_summary), handoff_category: result.context.handoff_category ?? null };
      audit.factsAllowed = base.data && typeof base.data === 'object' ? Object.keys(base.data) : [];
    }

    audit.technicalDetailsSuppressed = audit.restrictedFieldsRemoved.length > 0;
    return { result: base, audit };
  }

  guardCustomerText(text) {
    const original = String(text ?? '').trim();
    const hasComplexMarkdown = /(^|\n)\s{0,3}#{1,6}\s|\*\*|__|~~|(^|\n)\s*---+\s*$|(^|\n).*\|.*\||(^|\n)[ \t]*(?:[-*+•]|\d+[.)])[ \t]+|`|\[[^\]]*\]\(/m.test(original);
    const normalized = normalizeWhatsAppText(original);
    const firstQuestionEnd = normalized.indexOf('?');
    const hasMultipleQuestions = firstQuestionEnd >= 0 && normalized.indexOf('?', firstQuestionEnd + 1) >= 0;
    const singleQuestionText = hasMultipleQuestions ? normalized.slice(0, firstQuestionEnd + 1).trim() : normalized;
    const lower = singleQuestionText.toLocaleLowerCase();
    const restricted = containsRestrictedTerm(lower);
    if (restricted) {
      return {
        text: 'Con gusto le oriento: puedo contarle sobre nuestras presentaciones, precios y condiciones para que elija lo mejor para su caso. ¿Qué le gustaría saber en concreto?',
        complexMarkdown: hasComplexMarkdown,
        restrictedSuppressed: true,
      };
    }
    return { text: singleQuestionText, complexMarkdown: hasComplexMarkdown, restrictedSuppressed: false, multipleQuestionsSuppressed: hasMultipleQuestions };
  }
}
