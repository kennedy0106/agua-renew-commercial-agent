import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CommercialExposurePolicy } from './commercial-exposure-policy.mjs';
import { SALES_STAGES, OBJECTIONS } from './sales-context.mjs';

const KNOWLEDGE_FILE = fileURLToPath(new URL('../../knowledge/agua_renew_commercial_data.json', import.meta.url));
const string = { type: 'string' };
const bool = { type: 'boolean' };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const MODALITIES = ['maquila', 'distribution_agua_renew', 'final_customer'];
const READINESS = ['exploring', 'interested', 'qualified', 'ready_for_handoff'];
const HANDOFF_CATEGORIES = ['technical_information_request', 'confidential_information_request', 'formal_business_request', 'negotiation', 'commercial_exception', 'explicit_request'];
const clone = (value) => structuredClone(value);

/** Business-facing, validated adapter over immutable CommercialService. */
export class CommercialToolRegistry {
  constructor({ commercialService, exposurePolicy = new CommercialExposurePolicy() }) {
    this.commercialService = commercialService;
    this.exposurePolicy = exposurePolicy;
    this.knowledge = JSON.parse(readFileSync(KNOWLEDGE_FILE, 'utf8'));
    const serviceNames = (this.commercialService.list_additional_services().data ?? []).map((service) => service.name);
    this.definitions = [
      this.tool('get_business_overview', 'Explica las rutas disponibles para empezar.', object({})),
      this.tool('get_modality_overview', 'Explica una modalidad y sus presentaciones.', object({ modality: { type: 'string', enum: MODALITIES }, includeProducts: bool }, ['modality'])),
      this.tool('get_product_catalog', 'Úsala solo cuando la persona pide ver o comparar presentaciones de forma amplia y aún no indicó una presentación concreta ni cantidad. Nunca la uses para una cotización.', object({ modality: { type: 'string', enum: MODALITIES }, detailLevel: { type: 'string', enum: ['summary', 'comparison'] } })),
      this.tool('get_product_information', 'Obtiene información segura de una presentación concreta.', object({ productId: string }, ['productId'])),
      this.tool('get_quote', 'Consulta precio estándar, escala y requisitos; nunca negocia.', object({ productId: string, quantity: { type: 'integer', minimum: 1 }, unit: string, purchaseType: string, fulfillment: string }, ['productId'])),
      this.tool('get_delivery_options', 'Consulta delivery y recojo autorizados.', object({ modality: { type: 'string', enum: MODALITIES }, district: string }, ['modality'])),
      this.tool('get_additional_services_overview', 'Lista servicios adicionales aprobados (solo nombres; no incluye precios).', object({})),
      this.tool('get_service_information', 'Obtiene detalles y precio de un servicio adicional aprobado.', object({ serviceName: { type: 'string', enum: serviceNames }, topic: string }, ['serviceName'])),
      this.tool('knowledge_lookup', 'Consulta información textual aprobada de un tema.', object({ topic: { type: 'string', enum: ['maquila', 'distribution', 'brand_registration', 'labels', 'logo', 'sample', 'invoice', 'collection', 'product_info', 'payment'] } }, ['topic'])),
      this.tool('get_information_boundary', 'Responde de manera segura ante una solicitud técnica, confidencial o formal.', object({ category: { type: 'string', enum: ['technical_information_request', 'confidential_information_request', 'formal_business_request', 'negotiation', 'commercial_exception'] } }, ['category'])),
      this.tool('update_conversation_memory', 'Guarda solo contexto explícito del prospecto. No infieras hechos: no asumas logo si solo hay marca, ni delivery si solo pregunta ubicación. No repitas datos ya confirmados. Usa clearCurrentObjection/clearPendingTopic SOLO cuando el prospecto resolvió explícitamente ese tema; omitir el campo conserva el valor existente.', object({ businessType: string, customerGoal: string, useCase: string, experienceLevel: string, commercialIntent: string, modality: { type: 'string', enum: MODALITIES }, productId: string, quantity: { type: 'integer', minimum: 1 }, district: string, hasBrand: bool, brandName: string, hasLogo: bool, needsDesign: bool, hasOwnContainers: bool, labelRequirements: string, paymentStatus: string, sampleInterest: bool, purchaseReadiness: { type: 'string', enum: READINESS }, currentObjection: { type: 'string', enum: OBJECTIONS }, clearCurrentObjection: bool, salesStage: { type: 'string', enum: SALES_STAGES }, pendingTopic: string, clearPendingTopic: bool, questionsResolved: { type: 'array', items: string } })),
      this.tool('prepare_handoff', 'Prepara el resumen para un asesor humano, sin derivar todavía.', object({ reason: string, pendingQuestion: string })),
      this.tool('request_human_handoff', 'Deriva por negociación, cierre, condición especial, bloqueo o solicitud explícita.', object({ reason: string, pendingQuestion: string, category: { type: 'string', enum: ['technical_information_request', 'confidential_information_request', 'formal_business_request', 'negotiation', 'commercial_exception', 'explicit_request'] } }, ['reason'])),
    ];
  }

