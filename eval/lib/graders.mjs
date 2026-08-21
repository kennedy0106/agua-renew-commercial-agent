/** Graders determinísticos (Bloque D). Cada grader recibe el resultado de un
 * escenario y devuelve { score: 0|1|2, reason, violations[] }.
 * 0 = falla, 1 = parcial, 2 = correcto. Sin LLM: todo lo evaluable se evalúa
 * automáticamente. Las métricas blandas usan proxies determinísticos hasta que
 * exista un LLM juez (flag --judge reservado). */

const TUTEO = /\b(te|tú|tus|tienes|quieres|estás|puedes|deseas|cuéntame|ayudarte|contigo|mostrarte|elijas|necesitas)\b/i;
const PREMATURE_CLOSE = /¿(procedemos|hacemos el pedido|confirmamos el pedido|desea realizar el pedido|lo confirmamos|avanzamos con el pedido|damos inicio al pedido|procedo con su pedido)/i;
const REPEATED_OPENERS = ['perfecto.', 'claro.', 'entiendo.', 'de acuerdo.'];

const n = (text) => String(text ?? '').toLowerCase();

/** Precio correcto presente y precio incorrecto ausente. CRÍTICA. Binaria: un
 * precio esperado ausente o un precio incorrecto presente es fallo. */
export function gradePrice({ fullText, expect }) {
  const violations = [];
  if (expect.priceExpected && !n(fullText).includes(n(expect.priceExpected))) violations.push(`precio esperado ausente: ${expect.priceExpected}`);
  if (expect.priceWrong && n(fullText).includes(n(expect.priceWrong))) violations.push(`precio incorrecto presente: ${expect.priceWrong}`);
  const score = violations.length === 0 ? 2 : 0;
  return { score, reason: violations.join('; ') || 'precio correcto', violations, critical: true };
}

/** Hechos requeridos presentes y hechos prohibidos ausentes (commercial_fact_accuracy).
 * forbiddenInLastTurn: substrings prohibidos solo en la ÚLTIMA respuesta (para
 * escenarios de cambio de tema/producto donde los turnos previos mencionan el
 * estado anterior de forma legítima). */
export function gradeFacts({ fullText, lastReply, expect }) {
  const violations = [];
  for (const fact of expect.text ?? []) if (!n(fullText).includes(n(fact))) violations.push(`hecho esperado ausente: ${fact}`);
  for (const bad of expect.forbidden ?? []) if (n(fullText).includes(n(bad))) violations.push(`hecho prohibido presente: ${bad}`);
  for (const bad of expect.forbiddenInLastTurn ?? []) if (n(lastReply).includes(n(bad))) violations.push(`hecho prohibido en el último turno: ${bad}`);
  const score = violations.length === 0 ? 2 : (expect.text?.length || expect.forbidden?.length || expect.forbiddenInLastTurn?.length ? 1 : 2);
  return { score, reason: violations.join('; ') || 'hechos correctos', violations, critical: expect.critical === true };
}

/** Mínimo vigente correcto (minimum_accuracy). CRÍTICA. */
export function gradeMinimum({ fullText, expect }) {
  if (!expect.minimumExpected) return { score: 2, reason: 'sin expectativa de mínimo', violations: [], critical: true };
  const found = n(fullText).includes(n(expect.minimumExpected));
  return { score: found ? 2 : 0, reason: found ? `mínimo ${expect.minimumExpected} presente` : `mínimo esperado ausente: ${expect.minimumExpected}`, violations: found ? [] : ['minimum_expected_absent'], critical: true };
}

/** No inventa políticas (policy_accuracy). CRÍTICA. Soporta:
 * - forbiddenPolicyTerms: substrings prohibidos en el texto completo;
 * - paymentTransfer: true → prohíbe "50%"/"adelanto" SOLO si aparece ligado al
 *   pedido de agua/maquila (la condición del logo es legítima y no debe
 *   transferirse; mencionarla como condición exclusiva del logo es correcto). */
export function gradePolicy({ fullText, expect }) {
  const violations = [];
  for (const term of expect.forbiddenPolicyTerms ?? []) if (n(fullText).includes(n(term))) violations.push(`política inventada: ${term}`);
  if (expect.paymentTransfer === true) {
    // Transferencia = la condición del logo aplicada al pedido DENTRO de la
    // misma oración; mencionar el 50% como condición exclusiva del logo (en su
    // propia oración) es correcto y no se penaliza.
    const orderTerms = /(pedido|maquila|agua|bidón|recarga|unidades)/i;
    const paymentTerms = /(50%|adelanto|mitad)/i;
    const sentences = String(fullText ?? '').split(/[.\n;]/);
    const transfer = sentences.some((sentence) => orderTerms.test(sentence) && paymentTerms.test(sentence));
    if (transfer) violations.push('condición de pago del logo transferida al pedido de agua');
  }
  const score = violations.length === 0 ? 2 : 0;
  return { score, reason: violations.join('; ') || 'sin políticas inventadas', violations, critical: true };
}

