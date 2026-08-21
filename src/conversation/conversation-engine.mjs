import { randomUUID } from 'node:crypto';
import { CommercialService } from '../commercial/commercial-service.mjs';
import { AIResponseComposer } from '../ai/ai-response-composer.mjs';
import { CommercialAdvisorVoice } from '../ai/commercial-advisor-voice.mjs';

const MODALITY_ORDER = ['maquila', 'distribution_agua_renew', 'final_customer'];

function copy(value) { return structuredClone(value); }
function productFamily(productId) { return productId.replace(/^(maquila|distribution|final_customer)_/, '').replace(/_new$/, ''); }
function button(label, type, value) {
  const event = { type };
  if (value !== undefined) event.value = value;
  return { label, event };
}

function initialState(mode = 'deterministic') {
  return {
    stage: 'choose_family', family: null, modality: null, productId: null,
    quantity: null, purchaseType: null, fulfillment: null, handoffRequired: false,
    handoffRecorded: false, quoteRequestCreated: false, pendingField: null, pendingAction: null,
    district: null, businessType: null, customerGoal: null, useCase: null, experienceLevel: null, commercialIntent: null,
    hasBrand: null, brandName: null, hasLogo: null, needsDesign: null, hasOwnContainers: null,
    labelRequirements: null, paymentStatus: null, currentObjection: null, sampleInterest: null,
    purchaseReadiness: 'exploring',
    questionsResolved: [], pendingTopic: null, requestedInformation: [], socialOpeningPending: false,
    salesStage: 'discovery', activeIntent: null, lastAssistantAct: null, lastTopic: null, lastReferencedProduct: null, offeredOptions: [], mode,
  };
}

/**
 * Deterministic, persistence-aware state machine.
 * Its only commercial dependency is CommercialService; storage goes through a Repository port.
 */
export class ConversationEngine {
  constructor({ commercialService = new CommercialService(), repository, aiInterpreter = null, commercialAgent = null, conversationArchitecture = 'legacy', advisorVoice = new CommercialAdvisorVoice(), responseComposer = null }) {
    if (!repository) throw new Error('ConversationEngine requires a repository');
    this.turnMetric = null;
    this.commercialService = this.instrumentCommercialService(commercialService);
    this.repository = this.instrumentRepository(repository);
    this.aiInterpreter = aiInterpreter;
    this.commercialAgent = commercialAgent;
    this.conversationArchitecture = conversationArchitecture === 'legacy' ? 'legacy' : 'agent';
    this.advisorVoice = advisorVoice;
    this.responseComposer = this.instrumentResponseComposer(responseComposer ?? new AIResponseComposer({ advisorVoice }));
    this.customer = null;
    this.conversation = null;
    this.state = initialState();
    this.messages = [];
    this.lastMessageAt = null;
  }