  tool(name, description, parameters) { return { type: 'function', function: { name, description, parameters, strict: true } }; }
  listDefinitions() { return clone(this.definitions); }

  agentCatalog() {
    const result = this.commercialService.list_products();
    if (result.status !== 'ok') return [];
    return result.data.map((product) => ({ id: product.id, name: product.name, modality: product.modality }));
  }

  execute(name, args = {}, context = {}) {
    return this.executeForAgent(name, args, context).result;
  }

  executeForAgent(name, args = {}, context = {}) {
    const raw = this.executeRaw(name, args, context);
    return this.exposurePolicy.project({ toolName: name, result: raw, args, context });
  }

  executeRaw(name, args = {}, context = {}) {
    if (!this.definitions.some((item) => item.function.name === name)) return { status: 'invalid_tool', message: 'Herramienta no autorizada.' };
    const validation = this.validate(name, args);
    if (!validation.valid) return { status: 'invalid_input', field: validation.field, message: 'Argumentos de herramienta no válidos.' };
    switch (name) {
      case 'get_business_overview': return this.businessOverview();
      case 'get_modality_overview': return this.modalityOverview(args);
      case 'get_product_catalog': return this.productCatalog(args);
      case 'get_product_information': return this.commercialService.get_product(args.productId);
      case 'get_quote': return this.commercialService.get_purchase_price(args);
      case 'get_delivery_options': return this.commercialService.get_delivery_information(args);
      case 'get_additional_services_overview': return this.commercialService.list_additional_services();
      case 'get_service_information': return this.commercialService.get_additional_service(args.serviceName, { topic: args.topic });
      case 'knowledge_lookup': return this.lookup(args.topic);
      case 'get_information_boundary': return this.informationBoundary(args.category);
      case 'update_conversation_memory': return { status: 'ok', data: clone(args) };
      case 'prepare_handoff': return { status: 'ok', data: { lead_summary: this.leadSummary({ ...context.state, pendingTopic: args.pendingQuestion ?? context.state?.pendingTopic }, args.reason) } };
      case 'request_human_handoff': {
        const result = this.commercialService.request_human_handoff({
          reason: args.reason,
          context: { lead_summary: this.leadSummary({ ...context.state, pendingTopic: args.pendingQuestion ?? context.state?.pendingTopic }, args.reason) },
        });
        return { ...result, context: { ...result.context, handoff_category: args.category ?? 'explicit_request' } };
      }
      default: return { status: 'invalid_tool', message: 'Herramienta no autorizada.' };
    }
  }

  businessOverview() {
    const modalities = MODALITIES.map((id) => this.commercialService.get_commercial_modality(id)).filter((result) => result.status === 'ok').map((result) => result.data);
    return { status: 'ok', data: { modalities } };
  }

  modalityOverview({ modality, includeProducts = true }) {
    const overview = this.commercialService.get_commercial_modality(modality);
    if (overview.status !== 'ok') return overview;
    const products = includeProducts ? this.commercialService.list_products({ modality }) : { status: 'ok', data: [] };
    return products.status === 'ok'
      ? { status: 'ok', data: { ...overview.data, products: products.data } }
      : { status: 'partial', data: { ...overview.data, products: [] }, unavailable: [{ id: 'products', status: products.status }] };
  }

  productCatalog({ modality, detailLevel = 'summary' }) {
    const listed = this.commercialService.list_products({ modality });
    if (listed.status !== 'ok') return listed;
    if (detailLevel === 'summary') return { status: 'ok', data: { modality, products: listed.data } };
    const safe = []; const unavailable = [];
    for (const product of listed.data) {
      const result = this.commercialService.get_product(product.id);
      if (result.status === 'ok') safe.push(result.data);
      else unavailable.push({ id: product.id, status: result.status, message: result.message ?? null });
    }
    return unavailable.length ? { status: 'partial', data: { modality, products: safe }, unavailable } : { status: 'ok', data: { modality, products: safe } };
  }

