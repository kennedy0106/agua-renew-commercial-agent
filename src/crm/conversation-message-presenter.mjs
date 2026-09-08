const EVENT_RULES = [
  {
    kind: 'ad_response',
    matches: (text) => /respondi[oó] un anuncio\.?$/iu.test(text),
    title: 'Conversación iniciada desde un anuncio',
  },
  {
    kind: 'comment_context',
    matches: (text) => /est[aá]s respondiendo (?:el|al) comentario/iu.test(text),
    title: 'Conversación iniciada desde un comentario',
  },
  {
    kind: 'automatic_stage',
    matches: (text) => /etiqueta autom[aá]tica agregada|etapa de cliente potencial establecida/iu.test(text),
    title: 'Meta actualizó la etapa del contacto',
  },
  {
    kind: 'whatsapp_handoff',
    matches: (text) => /se envi[oó] informaci[oó]n por whatsapp/iu.test(text),
    title: 'Seguimiento registrado en WhatsApp',
  },
];

function cleanText(value) {
  return String(value ?? '')
    .replace(/\uFFFD+/gu, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
}

function sourceTime(message) {
  const value = message.sourceCreatedAt ?? message.source_created_at ?? message.createdAt ?? message.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function classify(message) {
  const rawContent = String(message.content ?? '');
  const displayContent = cleanText(rawContent);
  const actorType = message.actorType ?? message.actor_type ?? null;
  const link = (displayContent.match(/https?:\/\/\S+/iu)?.[0] ?? '').replace(/[),.;]+$/gu, '') || null;
  const event = EVENT_RULES.find((rule) => rule.matches(displayContent));

  if (!displayContent || /^\[(?:imagen|video|audio|archivo|contenido multimedia)(?: adjunt[oa])?\]$/iu.test(displayContent)) {
    return {
      ...message,
      actorType,
      messageKind: 'media',
      displayContent: displayContent.replace(/^\[|\]$/gu, '') || 'Contenido multimedia compartido',
      actorLabel: message.direction === 'inbound' ? 'Prospecto' : 'Agua ReNew',
    };
  }

  if (event) {
    return {
      ...message,
      actorType,
      messageKind: 'event',
      eventKind: event.kind,
      eventTitle: event.title,
      eventLink: link,
      displayContent,
      actorLabel: 'Actividad de Meta',
    };
  }

  return {
    ...message,
    actorType,
    messageKind: 'text',
    displayContent,
    actorLabel: message.direction === 'inbound'
      ? 'Prospecto'
      : actorType === 'automation'
        ? 'Automatización'
        : actorType === 'page'
          ? 'Equipo Agua ReNew'
          : 'Agua ReNew',
  };
}

/** Ordena por fecha de Meta y colapsa duplicados del mismo actor en dos segundos. */
export function presentConversationMessages(messages = []) {
  const ordered = messages
    .map((message, index) => ({ ...message, __index: index }))
    .sort((left, right) => sourceTime(left) - sourceTime(right)
      || Number(left.sequenceNo ?? left.sequence_no ?? left.__index) - Number(right.sequenceNo ?? right.sequence_no ?? right.__index));

  const presented = [];
  const lastBySignature = new Map();
  for (const raw of ordered) {
    const message = classify(raw);
    delete message.__index;
    const signature = `${message.direction}|${message.actorType ?? ''}|${message.messageKind}|${message.displayContent}`;
    const previous = lastBySignature.get(signature);
    if (previous && Math.abs(sourceTime(message) - sourceTime(previous)) <= 2_000) {
      previous.duplicateCount = (previous.duplicateCount ?? 1) + 1;
      continue;
    }
    message.duplicateCount = 1;
    presented.push(message);
    lastBySignature.set(signature, message);
  }
  return presented;
}

export { cleanText as sanitizeConversationText };