/** Estado final esperado (memory_accuracy). */
export function gradeMemory({ finalState, expect }) {
  const violations = [];
  for (const [key, value] of Object.entries(expect.finalState ?? {})) {
    if (finalState?.[key] !== value) violations.push(`estado ${key} = ${finalState?.[key] ?? null} (esperado ${value})`);
  }
  const score = violations.length === 0 ? 2 : 0;
  return { score, reason: violations.join('; ') || 'estado final correcto', violations };
}

/** No repite preguntas ya confirmadas (no_repetition). Solo cuenta como
 * repetición una PREGUNTA de posesión/confirmación sobre el tema (p. ej.
 * "¿Ya tiene logo?"); mencionar el tema de forma natural ("su logo va en la
 * etiqueta") no es repetición. */
export function gradeNoRepeat({ scenario, replies, finalState, expect }) {
  const violations = [];
  const turns = scenario.turns ?? [];
  const possession = /(¿|pregunt).{0,30}(tiene|cuenta con|ya |aún |todavía |dispone|posee)/i;
  for (const topic of expect.noRepeatOf ?? []) {
    const topicConfirmed = turns.join(' ').toLowerCase().includes(topic.toLowerCase());
    if (!topicConfirmed) continue;
    for (const [i, reply] of replies.entries()) {
      const lower = n(reply);
      const asks = possession.test(reply) && /¿/.test(reply) && lower.includes(n(topic));
      if (asks) violations.push(`turno ${i + 1}: se vuelve a preguntar sobre "${topic}" tras confirmarlo`);
    }
  }
  const score = violations.length === 0 ? 2 : 1;
  return { score, reason: violations.join('; ') || 'sin repeticiones', violations };
}

/** Selección de herramientas (tool_selection_accuracy). */
export function gradeTools({ toolsCalled, expect }) {
  const violations = [];
  for (const tool of expect.tools ?? []) if (!toolsCalled.includes(tool)) violations.push(`herramienta esperada no llamada: ${tool}`);
  for (const tool of expect.forbiddenTools ?? []) if (toolsCalled.includes(tool)) violations.push(`herramienta prohibida llamada: ${tool}`);
  if (!toolsCalled.length && (expect.tools?.length ?? 0) > 0) violations.push('no se llamó ninguna herramienta');
  const score = violations.length === 0 ? 2 : 1;
  return { score, reason: violations.join('; ') || `tools correctas (${toolsCalled.join(', ') || 'ninguna'})`, violations };
}

/** Siguiente mejor acción esperada (next_step_quality). */
export function gradeNextAction({ nextAction, expect }) {
  if (!expect.nextAction) return { score: 2, reason: 'sin expectativa de acción', violations: [] };
  if (nextAction === expect.nextAction) return { score: 2, reason: `next_action ${nextAction}`, violations: [] };
  return { score: 1, reason: `next_action ${nextAction ?? 'null'} (esperado ${expect.nextAction})`, violations: ['next_action_mismatch'] };
}

/** No cierra prematuramente (premature_close_avoidance). */
export function gradePrematureClose({ fullText, expect }) {
  if (expect.noPrematureClose !== true) return { score: 2, reason: 'sin expectativa', violations: [] };
  const violations = [];
  if (PREMATURE_CLOSE.test(fullText)) violations.push('cierre prematuro detectado');
  if (/¿(quiere|desea) (realizar|hacer|confirmar) (el|su) pedido/i.test(fullText)) violations.push('cierre de pedido detectado');
  const score = violations.length === 0 ? 2 : 0;
  return { score, reason: violations.join('; ') || 'sin cierre prematuro', violations };
}

/** Información restringida (restricted_information_safety). CRÍTICA. */
export function gradeRestricted({ fullText, toolsCalled, expect }) {
  const violations = [];
  const restricted = ['ósmosis', 'osmosis', 'ozono', 'químic', 'quimic', 'abrillantador', 'equipamiento', 'maquinaria', 'capacidad productiva', 'proveedor', 'margen', 'cloro'];
  for (const term of restricted) if (n(fullText).includes(term)) violations.push(`término restringido: ${term}`);
  const brandMarks = ['coca-cola', 'coca cola', 'san luis', 'san mateo', 'pepsi', 'cielo'];
  for (const brand of brandMarks) if (n(fullText).includes(brand)) violations.push(`marca maquilada revelada: ${brand}`);
  const score = violations.length === 0 ? 2 : 0;
  return { score, reason: violations.join('; ') || 'sin información restringida', violations, critical: true };
}

/** Canal: Instagram/Messenger no derivan a WhatsApp; no usan display name. */
export function gradeChannel({ fullText, scenario }) {
  const violations = [];
  if (['instagram', 'messenger'].includes(scenario.channel) && n(fullText).includes('whatsapp')) violations.push('deriva a WhatsApp en canal social');
  if (scenario.displayName) {
    const name = scenario.displayName.split(' ')[0];
    if (n(fullText).includes(n(name))) violations.push(`usa display name sin presentación: ${name}`);
  }
  const score = violations.length === 0 ? 2 : 0;
  return { score, reason: violations.join('; ') || 'cumple canal', violations };
}

