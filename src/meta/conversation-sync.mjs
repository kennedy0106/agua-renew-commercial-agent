/**
 * Importa las conversaciones EXISTENTES de Messenger a la base de leads.
 *
 * El webhook solo captura mensajes nuevos; esto trae el historial que ya existe
 * en la página. IMPORTANTE: solo hace peticiones GET a la Graph API, por lo que
 * NO marca ningún mensaje como leído ni dispara respuestas (no se usa
 * handleInboundMessage). El estado de lectura queda intacto.
 */
export async function syncConversations({ repository, pageId, pageAccessToken, apiVersion = 'v21.0', baseUrl = 'https://graph.facebook.com', onlyUnread = true }) {
  if (!pageId || !pageAccessToken) {
    throw new Error('syncConversations requiere pageId y pageAccessToken');
  }
  const graph = async (url) => {
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(`Graph API ${data.error.code}: ${data.error.message}`);
    return data;
  };

  // 1) Listar conversaciones (paginado). Con `onlyUnread` se importan solo las
  // que tienen mensajes sin leer (evita inundar el panel con historial atendido).
  const conversations = [];
  let url = `${baseUrl}/${apiVersion}/${pageId}/conversations?platform=messenger&fields=id,participants,unread_count,updated_time&limit=100&access_token=${encodeURIComponent(pageAccessToken)}`;
  while (url) {
    const page = await graph(url);
    for (const conv of (page.data ?? [])) {
      if (onlyUnread && (conv.unread_count ?? 0) === 0) continue;
      conversations.push(conv);
    }
    url = page.paging?.next ?? null;
  }

  // 2) Por cada conversación: identificar al cliente, traer mensajes e importarlos.
  let leadsCreated = 0;
  let messagesImported = 0;
  let messagesSkipped = 0;

  for (const conv of conversations) {
    const participant = (conv.participants?.data ?? []).find((p) => String(p.id) !== String(pageId));
    const participantId = participant?.id ?? conv.id;

    let lead = await repository.findLeadByExternalConversation({ channel: 'facebook_messenger', sourceConversationId: participantId });
    if (!lead) {
      lead = await repository.createLead({
        sourceChannel: 'facebook_messenger',
        sourceOrigin: 'imported',
        sourceConversationId: participantId, // PSID del usuario: mismo id que usa el webhook
        metaUserId: participantId,
        metaUsername: participant?.name ?? null,
      });
      leadsCreated += 1;
      await repository.appendEvent({ leadId: lead.id, eventType: 'LEAD_CREATED', payload: { source: 'import' } });
    } else if (!lead.metaUsername && participant?.name) {
      // El webhook no trae el nombre del usuario; el sync lo completa.
      lead = await repository.updateLead(lead.id, { metaUsername: participant.name });
    }

    let messagesUrl = `${baseUrl}/${apiVersion}/${conv.id}/messages?fields=id,message,created_time,from{id,name}&limit=100&access_token=${encodeURIComponent(pageAccessToken)}`;
    let latestInboundAt = lead.lastInboundAt ? new Date(lead.lastInboundAt) : null;
    while (messagesUrl) {
      const messages = await graph(messagesUrl);
      for (const message of (messages.data ?? [])) {
        if (!message.id) { messagesSkipped += 1; continue; }
        const direction = String(message.from?.id) === String(pageId) ? 'outbound' : 'inbound';
        const sourceCreatedAt = message.created_time ? new Date(message.created_time) : null;
        const stored = await repository.appendMessage({
          leadId: lead.id,
          channel: 'facebook_messenger',
          direction,
          actorType: direction === 'outbound' ? 'page' : 'user',
          externalMessageId: message.id,
          content: message.message ?? '',
          deliveryStatus: direction === 'outbound' ? 'SENT' : 'RECEIVED',
          providerMessageId: direction === 'outbound' ? message.id : null,
          sourceCreatedAt,
        });
        if (stored?.wasInserted === false) messagesSkipped += 1;
        else messagesImported += 1;
        if (direction === 'inbound' && sourceCreatedAt && (!latestInboundAt || sourceCreatedAt > latestInboundAt)) {
          latestInboundAt = sourceCreatedAt;
        }
      }
      messagesUrl = messages.paging?.next ?? null;
    }

    if (latestInboundAt) await repository.updateLead(lead.id, { lastInboundAt: latestInboundAt.toISOString() });
  }

  return { conversations: conversations.length, leadsCreated, messagesImported, messagesSkipped };
}