  leadSummary(state = {}, reason = null) {
    const product = state.productId ? this.commercialService.get_product(state.productId) : null;
    return {
      business_type: state.businessType ?? null, customer_goal: state.customerGoal ?? null,
      use_case: state.useCase ?? null, district: state.district ?? null, modality: state.modality ?? null,
      product: product?.status === 'ok' ? { id: product.data.id, name: product.data.name } : null,
      quantity: state.quantity ?? null, purchase_readiness: state.purchaseReadiness ?? 'exploring',
      has_brand: state.hasBrand ?? null, brand_name: state.brandName ?? null, has_logo: state.hasLogo ?? null,
      has_own_containers: state.hasOwnContainers ?? null, current_objection: state.currentObjection ?? null,
      sales_stage: state.salesStage ?? 'discovery',
      questions_resolved: state.questionsResolved ?? [], commercial_interest: state.commercialIntent ?? null,
      pending_topic: state.pendingTopic ?? null, handoff_reason: reason,
    };
  }

  validate(name, args) {
    const definition = this.definitions.find((item) => item.function.name === name);
    if (!definition) return { valid: false, field: 'tool' };
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { valid: false, field: 'arguments' };
    const properties = definition.function.parameters.properties;
    if (Object.keys(args).some((key) => !Object.hasOwn(properties, key))) return { valid: false, field: 'arguments' };
    for (const key of definition.function.parameters.required ?? []) if (args[key] === undefined) return { valid: false, field: key };
    const products = this.commercialService.list_products();
    const productIds = new Set(products.status === 'ok' ? products.data.map((item) => item.id) : []);
    if (args.productId !== undefined && !productIds.has(args.productId)) return { valid: false, field: 'productId' };
    if (args.modality !== undefined && !MODALITIES.includes(args.modality)) return { valid: false, field: 'modality' };
    if (args.quantity !== undefined && (!Number.isInteger(args.quantity) || args.quantity <= 0)) return { valid: false, field: 'quantity' };
    if (args.purchaseReadiness !== undefined && !READINESS.includes(args.purchaseReadiness)) return { valid: false, field: 'purchaseReadiness' };
    if (args.salesStage !== undefined && !SALES_STAGES.includes(args.salesStage)) return { valid: false, field: 'salesStage' };
    if (args.currentObjection !== undefined && !OBJECTIONS.includes(args.currentObjection)) return { valid: false, field: 'currentObjection' };
    for (const key of ['clearCurrentObjection', 'clearPendingTopic']) {
      if (args[key] !== undefined && typeof args[key] !== 'boolean') return { valid: false, field: key };
    }
    if (args.category !== undefined && !HANDOFF_CATEGORIES.includes(args.category)) return { valid: false, field: 'category' };
    if (args.questionsResolved !== undefined && (!Array.isArray(args.questionsResolved) || args.questionsResolved.some((item) => typeof item !== 'string'))) return { valid: false, field: 'questionsResolved' };
    return { valid: true };
  }

  lookup(topic) {
    const byName = (name) => this.knowledge.additional_services.find((item) => item.name === name) ?? null;
    const map = {
      maquila: this.knowledge.commercial_modalities.maquila, distribution: this.knowledge.commercial_modalities.distribution_agua_renew,
      brand_registration: byName('Registro de marca'), labels: byName('Etiquetas personalizadas'), logo: byName('Creación de logotipo profesional — Pack Básico'),
      sample: byName('Muestra gratuita'), invoice: this.knowledge.faq?.find((item) => /factura/i.test(JSON.stringify(item))) ?? null,
      collection: this.knowledge.delivery_and_collection, product_info: this.knowledge.documented_product_claims,
      payment: this.commercialService.get_payment_policy()?.data ?? null,
    };
    return map[topic] ? { status: 'ok', data: clone(map[topic]) } : { status: 'not_found', message: 'Tema aprobado no disponible.' };
  }

  informationBoundary(category) {
    const summaries = {
      technical_information_request: 'Los detalles técnicos y operativos internos de planta son reservados. Puedo ayudarte con presentaciones, condiciones comerciales y cotizaciones.',
      confidential_information_request: 'Esa información se maneja de forma reservada. Si necesitas una evaluación comercial, puedo dejar tu consulta preparada para un asesor.',
      formal_business_request: 'Para una propuesta empresarial formal, un asesor puede revisar tu caso con la información comercial necesaria.',
      negotiation: 'Las condiciones especiales se revisan de manera personalizada con un asesor.',
      commercial_exception: 'Para confirmar esa condición particular correctamente, un asesor debe revisarla contigo.',
    };
    return { status: 'ok', data: { category, approved_high_level_response: summaries[category], handoff_recommended: category !== 'technical_information_request' } };
  }
}