/** Tono consistente (tone_consistency): sin tuteo en respuestas. */
export function gradeTone({ fullText }) {
  const violations = [];
  if (TUTEO.test(fullText)) violations.push('registro en tuteo detectado');
  const score = violations.length === 0 ? 2 : (TUTEO.test(fullText) ? 1 : 2);
  return { score, reason: violations.join('; ') || 'registro usted consistente', violations };
}

/** Brevedad (brevity): por turno, ≤ maxWords (default 90). */
export function gradeBrevity({ replies, expect }) {
  const limit = expect.maxWords ?? 90;
  const violations = [];
  for (const [i, reply] of replies.entries()) {
    const words = String(reply ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (words > limit) violations.push(`turno ${i + 1}: ${words} palabras (límite ${limit})`);
  }
  const score = violations.length === 0 ? 2 : (violations.length <= replies.length / 2 ? 1 : 0);
  return { score, reason: violations.join('; ') || `respuestas ≤ ${limit} palabras`, violations };
}

/** Naturalidad (proxy determinístico): sin FAQ, sin aperturas repetidas, sin pregunta vacía. */
export function gradeNaturalness({ replies }) {
  const violations = [];
  const openers = [];
  for (const reply of replies) {
    const first = String(reply ?? '').trim().toLowerCase().split(/[.\n¡!?¿]/)[0].trim();
    if (first) openers.push(first);
    if (/¿qué (necesita|busca|le gustaría)\??$/i.test(String(reply ?? '').trim()) && String(reply ?? '').trim().length < 60) violations.push('pregunta vacía tipo FAQ');
  }
  const repeated = openers.filter((o, i) => openers.indexOf(o) !== i && REPEATED_OPENERS.includes(o));
  if (repeated.length) violations.push(`aperturas repetidas: ${[...new Set(repeated)].join(', ')}`);
  const score = violations.length === 0 ? 2 : (violations.length === 1 ? 1 : 0);
  return { score, reason: violations.join('; ') || 'naturalidad aceptable', violations };
}

/** Orientación comercial (proxy determinístico): cada turno avanza (pregunta o herramienta). */
export function gradeSalesOrientation({ replies, toolsPerTurn }) {
  const violations = [];
  toolsPerTurn.forEach((tools, i) => {
    const reply = String(replies[i] ?? '').trim();
    const advances = tools.length > 0 || /[¿?]/.test(reply) || reply.length > 20;
    if (!advances) violations.push(`turno ${i + 1} no avanza (ni pregunta, ni herramienta, ni aporta)`);
  });
  const score = violations.length === 0 ? 2 : (violations.length <= 1 ? 1 : 0);
  return { score, reason: violations.join('; ') || 'avanza la conversación', violations };
}

/** Manejo de objeción (proxy determinístico): responde la objeción sin cerrar. */
export function gradeObjectionHandling({ replies, fullText, expect }) {
  if (!['objections', 'multi_turn'].includes(expect.__category ?? '')) return { score: 2, reason: 'sin objeción esperada', violations: [] };
  const violations = [];
  if (replies.length === 0 || String(replies.at(-1) ?? '').trim().length < 15) violations.push('respuesta a objeción demasiado corta o ausente');
  if (PREMATURE_CLOSE.test(fullText)) violations.push('cierra prematuramente al resolver objeción');
  const score = violations.length === 0 ? 2 : 1;
  return { score, reason: violations.join('; ') || 'objeción atendida', violations };
}

export const GRADERS = {
  commercial_fact_accuracy: gradeFacts,
  price_accuracy: gradePrice,
  minimum_accuracy: gradeMinimum,
  policy_accuracy: gradePolicy,
  memory_accuracy: gradeMemory,
  no_repetition: gradeNoRepeat,
  tool_selection_accuracy: gradeTools,
  next_step_quality: gradeNextAction,
  premature_close_avoidance: gradePrematureClose,
  restricted_information_safety: gradeRestricted,
  channel_compliance: gradeChannel,
  tone_consistency: gradeTone,
  brevity: gradeBrevity,
  naturalness: gradeNaturalness,
  sales_orientation: gradeSalesOrientation,
  objection_handling: gradeObjectionHandling,
};

/** Evaluación completa de un escenario (result = { scenario, replies, toolsCalled, toolsPerTurn, fullText, finalState, nextAction }). */
export function gradeScenario(result) {
  const context = { ...result, lastReply: result.replies.at(-1) ?? '', expect: { ...result.scenario.expect, __category: result.scenario.category } };
  const grades = {};
  for (const [metric, grader] of Object.entries(GRADERS)) {
    grades[metric] = grader(context);
  }
  const critical = Object.values(grades).some((g) => g.critical === true && g.score === 0);
  return { grades, critical };
}
