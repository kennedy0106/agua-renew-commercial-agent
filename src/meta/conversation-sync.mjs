/**
 * Importa las conversaciones EXISTENTES de Messenger a la base de leads.
 *
 * El webhook solo captura mensajes nuevos; esto trae el historial que ya existe
 * en la página. IMPORTANTE: solo hace peticiones GET a la Graph API, por lo que
 * NO marca ningún mensaje como leído ni dispara respuestas (no se usa
 * handleInboundMessage). El estado de lectura queda intacto.
 */
export async function syncConversations({ repository, observer, pageId, businessAccountId = pageId, platform = 'messenger', pageAccessToken, apiVersion = 'v21.0', baseUrl = 'https://graph.facebook.com', onlyUnread = true }) {
  if (!businessAccountId || !pageAccessToken) {
    throw new Error('syncConversations requiere businessAccountId y pageAccessToken');
  }
  const channel = platform === 'instagram' ? 'instagram' : 'facebook_messenger';
  const graph = async (url) => {
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) throw new Error(`Graph API ${data.error.code}: ${data.error.message}`);
    return data;
  };

  // 1) Listar conversaciones (paginado). Con `onlyUnread` se importan solo las
  // que tienen mensajes sin leer (evita inundar el panel con historial atendido).
  const conversations = [];
  let url = `${baseUrl}/${apiVersion}/${businessAccountId}/conversations?platform=${encodeURIComponent(platform)}&fields=id,participants,unread_count,updated_time&limit=100&access_token=${encodeURIComponent(pageAccessToken)}`;
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
    const participant = (conv.participants?.data ?? []).find((p) => String(p.id) !== String(businessAccountId));
    const participantId = participant?.id ?? conv.id;

    let lead = await repository.findLeadByExternalConversation({ channel, sourceConversationId: participantId });

    let messagesUrl = `${baseUrl}/${apiVersion}/${conv.id}/messages?fields=id,message,attachments,created_time,from{id,name}&limit=100&access_token=${encodeURIComponent(pageAccessToken)}`;
    let latestInboundAt = lead?.lastInboundAt ? new Date(lead.lastInboundAt) : null;
    while (messagesUrl) {
      const messages = await graph(messagesUrl);
      for (const message of (messages.data ?? [])) {
        if (!message.id) { messagesSkipped += 1; continue; }
        const direction = String(message.from?.id) === String(businessAccountId) ? 'outbound' : 'inbound';
        const sourceCreatedAt = message.created_time ? new Date(message.created_time) : null;
        const attachment = (message.attachments?.data ?? [])[0];
        const attachmentLabel = attachment
          ? attachment.mime_type?.startsWith('image/') ? '[Imagen adjunta]'
            : attachment.mime_type?.startsWith('video/') ? '[Video adjunto]'
              : attachment.mime_type?.startsWith('audio/') ? '[Audio adjunto]'
                : '[Archivo adjunto]'
          : '';
        const observed = await observer.observe({
          channel,
          sourceConversationId: participantId,
          sourceOrigin: lead?.sourceOrigin ?? 'imported',
          metaUserId: participantId,
          sender: { id: participantId, username: participant?.name ?? null },
          direction,
          actorType: direction === 'outbound' ? 'meta_business_agent' : 'user',
          actorId: message.from?.id ?? null,
          externalMessageId: message.id,
          text: String(message.message ?? '').trim() ? message.message : attachmentLabel,
          timestamp: sourceCreatedAt,
          skipProcessing: !String(message.message ?? '').trim(),
          deferProcessing: true,
        });
        if (observed.created && !lead) leadsCreated += 1;
        lead = observed.lead;
        if (observed.duplicate) messagesSkipped += 1;
        else messagesImported += 1;
        if (direction === 'inbound' && sourceCreatedAt && (!latestInboundAt || sourceCreatedAt > latestInboundAt)) {
          latestInboundAt = sourceCreatedAt;
        }
      }
      messagesUrl = messages.paging?.next ?? null;
    }

    if (lead && latestInboundAt) await repository.updateLead(lead.id, { lastInboundAt: latestInboundAt.toISOString() });
  }

  return { platform, conversations: conversations.length, leadsCreated, messagesImported, messagesSkipped };
}