  instrumentRepository(repository) {
    const readMethods = new Set(['findLatestConversation', 'listMessages', 'listQuoteRequests', 'listHumanHandoffs', 'listAIUsageLogs', 'listTurnMetrics']);
    return new Proxy(repository, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return async (...args) => {
          const startedAt = performance.now();
          try {
            return await value.apply(target, args);
          } finally {
            if (this.turnMetric) {
              const key = readMethods.has(property) ? 'repositoryReadLatencyMs' : 'repositoryWriteLatencyMs';
              this.turnMetric[key] += Math.round(performance.now() - startedAt);
            }
          }
        };
      },
    });
  }

  instrumentCommercialService(commercialService) {
    return new Proxy(commercialService, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args) => {
          const startedAt = performance.now();
          try {
            return value.apply(target, args);
          } finally {
            if (this.turnMetric) this.turnMetric.commercialServiceLatencyMs += Math.round(performance.now() - startedAt);
          }
        };
      },
    });
  }

  instrumentResponseComposer(responseComposer) {
    return new Proxy(responseComposer, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args) => {
          const startedAt = performance.now();
          try {
            return value.apply(target, args);
          } finally {
            if (this.turnMetric) this.turnMetric.responseComposerLatencyMs += Math.round(performance.now() - startedAt);
          }
        };
      },
    });
  }

  beginTurnMetric(eventType) {
    this.turnMetric = {
      startedAt: performance.now(), eventType, resolution: 'local', intent: null, dialogueAct: null,
      fallbackReason: null, technicalFallback: false, clarificationRequired: false, aiCallCount: 0, aiLatencyMs: 0,
      commercialServiceLatencyMs: 0, repositoryReadLatencyMs: 0,
      repositoryWriteLatencyMs: 0, responseComposerLatencyMs: 0, toolLatencyMs: 0,
    };
  }

  async finishTurnMetric() {
    if (!this.turnMetric || !this.conversation) return;
    const metric = this.turnMetric;
    this.turnMetric = null;
    metric.totalLatencyMs = Math.round(performance.now() - metric.startedAt);
    await this.repository.createTurnMetric({
      conversationId: this.conversation.id,
      eventType: metric.eventType,
      resolution: metric.resolution,
      intent: metric.intent,
      commercialIntent: metric.intent,
      dialogueAct: metric.dialogueAct,
      fallbackReason: metric.fallbackReason,
      technicalFallback: metric.technicalFallback,
      clarificationRequired: metric.clarificationRequired,
      aiCallCount: metric.aiCallCount,
      totalLatencyMs: metric.totalLatencyMs,
      aiLatencyMs: metric.aiLatencyMs,
      commercialServiceLatencyMs: metric.commercialServiceLatencyMs,
      repositoryReadLatencyMs: metric.repositoryReadLatencyMs,
      repositoryWriteLatencyMs: metric.repositoryWriteLatencyMs,
      responseComposerLatencyMs: metric.responseComposerLatencyMs,
      toolLatencyMs: metric.toolLatencyMs,
    });
  }

  markIntent(intent) {
    if (this.turnMetric) this.turnMetric.intent = intent;
  }

  markDialogueAct(dialogueAct) {
    if (this.turnMetric) this.turnMetric.dialogueAct = dialogueAct;
  }

  setAssistantContext({ act, topic = this.state.modality, offeredOptions = [] }) {
    this.state.lastAssistantAct = act;
    this.state.lastTopic = topic ?? null;
    this.state.offeredOptions = offeredOptions.map((option) => ({ id: option.id, label: option.label }));
  }

  async initialize({ customerExternalId, channel = 'local', newConversation = false, mode = 'deterministic' }) {
    this.customer = await this.repository.getOrCreateCustomer({ channel, externalId: customerExternalId });
    const existing = newConversation
      ? null
      : await this.repository.findLatestConversation({ customerId: this.customer.id, channel });

    if (existing) {
      this.conversation = existing;
      this.state = { ...initialState(), ...existing.state };
      this.lastMessageAt = existing.lastMessageAt;
      this.messages = (await this.repository.listMessages(existing.id)).map((message) => ({
        role: message.direction === 'inbound' ? 'user' : 'bot',
        kind: message.metadata.kind ?? 'message',
        text: message.content,
        options: message.metadata.options ?? [],
      }));
      if (this.messages.length === 0 && this.state.mode !== 'ai') await this.seedWelcomeMessage();
      return this.snapshot();
    }

    this.state = initialState(mode === 'ai' ? 'ai' : 'deterministic');
    this.messages = [];
    this.lastMessageAt = new Date().toISOString();
    this.conversation = await this.repository.createConversation({
      customerId: this.customer.id,
      channel,
      status: 'bot',
      currentFlow: 'commercial_quote',
      currentStep: this.state.stage,
      assignedAgent: null,
      state: this.state,
      lastMessageAt: this.lastMessageAt,
    });
    if (this.state.mode !== 'ai') await this.seedWelcomeMessage();
    return this.snapshot();
  }

  snapshot() {
    return {
      customerId: this.customer?.id ?? null,
      conversationId: this.conversation?.id ?? null,
      state: copy(this.state),
      messages: copy(this.messages),
    };
  }

  async dispatch(event = {}) {
    this.beginTurnMetric(event.type ?? 'unknown');
    try {
      if (event.type === 'restart') {
        await this.restartCurrentConversation();
      } else if (event.type === 'new_test_conversation') {
        await this.initialize({ customerExternalId: this.customer.externalId, channel: this.customer.channel, newConversation: true, mode: this.state.mode });
      } else if (event.type === 'set_mode') {
        this.state.mode = event.value === 'ai' ? 'ai' : 'deterministic';
        await this.addBot(this.state.mode === 'ai'
          ? 'Modo DeepSeek IA activado. Escribe lo que necesitas; las sugerencias son opcionales. La información comercial seguirá siendo validada por el sistema.'
          : 'Modo determinístico activado. Puedes continuar con botones y campos validados.');
        if (this.state.mode === 'ai') await this.addBot('¿Cómo puedo ayudarte?', this.aiWelcomeOptions());
      } else {
        switch (event.type) {
          case 'select_family': await this.selectFamily(event.value); break;
          case 'select_modality': await this.selectModality(event.value); break;
          case 'select_product': await this.selectProduct(event.value); break;
          case 'submit_quantity': await this.submitQuantity(event.value); break;
          case 'select_purchase_type': await this.selectPurchaseType(event.value); break;
          case 'select_fulfillment': await this.selectFulfillment(event.value); break;
          case 'change_to_plant_collection': await this.changeToPlantCollection(); break;
          case 'request_handoff': await this.requestHandoff(event.reason); break;
          case 'submit_text': await this.submitText(event.value); break;
          case 'apply_pending_action': await this.applyPendingActionById(event.value); break;
          case 'apply_ai_goal': await this.applyAIGoal(event.value); break;
          default: await this.addBot('No reconozco esa opción. Usa los botones disponibles o reinicia la conversación.');
        }
      }
      await this.persistState();
      return this.snapshot();
    } finally {
      await this.finishTurnMetric();
    }
  }

  async restartCurrentConversation() {
    this.state = initialState(this.state.mode);
    if (this.state.mode !== 'ai') await this.seedWelcomeMessage();
    await this.persistState();
    return this.snapshot();
  }

  familyOptions() {
    const products = this.commercialService.list_products();
    if (products.status !== 'ok') return [];
    const families = new Map();
    for (const product of products.data) {
      const family = productFamily(product.id);
      if (!families.has(family)) families.set(family, product.name);
    }
    return [...families.entries()].map(([family, label]) => button(label, 'select_family', family));
  }

  aiWelcomeOptions() {
    return [
      button('Cotizar', 'apply_ai_goal', 'quote'),
      button('Ver productos', 'apply_ai_goal', 'list_products'),
      button('Hablar con asesor', 'apply_ai_goal', 'human_handoff'),
    ];
  }

  modalityOptions() {
    return MODALITY_ORDER.flatMap((modality) => {
      const result = this.commercialService.get_commercial_modality(modality);
      return result.status === 'ok' ? [button(result.data.name, 'select_modality', modality)] : [];
    });
  }

  async selectFamily(family) {
    const products = this.productsForFamily(family);
    if (!products.length) return this.invalidSelection();
    this.state.family = family;
    await this.addUser(products[0].name);
    const options = MODALITY_ORDER.flatMap((modality) => {
      if (!products.some((product) => product.modality === modality)) return [];
      const result = this.commercialService.get_commercial_modality(modality);
      return result.status === 'ok' ? [button(result.data.name, 'select_modality', modality)] : [];
    });
    this.state.stage = 'choose_modality';
    await this.addBot('¿Cómo deseas comercializar este producto?', options);
  }

  async selectModality(modality) {
    const modalityResult = this.commercialService.get_commercial_modality(modality);
    const allProducts = this.commercialService.list_products();
    const sourceProducts = this.state.family
      ? this.productsForFamily(this.state.family)
      : (allProducts.status === 'ok' ? allProducts.data : []);
    const products = sourceProducts.filter((product) => product.modality === modality);
    if (modalityResult.status !== 'ok' || !products.length) return this.invalidSelection();
    if (this.state.mode === 'ai' && this.state.modality !== modality) {
      this.state.productId = null;
      this.state.quantity = null;
      this.state.purchaseType = null;
      this.state.fulfillment = null;
      this.state.quoteRequestCreated = false;
    }
    this.state.modality = modality;
    await this.addUser(modalityResult.data.name);
    if (products.length === 1) return this.selectProduct(products[0].id, { silent: true });
    this.state.stage = 'choose_product';
    await this.addBot('Selecciona la presentación exacta.', products.map((product) => button(product.name, 'select_product', product.id)));
  }

  async selectProduct(productId, { silent = false } = {}) {
    const productResult = this.commercialService.get_product(productId);
    if (productResult.status !== 'ok') return this.invalidSelection();
    const product = productResult.data;
    if ((this.state.modality && product.modality !== this.state.modality) ||
      (this.state.family && productFamily(product.id) !== this.state.family)) return this.invalidSelection();
    this.state.productId = productId;
    this.state.modality = product.modality;
    this.state.family = productFamily(product.id);
    this.state.quantity = null;
    this.state.purchaseType = null;
    this.state.fulfillment = null;
    this.state.quoteRequestCreated = false;
    this.state.pendingAction = null;
    if (!silent) await this.addUser(product.name);
    await this.addProductContext(product);
    if (product.tiers || productId === 'maquila_bidon_20l') {
      this.state.stage = 'await_quantity';
      this.state.pendingField = 'quantity';
      await this.addBot(
        this.state.mode === 'ai'
          ? `Claro. ${this.quantityQuestion(product)}`
          : 'Indica la cantidad que deseas consultar.',
      );
      return;
    }
    await this.resolveCommercialResult(this.commercialService.get_purchase_price({ productId }));
  }

  async submitQuantity(value) {
    if (this.state.stage !== 'await_quantity') return this.submitText(value);
    await this.addUser(String(value));
    this.state.quantity = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    await this.consultPurchasePrice();
  }

  async selectPurchaseType(purchaseType) {
    await this.addUser(this.purchaseTypeLabel(purchaseType));
    this.state.purchaseType = purchaseType;
    this.state.pendingField = null;
    await this.consultPurchasePrice();
  }

  async selectFulfillment(fulfillment) {
    await this.addUser(this.fulfillmentLabel(fulfillment));
    this.state.fulfillment = fulfillment;
    this.state.pendingField = null;
    await this.consultPurchasePrice();
  }

  async changeToPlantCollection() {
    await this.addUser(this.fulfillmentLabel('plant_collection'));
    this.state.fulfillment = 'plant_collection';
    this.state.pendingAction = null;
    await this.consultPurchasePrice();
  }

  async requestHandoff(reason = 'El cliente solicitó atención humana') {
    if (!this.state.handoffRecorded) {
      await this.repository.createHumanHandoff({
        customerId: this.customer.id, conversationId: this.conversation.id, reason,
        sourceResultStatus: 'human_request', ambiguityIds: [],
        leadSummary: this.commercialAgent?.tools?.leadSummary?.(this.state, reason) ?? null,
        category: 'explicit_request',
      });
      this.state.handoffRecorded = true;
    }
    const response = this.commercialService.request_human_handoff({ reason, context: this.state });
    this.state.stage = 'handoff';
    this.state.salesStage = 'handoff';
    this.state.handoffRequired = true;
    await this.addBot(response.message, [button('Reiniciar conversación', 'restart')], 'handoff');
  }

  async submitText(value) {
    if (this.state.mode === 'ai') return this.submitAIText(value);
    const confirmation = this.resolvePendingConfirmation(value);
    if (confirmation) {
      await this.addUser(String(value));
      if (this.turnMetric) this.turnMetric.resolution = 'local';
      return this.applyPendingConfirmation(confirmation);
    }
    if (this.state.stage === 'await_quantity') return this.submitQuantity(value);
    await this.addUser(String(value));
    await this.addBot('Para continuar, selecciona una de las opciones disponibles.');
  }

  async submitAIText(value) {
    const text = String(value);
    await this.addUser(text);
    if (this.conversationArchitecture === 'agent') return this.submitAgentText(text);
    if (this.state.pendingField === 'quantity' && this.isPositiveIntegerText(text)) {
      this.state.quantity = Number(text.match(/\d+/)[0]);
      this.state.pendingField = null;
      this.state.pendingAction = null;
      if (this.turnMetric) this.turnMetric.resolution = 'local';
      this.markIntent('quote');
      return this.consultPurchasePrice();
    }
    const confirmation = this.resolvePendingConfirmation(text);
    if (confirmation) {
      if (this.turnMetric) this.turnMetric.resolution = 'local';
      return this.applyPendingConfirmation(confirmation);
    }
    if (!this.aiInterpreter) {
      const fallbackReason = 'ai_not_available';
      if (this.turnMetric) { this.turnMetric.resolution = 'deepseek'; this.turnMetric.fallbackReason = fallbackReason; this.turnMetric.technicalFallback = true; }
      await this.recordAIUsage({ success: false, fallbackUsed: true, errorType: 'ai_not_available', fallbackReason });
      return this.fallbackFromAI(text, fallbackReason);
    }
    const aiStartedAt = performance.now();
    if (this.turnMetric) { this.turnMetric.resolution = 'deepseek'; this.turnMetric.aiCallCount += 1; }
    const interpreted = await this.aiInterpreter.interpret({
      message: text,
      conversationState: this.state,
      conversationHistory: this.messages.slice(-6),
    });
    if (this.turnMetric) this.turnMetric.aiLatencyMs += Math.round(performance.now() - aiStartedAt);
    if (!interpreted.success) {
      const fallbackReason = this.fallbackReasonFromError(interpreted.errorType);
      if (this.turnMetric) { this.turnMetric.resolution = 'deepseek'; this.turnMetric.fallbackReason = fallbackReason; this.turnMetric.technicalFallback = true; }
      await this.recordAIUsage({ ...interpreted.metrics, success: false, fallbackUsed: true, errorType: interpreted.errorType, fallbackReason });
      return this.fallbackFromAI(text, fallbackReason);
    }
    const interpretation = interpreted.interpretation;
    this.markIntent(interpretation.intent);
    this.markDialogueAct(interpretation.dialogueAct);
    await this.recordAIUsage({ ...interpreted.metrics, intent: interpretation.intent, operation: interpretation.operation?.name ?? null, success: true, fallbackUsed: false });
    if (interpretation.lowConfidence) return this.respondToLowConfidenceInterpretation();
    await this.applyAIInterpretation(interpretation);
  }

  async submitAgentText(text) {
    if (!this.commercialAgent) {
      const fallbackReason = 'commercial_agent_not_available';
      if (this.turnMetric) { this.turnMetric.resolution = 'agent'; this.turnMetric.fallbackReason = fallbackReason; this.turnMetric.technicalFallback = true; }
      await this.recordAIUsage({ success: false, fallbackUsed: true, errorType: fallbackReason, fallbackReason });
      return this.fallbackFromAI(text, fallbackReason);
    }
    try {
      if (this.turnMetric) { this.turnMetric.resolution = 'agent'; }
      const result = await this.commercialAgent.reply({ message: text, state: this.state, history: this.messages.slice(0, -1) });
      if (this.turnMetric) {
        this.turnMetric.aiCallCount += result.metrics?.aiCallCount ?? 0;
        this.turnMetric.aiLatencyMs += result.metrics?.aiLatencyMs ?? 0;
        this.turnMetric.toolLatencyMs = (this.turnMetric.toolLatencyMs ?? 0) + (result.metrics?.toolLatencyMs ?? 0);
      }
      await this.recordAIUsage({
        provider: 'deepseek', model: this.commercialAgent.provider.model ?? null,
        latencyMs: result.metrics?.aiLatencyMs ?? null, inputTokens: result.metrics?.inputTokens ?? null,
        outputTokens: result.metrics?.outputTokens ?? null, operation: result.metrics?.tools?.map((tool) => tool.name).join(',') || null,
        success: result.success, fallbackUsed: !result.success, errorType: result.errorType ?? null,
        rawResponse: JSON.stringify(result.trace ?? []), parsedResponse: { tools: result.metrics?.tools ?? [] },
        fallbackReason: result.errorType ?? null,
      });
      if (!result.success) {
        if (this.turnMetric) { this.turnMetric.fallbackReason = result.errorType ?? 'agent_empty_response'; this.turnMetric.technicalFallback = true; }
        return this.fallbackFromAI(text, result.errorType);
      }
      // Memoria determinística del agente (estado previo + etapa sugerida); luego
      // los args de update_conversation_memory de este turno (más nuevos) ganan.
      this.applyAgentMemory(result.memory);
      this.applyAgentToolMemory(result.metrics?.tools ?? []);
      const priceTool = result.metrics?.tools?.find((tool) => ['get_quote', 'get_purchase_price'].includes(tool.name) && tool.resultStatus === 'ok');
      if (priceTool && !this.state.quoteRequestCreated && Number.isInteger(priceTool.args?.quantity)) {
        await this.repository.createQuoteRequest({
          customerId: this.customer.id, conversationId: this.conversation.id,
          productId: priceTool.args.productId, quantity: priceTool.args.quantity,
          validatedData: { modality: this.state.modality, purchaseType: priceTool.args.purchaseType ?? null, fulfillment: priceTool.args.fulfillment ?? null },
        });
        this.state.quoteRequestCreated = true;
      }
      // Una cotización entregada implica que la objeción activa dejó de bloquear:
      // se limpia salvo que el modelo la haya re-afirmado explícitamente este turno.
      const reassertedObjection = (result.metrics?.tools ?? []).some(
        (tool) => tool.name === 'update_conversation_memory' && tool.args?.currentObjection,
      );
      if (priceTool && !reassertedObjection) this.state.currentObjection = null;
      const prepared = result.metrics?.tools?.find((tool) => tool.name === 'prepare_handoff')?.result?.data?.lead_summary ?? null;
      if (result.handoff) {
        if (prepared) result.handoff.context = { ...(result.handoff.context ?? {}), lead_summary: prepared };
        await this.recordResultHandoff(result.handoff);
        this.state.handoffRequired = true;
        this.state.stage = 'handoff';
      }
      await this.addBot(result.text, result.handoff ? [button('Hablar con un asesor', 'request_handoff')] : [], result.handoff ? 'handoff' : 'message');
    } catch (error) {
      const reason = error?.type ?? 'agent_provider_error';
      if (this.turnMetric) { this.turnMetric.fallbackReason = reason; this.turnMetric.technicalFallback = true; }
      await this.recordAIUsage({ success: false, fallbackUsed: true, errorType: reason, fallbackReason: reason });
      return this.fallbackFromAI(text, reason);
    }
  }

  applyAgentToolMemory(tools) {
    for (const tool of tools) {
      const args = tool.args ?? {};
      if (args.productId) this.state.productId = args.productId;
      if (Number.isInteger(args.quantity)) this.state.quantity = args.quantity;
      if (args.district) this.state.district = args.district;
      if (args.modality) this.state.modality = args.modality;
      if (args.productId) this.state.lastReferencedProduct = args.productId;
      if (args.businessType) this.state.businessType = args.businessType;
      if (args.customerGoal) this.state.customerGoal = args.customerGoal;
      if (args.useCase) this.state.useCase = args.useCase;
      if (args.experienceLevel) this.state.experienceLevel = args.experienceLevel;
      if (args.lastTopic) this.state.lastTopic = args.lastTopic;
      if (args.commercialIntent) this.state.commercialIntent = args.commercialIntent;
      if (typeof args.hasBrand === 'boolean') this.state.hasBrand = args.hasBrand;
      if (args.brandName) this.state.brandName = args.brandName;
      if (typeof args.hasLogo === 'boolean') this.state.hasLogo = args.hasLogo;
      if (typeof args.needsDesign === 'boolean') this.state.needsDesign = args.needsDesign;
      if (typeof args.hasOwnContainers === 'boolean') this.state.hasOwnContainers = args.hasOwnContainers;
      if (args.labelRequirements) this.state.labelRequirements = args.labelRequirements;
      if (args.paymentStatus) this.state.paymentStatus = args.paymentStatus;
      if (args.currentObjection) this.state.currentObjection = args.currentObjection;
      if (typeof args.sampleInterest === 'boolean') this.state.sampleInterest = args.sampleInterest;
      if (args.purchaseReadiness) this.state.purchaseReadiness = args.purchaseReadiness;
      if (args.salesStage) this.state.salesStage = args.salesStage;
      if (Array.isArray(args.questionsResolved)) this.state.questionsResolved = [...new Set([...this.state.questionsResolved, ...args.questionsResolved])];
      if (args.pendingTopic) this.state.pendingTopic = args.pendingTopic;
    }
  }

  /** Aplica la memoria compacta determinística del agente sin sobreescribir
   * valores confirmados con null (regla: un dato no mencionado no se borra). */
  applyAgentMemory(memory) {
    const m = memory ?? {};
    const set = (key, value) => {
      if (value !== null && value !== undefined && value !== '') this.state[key] = value;
    };
    set('businessType', m.business_type);
    set('customerGoal', m.customer_goal);
    set('useCase', m.use_case);
    set('experienceLevel', m.experience_level);
    set('modality', m.modality);
    set('productId', m.product_id);
    set('quantity', m.quantity);
    set('district', m.district);
    set('lastTopic', m.last_topic);
    set('lastReferencedProduct', m.last_referenced_product);
    set('commercialIntent', m.commercial_intent);
    set('brandName', m.brand_name);
    set('labelRequirements', m.label_requirements);
    set('paymentStatus', m.payment_status);
    set('currentObjection', m.current_objection);
    set('salesStage', m.sales_stage);
    for (const [key, value] of [
      ['hasBrand', m.has_brand], ['needsDesign', m.needs_design], ['sampleInterest', m.sample_interest],
      ['hasLogo', m.has_logo], ['hasOwnContainers', m.has_own_containers],
    ]) {
      if (typeof value === 'boolean') this.state[key] = value;
    }
    if (Array.isArray(m.questions_resolved)) {
      this.state.questionsResolved = [...new Set([...this.state.questionsResolved, ...m.questions_resolved])];
    }
  }

  async respondToAcknowledgement() {
    const previousAct = this.state.lastAssistantAct;
    const previousOptions = this.state.offeredOptions;
    this.setAssistantContext({ act: 'acknowledge', topic: this.state.lastTopic, offeredOptions: this.state.offeredOptions });
    if (previousAct === 'explain_modality' && this.state.modality) {
      this.setAssistantContext({ act: 'offer_modality_next_step', topic: this.state.modality, offeredOptions: previousOptions });
      await this.addBot(this.advisorVoice.modalityNextStep(), this.informationActionOptions());
      return;
    }
    if (this.state.stage === 'complete') {
      await this.addBot('Perfecto. Si necesitas revisar otra cantidad o presentación, dime y lo vemos.');
      return;
    }
    await this.addBot(this.advisorVoice.acknowledge());
  }

  commercialContextSnapshot() {
    return {
      modality: this.state.modality,
      productId: this.state.productId,
      quantity: this.state.quantity,
      district: this.state.district,
      requestedInformation: this.state.requestedInformation,
    };
  }

  hasNewCommercialProgress(interpretation, previous) {
    const operationAddsNewWork = interpretation.operation
      && (interpretation.operation.name !== 'get_commercial_modality'
        || interpretation.operation.args?.modality !== previous.modality);
    return Boolean(
      (interpretation.modality && interpretation.modality !== previous.modality) ||
      (interpretation.productId && interpretation.productId !== previous.productId) ||
      (interpretation.quantity !== null && interpretation.quantity !== previous.quantity) ||
      (interpretation.district && interpretation.district !== previous.district) ||
      (interpretation.requestedInformation?.length
        && JSON.stringify(interpretation.requestedInformation) !== JSON.stringify(previous.requestedInformation)) ||
      interpretation.additionalServiceName || interpretation.resaleProductName || operationAddsNewWork,
    );
  }

  shouldAskForProduct(interpretation) {
    return Boolean(
      this.state.modality && !this.state.productId && (
        interpretation.advisorMove === 'ask_product'
        || interpretation.responseGoal === 'acknowledge_modality_and_ask_product'
      ),
    );
  }

  async respondToDenial() {
    this.markDialogueAct('deny');
    if (this.state.pendingAction?.type === 'confirmation') {
      this.state.pendingAction = null;
      return this.requestHandoff('El cliente no confirmó el cambio requerido para esta condición comercial.');
    }
    this.setAssistantContext({ act: 'deny', topic: this.state.lastTopic, offeredOptions: [] });
    await this.addBot(this.advisorVoice.acknowledge());
  }

  async respondToLowConfidenceInterpretation() {
    this.markDialogueAct('clarify');
    if (this.turnMetric) this.turnMetric.clarificationRequired = true;
    this.setAssistantContext({ act: 'clarify', topic: this.state.lastTopic, offeredOptions: [] });
    await this.addBot('¿Quieres que te explique cómo funciona o prefieres revisar productos y precios?');
  }

  resolvePendingConfirmation(text) {
    if (this.state.pendingAction?.type !== 'confirmation') return null;
    const normalized = String(text).trim().toLocaleLowerCase('es-PE');
    if (/^(?:s[ií]|si|confirmo)\.?$/.test(normalized)) return 'affirm';
    if (/^(?:no)\.?$/.test(normalized)) return 'deny';
    return null;
  }

  async applyPendingConfirmation(confirmation) {
    if (confirmation === 'deny') return this.respondToDenial();
    return this.applyPendingAction({ id: 'confirm_plant_collection', intent: 'quote' });
  }

  async applyPendingActionById(actionId) {
    const action = this.state.pendingAction?.options?.find((option) => option.id === actionId);
    if (!action) return this.invalidSelection();
    if (this.turnMetric) this.turnMetric.resolution = 'local';
    await this.addUser(action.label);
    return this.applyPendingAction(action);
  }

  async applyAIGoal(goal) {
    const plans = {
      quote: { intent: 'quote', dialogueAct: 'request_quote', responseGoal: 'offer_quote' },
      list_products: { intent: 'list_products', dialogueAct: 'request_information', responseGoal: 'offer_products' },
      human_handoff: { intent: 'human_handoff', dialogueAct: 'human_handoff', responseGoal: 'handoff' },
    };
    const plan = plans[goal];
    if (!plan) return this.invalidSelection();
    if (this.turnMetric) this.turnMetric.resolution = 'local';
    await this.addUser(goal === 'quote' ? 'Cotizar' : goal === 'list_products' ? 'Ver productos' : 'Hablar con asesor');
    return this.applyAIInterpretation({
      ...plan, modality: this.state.modality, productId: null, quantity: null, district: null,
      additionalServiceName: null, resaleProductName: null, topic: this.state.lastTopic,
      operation: null, missingInformation: [], confidence: 1, lowConfidence: false,
    });
  }

  async applyPendingAction(action) {
    this.state.pendingAction = null;
    this.markIntent(action.intent ?? action.id);
    if (action.id === 'confirm_plant_collection') {
      this.markDialogueAct('affirm');
      this.state.fulfillment = 'plant_collection';
      this.state.pendingField = null;
      return this.consultPurchasePrice();
    }
    return this.applyAIInterpretation({
      intent: action.intent,
      topic: action.topic ?? null,
      modality: action.modality ?? this.state.modality,
      productId: null, quantity: null, district: null,
      additionalServiceName: null, resaleProductName: null, operation: null,
      missingInformation: [], responseGoal: action.intent === 'quote' ? 'offer_quote' : 'continue_conversation', confidence: 1,
    });
  }

  fallbackReasonFromError(errorType) {
    const reasons = {
      timeout: 'deepseek_timeout',
      http_error: 'deepseek_http_error',
      invalid_json: 'deepseek_invalid_json',
      invalid_interpretation: 'interpreter_validation_failed',
    };
    return reasons[errorType] ?? errorType ?? 'deepseek_provider_error';
  }

  async fallbackFromAI(_text, _reason) {
    await this.addBot('En este momento no pude procesar tu consulta con normalidad. Si quieres, puedes contarme qué producto buscas o pedir hablar con un asesor.', this.aiWelcomeOptions());
  }

  async applyAIInterpretation(interpretation) {
    this.markIntent(interpretation.intent);
    this.markDialogueAct(interpretation.dialogueAct ?? 'inform');
    const previousCommercialState = this.commercialContextSnapshot();
    this.mergeAIUpdates(interpretation);
    const hasNewCommercialProgress = this.hasNewCommercialProgress(interpretation, previousCommercialState);
    if (interpretation.dialogueAct === 'thanks') return this.respondToThanks();
    if (interpretation.dialogueAct === 'farewell') return this.respondToFarewell();
    // Dialogue acts describe tone, but must never discard validated business
    // updates included in the same plan (for example, a brand-preference update).
    const resumePreviousOffer = ['acknowledge', 'affirm'].includes(interpretation.dialogueAct)
      || (interpretation.dialogueAct === 'clarify' && this.state.lastAssistantAct === 'explain_modality' && this.state.modality);
    if (resumePreviousOffer && !hasNewCommercialProgress) {
      return this.respondToAcknowledgement();
    }
    if (interpretation.dialogueAct === 'deny' && !hasNewCommercialProgress) return this.respondToDenial();
    if (interpretation.dialogueAct === 'clarify' && !hasNewCommercialProgress) return this.respondToClarification();
    if (interpretation.intent === 'greeting' || interpretation.dialogueAct === 'greeting') return this.respondToGreeting();
    // A product question advances the conversation further than a modality
    // explanation, so it must win when the validated plan contains both.
    if (this.shouldAskForProduct(interpretation)) return this.respondToAdvisorProduct();
    if (interpretation.operation?.name === 'get_product_comparison') return this.executeRequestedOperation(interpretation.operation);
    if (interpretation.requestedInformation?.length && !this.state.productId && interpretation.missingInformation?.includes('productId') && this.state.modality) {
      return this.executeRequestedOperation({
        name: 'get_product_comparison',
        args: { modality: this.state.modality, requestedInformation: interpretation.requestedInformation },
      });
    }
    if (interpretation.advisorMove === 'handoff') return this.requestHandoff('La consulta requiere revisión comercial.');
    if (interpretation.advisorMove === 'handle_objection') return this.respondToPriceConcern();
    if (interpretation.advisorMove === 'ask_need') return this.respondToAdvisorNeed();
    if (interpretation.advisorMove === 'ask_product' && !this.state.productId) return this.respondToAdvisorProduct();
    if (interpretation.advisorMove === 'acknowledge' && this.state.businessType && !this.state.modality) return this.respondToBusinessContext();
    if (interpretation.responseGoal === 'clarify_modality' || interpretation.responseGoal === 'ask_clarification') return this.respondToClarification();
    if (interpretation.responseGoal === 'ask_quantity') return this.applyAIQuote(interpretation);
    if (interpretation.operation) return this.executeRequestedOperation(interpretation.operation);
    if (interpretation.intent === 'quote' || interpretation.intent === 'continue') return this.applyAIQuote(interpretation);
    if (interpretation.intent === 'slot_update') return this.respondToSlotUpdate(interpretation);
    if (interpretation.intent === 'list_products') {
      const result = this.commercialService.list_products({ modality: interpretation.modality ?? undefined });
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeProducts(result.data));
      else await this.addBot('Selecciona una modalidad para consultar las presentaciones disponibles.', this.familyOptions());
      return;
    }
    if (interpretation.intent === 'information_request') return this.respondToInformationRequest(interpretation);
    if (interpretation.intent === 'comparison') {
      await this.addBot(this.advisorVoice.askModality(), this.modalityOptions());
      return;
    }
    if (interpretation.intent === 'product_information') {
      if (interpretation.modality && !interpretation.productId) {
        const modality = this.commercialService.get_commercial_modality(interpretation.modality);
        if (modality.status === 'ok') {
          const products = this.commercialService.list_products({ modality: interpretation.modality });
          this.state.pendingField = 'product';
          this.state.stage = 'choose_product';
          await this.addBot(`${this.advisorVoice.modalityExplanation(interpretation.modality, modality.data)}\n\nSi quieres, también puedo ayudarte a revisar qué presentación te conviene para empezar. ¿Cuál tienes en mente?`, products.status === 'ok'
            ? products.data.map((product) => button(product.name, 'select_product', product.id))
            : []);
          return;
        }
      }
      if (!interpretation.productId) {
        await this.addBot('Claro 😊 ¿Qué presentación tienes en mente?', this.familyOptions());
        return;
      }
      return this.respondToProductInformation(interpretation.productId);
    }
    if (interpretation.intent === 'delivery') {
      const result = this.commercialService.get_delivery_information({ modality: interpretation.modality ?? this.state.modality, district: interpretation.district ?? undefined });
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeDelivery(result.data));
      else await this.resolveCommercialResult(result);
      return;
    }
    if (interpretation.intent === 'additional_service') {
      if (!interpretation.additionalServiceName) {
        const services = this.commercialService.list_additional_services();
        await this.addBot('Indica el servicio adicional que deseas consultar.', services.data.map((service) => button(service.name, 'submit_text', service.name)));
        return;
      }
      const result = this.commercialService.get_additional_service(interpretation.additionalServiceName);
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeAdditionalService(result.data));
      else await this.resolveCommercialResult(result);
      return;
    }
    if (interpretation.intent === 'suggested_resale_price') {
      const result = this.commercialService.list_suggested_resale_prices({ productName: interpretation.resaleProductName ?? undefined });
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeSuggestedResale(result.data));
      else if (result.status === 'partial') {
        await this.addBot(`${this.responseComposer.composeSuggestedResale(result.data)}\n${result.message}`, [button('Hablar con un asesor', 'request_handoff')]);
      } else await this.resolveCommercialResult(result);
      return;
    }
    if (interpretation.intent === 'human_handoff') return this.requestHandoff('La consulta requiere revisión comercial.');
    if (interpretation.intent === 'unknown') return this.respondToConversationalUnknown();
    await this.respondToClarification();
  }

  async respondToThanks() {
    this.setAssistantContext({ act: 'thanks', topic: this.state.lastTopic, offeredOptions: [] });
    await this.addBot(this.advisorVoice.thankYou());
  }

  async respondToGreeting() {
    this.state.socialOpeningPending = false;
    this.state.salesStage = 'discovery';
    this.setAssistantContext({ act: 'greeting', topic: null, offeredOptions: [] });
    await this.addBot(this.advisorVoice.greeting(), this.aiWelcomeOptions());
  }

  async respondToFarewell() {
    this.setAssistantContext({ act: 'farewell', topic: this.state.lastTopic, offeredOptions: [] });
    await this.addBot(this.advisorVoice.farewell());
  }

  async respondToAffirmation() {
    this.setAssistantContext({ act: 'affirm', topic: this.state.lastTopic, offeredOptions: [] });
    await this.addBot(this.advisorVoice.acknowledge());
  }

  async executeRequestedOperation(operation) {
    const args = operation.args ?? {};
    if (operation.name === 'get_purchase_price') {
      return this.resolveCommercialResult(this.commercialService.get_purchase_price({
        productId: args.productId ?? this.state.productId,
        quantity: args.quantity ?? this.state.quantity,
        purchaseType: args.purchaseType ?? this.state.purchaseType,
        fulfillment: args.fulfillment ?? this.state.fulfillment,
        withPersonalizedLabels: args.withPersonalizedLabels ?? false,
      }));
    }
    if (operation.name === 'list_products') {
      const result = this.commercialService.list_products({ modality: args.modality ?? this.state.modality ?? undefined });
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeProducts(result.data));
      else await this.resolveCommercialResult(result);
      return;
    }
    if (operation.name === 'get_product') return this.respondToProductInformation(args.productId);
    if (operation.name === 'get_delivery_information') {
      const result = this.commercialService.get_delivery_information({ modality: args.modality ?? this.state.modality, district: args.district ?? this.state.district ?? undefined });
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeDelivery(result.data));
      else await this.resolveCommercialResult(result);
      return;
    }
    if (operation.name === 'get_additional_service') {
      const result = this.commercialService.get_additional_service(args.serviceName, { topic: args.topic });
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeAdditionalService(result.data));
      else await this.resolveCommercialResult(result);
      return;
    }
    if (operation.name === 'list_suggested_resale_prices') {
      const result = this.commercialService.list_suggested_resale_prices({ productName: args.productName });
      if (result.status === 'ok') await this.addBot(this.responseComposer.composeSuggestedResale(result.data));
      else if (result.status === 'partial') await this.addBot(`${this.responseComposer.composeSuggestedResale(result.data)}\n${result.message}`, [button('Hablar con un asesor', 'request_handoff')]);
      else await this.resolveCommercialResult(result);
      return;
    }
    if (operation.name === 'get_commercial_modality') return this.respondToInformationRequest({ modality: args.modality, topic: args.modality });
    if (operation.name === 'get_product_comparison') {
      const result = this.commercialService.get_product_comparison({
        modality: args.modality ?? this.state.modality,
        requestedInformation: args.requestedInformation ?? this.state.requestedInformation,
      });
      if (result.status === 'ok') {
        this.state.salesStage = 'solution_presentation';
        await this.addBot(this.responseComposer.composeProductComparison(result.data));
      } else await this.resolveCommercialResult(result);
      return;
    }
    if (operation.name === 'request_human_handoff') return this.requestHandoff('La consulta requiere revisión comercial.');
  }

  async respondToClarification() {
    if (this.turnMetric) this.turnMetric.clarificationRequired = true;
    this.markDialogueAct('clarify');
    this.setAssistantContext({ act: 'clarify', topic: this.state.lastTopic, offeredOptions: [] });
    await this.addBot(this.advisorVoice.askModality(), this.modalityOptions());
  }

  async respondToAdvisorNeed() {
    // The AI may label its next move as "ask_need" while also having already
    // identified a concrete modality. The confirmed context is more specific
    // than the generic move, so continue from it instead of asking the same
    // qualification question again.
    if (this.state.modality) return this.respondToAdvisorProduct();
    this.state.salesStage = 'discovery';
    this.setAssistantContext({ act: 'ask_need', topic: this.state.customerGoal, offeredOptions: [] });
    if (/venta|vender|comercial|reventa/i.test(this.state.customerGoal ?? '')) {
      this.state.pendingField = 'modality';
      await this.addBot(this.advisorVoice.askModality(), this.modalityOptions());
      return;
    }
    await this.addBot(this.advisorVoice.askPurchaseGoal());
  }

  async respondToBusinessContext() {
    this.state.salesStage = 'discovery';
    this.setAssistantContext({ act: 'acknowledge_business', topic: 'business_context', offeredOptions: [] });
    await this.addBot(`${this.advisorVoice.acknowledgeBusiness(this.state.businessType)}\n\n${this.advisorVoice.askPurchaseGoal()}`);
  }

  async respondToAdvisorProduct() {
    const modality = this.state.modality;
    if (!modality) return this.respondToAdvisorNeed();
    const modalityResult = this.commercialService.get_commercial_modality(modality);
    const products = this.commercialService.list_products({ modality });
    if (modalityResult.status !== 'ok' || products.status !== 'ok') return this.respondToClarification();
    this.state.salesStage = 'solution_presentation';
    this.state.stage = 'choose_product';
    this.state.pendingField = 'product';
    this.setAssistantContext({ act: 'ask_product', topic: modality, offeredOptions: [] });
    const intro = modality === 'distribution_agua_renew'
      ? this.advisorVoice.distributionRecognition(modalityResult.data)
      : modality === 'maquila'
        ? this.advisorVoice.maquilaRecognition(modalityResult.data)
        : modality === 'final_customer'
          ? this.advisorVoice.directPurchaseRecognition(products.data)
        : `${this.advisorVoice.modalityExplanation(modality, modalityResult.data)}\n\n¿Qué presentación te interesa revisar?`;
    await this.addBot(intro, products.data.map((product) => button(product.name, 'select_product', product.id)));
  }

  async respondToPriceConcern() {
    this.state.salesStage = 'objection_handling';
    this.setAssistantContext({ act: 'handle_objection', topic: 'price', offeredOptions: [] });
    await this.addBot(this.advisorVoice.priceConcern(), [button('Hablar con un asesor', 'request_handoff')]);
  }

  async respondToConversationalUnknown() {
    this.markDialogueAct('unknown');
    this.setAssistantContext({ act: 'unknown', topic: this.state.lastTopic, offeredOptions: [] });
    await this.addBot(`No llegué a entenderte bien. ${this.advisorVoice.askMoreContext()}`);
  }

  async respondToSlotUpdate(interpretation) {
    if (interpretation.productId || interpretation.quantity !== null) return this.applyAIQuote(interpretation);
    if (this.state.modality) {
      await this.addBot('¿Quieres conocer cómo funciona esta modalidad o prefieres revisar productos y precios?', this.modalityActionOptions());
      return;
    }
    await this.addBot(this.advisorVoice.askModality(), this.modalityOptions());
  }

  async respondToInformationRequest(interpretation) {
    if (interpretation.topic === 'commercial_modalities') {
      this.state.salesStage = 'discovery';
      this.setAssistantContext({ act: 'explain_services', topic: 'commercial_modalities', offeredOptions: [] });
      await this.addBot(this.advisorVoice.commercialServicesOverview(), this.modalityOptions());
      return;
    }
    if (this.isBidonTopic(interpretation.topic)) {
      const products = this.productsForTopic('bidon', this.state.modality);
      await this.addBot('Estas son las presentaciones de bidón que podemos revisar:', products.map((product) => button(product.name, 'select_product', product.id)));
      return;
    }
    const modality = interpretation.modality ?? this.topicToModality(interpretation.topic) ?? this.state.modality;
    if (modality) {
      const modalityResult = this.commercialService.get_commercial_modality(modality);
      if (modalityResult.status === 'ok') {
        this.state.modality = modality;
        this.state.activeIntent = 'information_request';
        this.state.pendingField = null;
        this.state.pendingAction = null;
        this.setAssistantContext({ act: 'explain_modality', topic: modality });
        await this.addBot(`${this.advisorVoice.modalityExplanation(modality, modalityResult.data)}\n\n${this.advisorVoice.modalityNextStep()}`, this.informationActionOptions());
        return;
      }
    }
    if (interpretation.productId) return this.respondToProductInformation(interpretation.productId);
    await this.addBot('¿Sobre qué te gustaría conocer más: distribución, maquila, productos o delivery?', this.aiWelcomeOptions());
  }

  async respondToProductInformation(productId) {
    const product = this.commercialService.get_product(productId);
    if (product.status !== 'ok') return this.resolveCommercialResult(product);
    const lines = [product.data.name];
    if (product.data.package) lines.push(`Presentación: ${product.data.package.contents} ${product.data.package.unit} por ${product.data.package.per}.`);
    if (product.data.inclusions?.length) lines.push(`Incluye: ${product.data.inclusions.join(', ')}.`);
    await this.addBot(lines.join('\n'), this.informationActionOptions());
  }

  informationActionOptions() {
    return this.setPendingAction([
      { id: 'products_and_prices', label: 'Ver productos', intent: 'list_products', modality: this.state.modality },
      { id: 'quote', label: 'Cotizar', intent: 'quote', modality: this.state.modality },
    ], { act: this.state.lastAssistantAct ?? 'offer_actions', topic: this.state.lastTopic ?? this.state.modality });
  }

  modalityActionOptions() {
    const modality = this.state.modality;
    return this.setPendingAction([
      { id: 'explain_modality', label: 'Cómo funciona', intent: 'information_request', topic: modality, modality },
      { id: 'products_and_prices', label: 'Ver productos', intent: 'list_products', modality },
      { id: 'quote', label: 'Cotizar', intent: 'quote', modality },
    ], { act: 'offer_modality_actions', topic: modality });
  }

  setPendingAction(options, { act = 'offer_actions', topic = this.state.modality } = {}) {
    this.state.pendingAction = { type: 'choice', options };
    this.setAssistantContext({ act, topic, offeredOptions: options });
    return options.map((option) => button(option.label, 'apply_pending_action', option.id));
  }

  async applyAIQuote(interpretation) {
    this.state.salesStage = 'quotation';
    const modality = this.state.modality;
    const productId = this.state.productId;
    if (!productId) {
      if (!modality) {
        this.state.stage = 'choose_modality';
        this.state.pendingField = 'modality';
        await this.addBot('Claro 😊 ¿Te gustaría trabajar con tu propia marca o prefieres vender productos de Agua ReNew?', this.modalityOptions());
        return;
      }
      const products = this.commercialService.list_products({ modality });
      this.state.stage = 'choose_product';
      this.state.pendingField = 'product';
      const introduction = modality === 'distribution_agua_renew'
        ? 'Perfecto, entonces estás buscando comercializar productos de Agua ReNew. 💧'
        : modality === 'maquila'
          ? 'Perfecto, podemos revisar una opción con tu propia marca. 💧'
          : 'Perfecto. ';
      await this.addBot(`${introduction}\n¿Qué presentación te interesa?`, products.status === 'ok'
        ? products.data.map((product) => button(product.name, 'select_product', product.id))
        : this.familyOptions());
      return;
    }
    const product = this.commercialService.get_product(productId);
    if (product.status !== 'ok') return this.resolveCommercialResult(product);
    if (this.state.quantity === null && (product.data.tiers || product.data.id === 'maquila_bidon_20l')) {
      this.state.stage = 'await_quantity';
      this.state.pendingField = 'quantity';
      await this.addBot(`Claro. ${this.quantityQuestion(product.data)}`);
      return;
    }
    this.state.pendingField = null;
    await this.consultPurchasePrice();
  }

  mergeAIUpdates(interpretation) {
    const hasNewModality = interpretation.modality !== null && interpretation.modality !== this.state.modality;
    if (hasNewModality) {
      this.state.modality = interpretation.modality;
      this.state.family = null;
      this.state.productId = null;
      this.state.quantity = null;
      this.state.purchaseType = null;
      this.state.fulfillment = null;
      this.state.quoteRequestCreated = false;
      this.state.handoffRequired = false;
      this.state.handoffRecorded = false;
      this.state.pendingAction = null;
    }
    if (interpretation.productId !== null) {
      const product = this.commercialService.get_product(interpretation.productId);
      if (product.status === 'ok') {
        const productChanged = this.state.productId !== product.data.id;
        this.state.productId = product.data.id;
        this.state.modality = product.data.modality;
        this.state.family = productFamily(product.data.id);
        if (productChanged) {
          this.state.quantity = null;
          this.state.purchaseType = null;
          this.state.fulfillment = null;
          this.state.quoteRequestCreated = false;
        }
      }
    }
    if (interpretation.quantity !== null) this.state.quantity = interpretation.quantity;
    if (interpretation.district !== null) this.state.district = interpretation.district;
    if (interpretation.businessType !== null) this.state.businessType = interpretation.businessType;
    if (interpretation.customerGoal !== null) this.state.customerGoal = interpretation.customerGoal;
    if (interpretation.experienceLevel !== null) this.state.experienceLevel = interpretation.experienceLevel;
    if (Array.isArray(interpretation.requestedInformation) && interpretation.requestedInformation.length) this.state.requestedInformation = interpretation.requestedInformation;
    if (interpretation.socialOpening) this.state.socialOpeningPending = true;
    if (interpretation.salesStage) this.state.salesStage = interpretation.salesStage;
    if (interpretation.intent !== 'unknown') this.state.activeIntent = interpretation.intent;
  }

  topicToModality(topic) {
    return ['maquila', 'distribution_agua_renew', 'final_customer'].includes(topic) ? topic : null;
  }

  isBidonTopic(topic) { return topic === 'bidon'; }

  productsForTopic(topic, modality = null) {
    const products = this.commercialService.list_products({ modality: modality ?? undefined });
    return products.status === 'ok' ? products.data.filter((product) => topic === 'bidon' && /bidon/.test(product.id)) : [];
  }

  isPositiveIntegerText(text) {
    return /^\s*\d+\s*(?:paquetes?)?\s*$/i.test(String(text));
  }

  quantityQuestion(product) {
    return product.package ? '¿Cuántos paquetes necesitas?' : '¿Cuántas unidades necesitas?';
  }

  async recordAIUsage({ provider = null, model = null, latencyMs = null, inputTokens = null, outputTokens = null, intent = null, operation = null, success, fallbackUsed, errorType = null, rawResponse = null, parsedResponse = null, parserRejection = null, fallbackReason = null }) {
    await this.repository.createAIUsageLog({
      conversationId: this.conversation.id, provider, model, latencyMs,
      inputTokens, outputTokens, intent, operation, success, fallbackUsed, errorType,
      rawResponse, parsedResponse, parserRejection, fallbackReason,
    });
  }

  async consultPurchasePrice() {
    await this.resolveCommercialResult(this.commercialService.get_purchase_price({
      productId: this.state.productId, quantity: this.state.quantity,
      purchaseType: this.state.purchaseType, fulfillment: this.state.fulfillment,
    }));
  }

  async resolveCommercialResult(result) {
    if (result.status === 'ok') {
      if (!this.state.quoteRequestCreated && Number.isInteger(this.state.quantity) && this.state.quantity > 0) {
        await this.repository.createQuoteRequest({
          customerId: this.customer.id, conversationId: this.conversation.id,
          productId: this.state.productId, quantity: this.state.quantity,
          validatedData: {
            modality: this.state.modality, purchaseType: this.state.purchaseType,
            fulfillment: this.state.fulfillment,
          },
        });
        this.state.quoteRequestCreated = true;
      }
      this.state.stage = 'complete';
      this.state.salesStage = 'purchase_preparation';
      await this.addBot(this.responseComposer.composePurchasePrice(result.data), [button('Nueva consulta', 'restart')], 'result');
      return;
    }
    if (result.status === 'input_required') {
      if (result.required.includes('quantity')) {
        this.state.stage = 'await_quantity';
        this.state.pendingField = 'quantity';
        await this.addBot('Entiendo. ¿Aproximadamente cuántos paquetes necesitas?');
      } else if (result.required.includes('purchaseType')) {
        this.state.stage = 'await_purchase_type';
        this.state.pendingField = 'purchaseType';
        await this.addBot('Para orientarte correctamente, ¿sería una recarga con tu envase o un bidón nuevo con primera recarga?', result.allowed_purchase_types.map((type) => button(this.purchaseTypeLabel(type), 'select_purchase_type', type)));
      } else if (result.required.includes('fulfillment')) {
        this.state.stage = 'await_fulfillment';
        this.state.pendingField = 'fulfillment';
        await this.addBot('Para revisar esa escala, ¿qué tipo de recojo prefieres?', result.allowed_fulfillments.map((fulfillment) => button(this.fulfillmentLabel(fulfillment), 'select_fulfillment', fulfillment)));
      }
      return;
    }
    if (result.status === 'fulfillment_confirmation_required') {
      this.state.stage = 'await_fulfillment_confirmation';
      this.state.pendingAction = {
        type: 'confirmation',
        options: [{ id: 'confirm_plant_collection', intent: 'quote' }],
      };
      await this.addBot(`${result.message}\n\n¿Deseas cambiar a recojo en planta?`, [button('Cambiar a recojo en planta', 'change_to_plant_collection'), button('Hablar con un asesor', 'request_handoff')]);
      return;
    }
    if (result.status === 'blocked') {
      await this.recordResultHandoff(result);
      this.state.stage = 'handoff';
      this.state.salesStage = 'handoff';
      this.state.handoffRequired = true;
      await this.addBot('Para darte una información correcta necesito confirmar primero esa condición comercial. Si quieres, te derivo con un asesor.', [button('Hablar con un asesor', 'request_handoff')], 'handoff');
      return;
    }
    if (result.status === 'below_minimum') {
      // Situación comercial: pedido bajo el mínimo vigente; se explica y se
      // vuelve a pedir cantidad sin derivar.
      this.state.stage = 'await_quantity';
      this.state.pendingField = 'quantity';
      const min = result.data?.minimum;
      const minimumText = min ? `El pedido mínimo vigente es de ${min.value} ${min.unit}.` : (result.message ?? 'El pedido está por debajo del mínimo vigente.');
      await this.addBot(`${minimumText} ¿Con qué cantidad deseas cotizar?`);
      return;
    }
    if (result.status === 'invalid_input') {
      this.state.stage = 'await_quantity';
      await this.addBot(result.message);
      return;
    }
    await this.addBot(result.message ?? 'No pudimos completar la consulta con la información documentada.', [button('Hablar con un asesor', 'request_handoff')]);
  }

  async recordResultHandoff(result) {
    if (this.state.handoffRecorded) return;
    await this.repository.createHumanHandoff({
      customerId: this.customer.id, conversationId: this.conversation.id,
      reason: result.reason ?? result.message, sourceResultStatus: result.status,
      ambiguityIds: result.ambiguities?.map((item) => item.id) ?? [],
      leadSummary: result.context?.lead_summary ?? null,
      category: result.context?.handoff_category ?? result.context?.lead_summary?.handoff_reason ?? null,
    });
    this.state.handoffRecorded = true;
  }

  async seedWelcomeMessage() {
    if (this.state.mode === 'ai') {
      await this.addBot('¡Hola! 👋 Gracias por escribir a Agua ReNew. Cuéntame, ¿qué estás buscando?', this.aiWelcomeOptions());
      return;
    }
    await this.addBot('Hola. Selecciona la presentación que deseas consultar.', this.familyOptions());
  }

  async persistState() {
    this.conversation = await this.repository.saveConversationState({
      conversationId: this.conversation.id,
      status: this.state.handoffRequired ? 'human' : 'bot',
      currentFlow: 'commercial_quote', currentStep: this.state.stage,
      assignedAgent: null, state: this.state,
      lastMessageAt: this.lastMessageAt ?? new Date().toISOString(),
    });
  }

  async addProductContext(product) {
    const parts = [product.name];
    if (product.package) parts.push(`Presentación: ${product.package.contents} ${product.package.unit} por ${product.package.per}.`);
    if (product.minimum) parts.push(`Mínimo documentado: ${product.minimum.value} ${product.minimum.unit}.`);
    await this.addBot(parts.join('\n'));
  }

  productsForFamily(family) {
    const products = this.commercialService.list_products();
    return products.status === 'ok' ? products.data.filter((product) => productFamily(product.id) === family) : [];
  }
  purchaseTypeLabel(type) { return type === 'refill_with_own_container' ? 'Recarga con envase propio' : type === 'new_bidon_first_refill' ? 'Bidón nuevo con primera recarga' : type; }
  fulfillmentLabel(fulfillment) { return fulfillment === 'plant_collection' ? 'Recojo en planta' : fulfillment === 'authorized_collection_point' ? 'Punto de recojo autorizado' : fulfillment; }
  async invalidSelection() { await this.addBot('Esa opción no está disponible para la consulta actual. Reinicia para comenzar nuevamente.', [button('Reiniciar conversación', 'restart')]); }

  async addBot(text, options = [], kind = 'message') {
    const includeSocialOpening = this.state.socialOpeningPending && kind === 'message';
    const visibleText = includeSocialOpening ? `${this.advisorVoice.greetingPrefix()}\n\n${text}` : text;
    if (includeSocialOpening) this.state.socialOpeningPending = false;
    const message = { role: 'bot', kind, text: visibleText, options };
    this.messages.push(message);
    this.lastMessageAt = new Date().toISOString();
    await this.repository.appendMessage({
      conversationId: this.conversation.id, externalId: randomUUID(), direction: 'outbound', type: 'text', content: visibleText,
      metadata: { kind, options },
    });
  }

  async addUser(text) {
    const message = { role: 'user', kind: 'message', text, options: [] };
    this.messages.push(message);
    this.lastMessageAt = new Date().toISOString();
    await this.repository.appendMessage({
      conversationId: this.conversation.id, externalId: randomUUID(), direction: 'inbound', type: 'text', content: text,
      metadata: { kind: 'message', options: [] },
    });
  }
}
