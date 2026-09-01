/* Panel de leads — Agua ReNew · v4 (funnel, accesible, español) */
const state = {
  filters: {},
  search: '',
  sort: { key: 'createdAt', dir: 'desc' },
  lastListKey: null,
  initialMotion: true,
  visibleCount: null,
  currentLeads: [],
};
const $ = (id) => document.getElementById(id);
const isMobile = () => window.matchMedia('(max-width: 980px)').matches;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollToElement = (element, options = {}) => element?.scrollIntoView({ ...options, behavior: reduceMotion() ? 'auto' : 'smooth' });
const listPageSize = () => window.matchMedia('(max-width: 700px)').matches ? 8 : 12;

function resetListView() {
  state.visibleCount = listPageSize();
  state.lastListKey = null;
}

/* Icono del sprite SVG (sistema consistente, un solo trazo). */
function I(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function toast(message, kind = '', actionLabel = '', actionFn = null) {
  const el = $('toast');
  el.innerHTML = `${escapeHtml(message)}${actionLabel ? `<button class="toast-action">${escapeHtml(actionLabel)}</button>` : ''}`;
  el.className = 'toast show ' + kind;
  const btn = el.querySelector('.toast-action');
  if (btn && actionFn) btn.addEventListener('click', () => { actionFn(); hideToast(); });
  clearTimeout(toast._t);
  toast._t = setTimeout(hideToast, actionFn ? 9000 : 3200);
}
function hideToast() {
  const el = $('toast');
  el.className = 'toast';
  clearTimeout(toast._t);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined && options.body !== null) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers, body: options.body !== undefined ? JSON.stringify(options.body) : undefined });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error ?? `Error ${response.status}`);
  }
  return response;
}

/* ── Etiquetas en español ── */
const STATUS_LABEL = {
  NEW: 'Nuevo', COLLECTING: 'Capturando', WAITING_PHONE: 'Falta WhatsApp',
  WAITING_MODALITY: 'Falta modalidad', READY_FOR_WHATSAPP: 'Listo',
  CONTACT_OPENED: 'WhatsApp abierto',
  CONTACTED_MANUALLY: 'Contactado', CLOSED: 'Cerrado',
  WHATSAPP_SMART_LINK_SENT: 'Enlace enviado', WHATSAPP_SEND_FAILED: 'Error de envío',
};
const EVENT_LABEL = {
  LEAD_CREATED: 'Prospecto creado', LEAD_CLOSED: 'Prospecto cerrado', LEAD_REOPENED: 'Prospecto reabierto',
  LEAD_EDITED: 'Datos editados', CONTROL_CHANGED: 'Control cambiado', PHONE_CORRECTED: 'Teléfono corregido',
  PHONE_REQUESTED: 'WhatsApp solicitado', OPERATOR_MESSAGE_SENT: 'Mensaje enviado',
  WHATSAPP_OPENED: 'WhatsApp abierto', CONTACT_MARKED: 'Marcado contactado',
  META_CONFIRMATION_SENT: 'Confirmación enviada', META_CONFIRMATION_BLOCKED: 'Ventana Meta vencida',
  AUTO_REPLY_SENT: 'Respuesta automática', CLASSIFIED: 'Conversación clasificada',
  HISTORY_ANALYZED: 'Histórico analizado', OUTBOUND_QUEUED: 'Mensaje encolado',
  OUTBOUND_SENT: 'Mensaje entregado', OUTBOUND_RETRY_SCHEDULED: 'Reintento programado',
  OUTBOUND_FAILED: 'Entrega fallida', OUTBOUND_UNKNOWN: 'Entrega incierta',
  OUTBOUND_REQUEUED: 'Reintento manual encolado', MODALITY_CAPTURED: 'Modalidad registrada',
  PRODUCT_CAPTURED: 'Producto registrado', PHONE_CAPTURED: 'WhatsApp registrado',
};
const CONTROL_LABEL = { AUTO: 'Automático', HUMAN: 'Manual' };
const PRODUCT_LABEL = { '20l': '20 L', '1l': '1 L', '625ml': '625 ml', '10_5l': '10.5 L' };
const MODALITY_LABEL = { maquila: 'Maquila', distribution_agua_renew: 'Distribución', final_customer: 'Consumo' };
const CHANNEL_LABEL = { instagram: 'Instagram', facebook_messenger: 'Facebook' };
const TYPE_LABEL = { commercial_lead: 'Comercial', service_provider: 'Proveedor', unclear: 'Por clasificar', spam_or_irrelevant: 'No relevante' };
const ORIGIN_LABEL = { organic_dm: 'Mensaje directo', ad_automation: 'Anuncio', historical_sync: 'Histórico sincronizado' };
const FILTER_LABEL = { status: 'estado', channel: 'canal', type: 'tipo' };
const STATUS_ICON = {
  NEW: 'zap', COLLECTING: 'message', WAITING_PHONE: 'whatsapp',
  WAITING_MODALITY: 'clock', READY_FOR_WHATSAPP: 'whatsapp',
  CONTACT_OPENED: 'whatsapp', CONTACTED_MANUALLY: 'check', CLOSED: 'x',
  WHATSAPP_SMART_LINK_SENT: 'whatsapp', WHATSAPP_SEND_FAILED: 'alert',
};

function statusBadge(status) {
  const safeStatus = status ?? 'DEFAULT';
  const label = STATUS_LABEL[safeStatus] ?? safeStatus;
  return `<span class="badge-status ${escapeHtml(safeStatus)}">${I(STATUS_ICON[safeStatus] ?? 'radio', 'status-icon')}<span>${escapeHtml(label)}</span></span>`;
}

function evLabel(type) { return EVENT_LABEL[type] ?? type; }

const introStartedAt = performance.now();
let introSettled = false;
function settleMotionIntro() {
  if (introSettled) return;
  introSettled = true;
  const reveal = $('water-reveal');
  if (!reveal) return;
  const wait = Math.max(0, 420 - (performance.now() - introStartedAt));
  setTimeout(() => {
    reveal.classList.add('is-done');
    setTimeout(() => reveal.remove(), 260);
  }, wait);
}

/* ── Lista ── */
async function loadList(animate = false) {
  const errorBox = $('list-error');
  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(state.filters)) {
      if (value) query.set(key, value);
    }
    const response = await api(`/api/leads?${query.toString()}`);
    const data = await response.json();
    let leads = data.leads;

    // Búsqueda client-side por nombre o teléfono.
    const q = state.search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    if (q) {
      leads = leads.filter((l) =>
        (l.metaUsername ?? '').toLowerCase().includes(q) ||
        (qDigits && (l.phoneE164 ?? '').replace(/\D/g, '').includes(qDigits)));
    }

    // Orden client-side.
    leads = sortLeads(leads, state.sort);
    state.currentLeads = leads;
    if (state.visibleCount === null) state.visibleCount = listPageSize();

    // Solo re-render si el contenido cambió (evita reiniciar animaciones cada 15s).
    const key = JSON.stringify(leads.map((l) => [l.id, l.status, l.phoneE164, l.updatedAt ?? l.createdAt]));
    if (key !== state.lastListKey) {
      state.lastListKey = key;
      renderStats(leads, state.initialMotion);
      renderTable(leads, state.initialMotion);
      state.initialMotion = false;
    } else {
      updateListSummary(leads);
    }
    errorBox.hidden = true;
    errorBox.innerHTML = '';
    settleMotionIntro();
    return true;
  } catch (error) {
    errorBox.hidden = false;
    errorBox.innerHTML = `<span>No pudimos actualizar los prospectos. Los datos visibles pueden estar desactualizados.</span><button type="button">Reintentar</button>`;
    errorBox.querySelector('button').addEventListener('click', () => loadList(true), { once: true });
    $('list-sub').textContent = 'Sin actualización reciente';
    settleMotionIntro();
    return false;
  }
}

function renderLoadingState() {
  $('stats').innerHTML = Array.from({ length: 4 }, () => `<div class="stat stat-loading"><span class="skeleton value"></span><span class="skeleton label"></span><span class="skeleton foot"></span></div>`).join('');
  $('leads-table').querySelector('tbody').innerHTML = `<tr><td colspan="5" class="empty loading-row"><span class="loading-drop">${I('droplet')}</span><div>Preparando prospectos…</div></td></tr>`;
}

function sortLeads(leads, { key, dir }) {
  const mult = dir === 'asc' ? 1 : -1;
  return [...leads].sort((a, b) => {
    let va = a[key] ?? '', vb = b[key] ?? '';
    if (key === 'createdAt' || key === 'updatedAt') { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
    else if (typeof va === 'string') va = va.toLowerCase();
    else if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;
    return 0;
  });
}

function leadInitials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || 'AR';
}

function animateStatValue(element, target) {
  if (!element) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = String(target);
    return;
  }
  const start = performance.now();
  const duration = 260;
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    element.textContent = String(Math.round(target * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderStats(leads, animate = false) {
  const total = leads.length;
  const missingPhone = leads.filter((l) => !l.phoneE164).length;
  const ready = leads.filter((l) => l.status === 'READY_FOR_WHATSAPP').length;
  const contacted = leads.filter((l) => ['CONTACTED_MANUALLY', 'CONTACT_OPENED'].includes(l.status)).length;
  const pending = total - contacted;
  $('stats').innerHTML = `
    <div class="stat ${animate ? 'stat-in' : ''} s-blue"><span class="stat-accent"></span><span class="stat-symbol" aria-hidden="true">${I('users')}</span><span class="stat-value" data-count="${total}">${animate ? 0 : total}</span><span class="stat-label">Leads totales</span><span class="stat-foot">${pending} por atender</span></div>
    <div class="stat ${animate ? 'stat-in' : ''} s-amber"><span class="stat-accent"></span><span class="stat-symbol" aria-hidden="true">${I('whatsapp')}</span><span class="stat-value" data-count="${missingPhone}">${animate ? 0 : missingPhone}</span><span class="stat-label">Falta WhatsApp</span><span class="stat-foot">sin número capturado</span></div>
    <div class="stat ${animate ? 'stat-in' : ''} s-green"><span class="stat-accent"></span><span class="stat-symbol" aria-hidden="true">${I('whatsapp')}</span><span class="stat-value" data-count="${ready}">${animate ? 0 : ready}</span><span class="stat-label">Listos para WhatsApp</span><span class="stat-foot">con número validado</span></div>
    <div class="stat ${animate ? 'stat-in' : ''} s-slate"><span class="stat-accent"></span><span class="stat-symbol" aria-hidden="true">${I('check')}</span><span class="stat-value" data-count="${contacted}">${animate ? 0 : contacted}</span><span class="stat-label">Contactados</span><span class="stat-foot">incluye abiertos en WhatsApp</span></div>`;
  if (animate) $('stats').querySelectorAll('[data-count]').forEach((element) => animateStatValue(element, Number(element.dataset.count)));
}

function updateListSummary(leads) {
  const shown = Math.min(state.visibleCount ?? leads.length, leads.length);
  const noun = leads.length === 1 ? 'prospecto' : 'prospectos';
  $('list-sub').textContent = leads.length ? `Mostrando ${shown} de ${leads.length} ${noun}` : '';
  const remaining = Math.max(0, leads.length - shown);
  const footer = $('list-footer');
  footer.hidden = remaining === 0;
  $('list-progress').textContent = remaining ? `${remaining} ${remaining === 1 ? 'prospecto pendiente' : 'prospectos pendientes'}` : '';
  $('load-more').textContent = remaining ? `Cargar ${Math.min(listPageSize(), remaining)} más` : 'Todos cargados';
}

function renderTable(leads, animate) {
  const tbody = $('leads-table').querySelector('tbody');
  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${I('inbox')}<div>${state.search ? 'Sin resultados para la búsqueda.' : 'Sin prospectos con estos filtros.<br>Los mensajes nuevos aparecerán aquí al sincronizar.'}</div></td></tr>`;
    updateListSummary(leads);
    return;
  }
  const visibleLeads = leads.slice(0, state.visibleCount ?? listPageSize());
  tbody.innerHTML = visibleLeads.map((lead, idx) => {
    const date = new Date(lead.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
    const phone = maskPhone(lead.phoneE164);
    const blocked = lead.metaConfirmationBlocked ? ` <span class="chip blocked" aria-label="Ventana de Meta vencida hace 24 horas">${I('alert')} <span aria-hidden="true">24h</span></span>` : '';
    const name = lead.metaUsername || `Prospecto de ${CHANNEL_LABEL[lead.sourceChannel] ?? 'Meta'}`;
    const isSelected = $('detail').dataset.leadId === lead.id;
    const rowClasses = [isSelected ? 'row-selected' : '', animate ? 'row-enter' : ''].filter(Boolean).join(' ');
    const rowDelay = animate ? ` style="--row-delay:${Math.min(idx * 24, 168)}ms"` : '';
    const channelClass = lead.sourceChannel === 'instagram' ? 'instagram' : 'facebook';
    const product = PRODUCT_LABEL[lead.product] ?? 'Sin interés definido';
    const modality = MODALITY_LABEL[lead.modality] ?? '';
    const type = lead.conversationType && lead.conversationType !== 'commercial_lead' ? (TYPE_LABEL[lead.conversationType] ?? lead.conversationType) : '';
    const phoneNote = phone
      ? `<span class="progress-note contact-ready">${I('whatsapp')}<span>${phone}</span></span>`
      : (lead.status === 'WAITING_PHONE' ? '' : `<span class="progress-note contact-missing">${I('whatsapp')}<span>Sin número</span></span>`);
    const channelLabel = CHANNEL_LABEL[lead.sourceChannel] ?? lead.sourceChannel;
    const channelIcon = lead.sourceChannel === 'instagram' ? 'instagram' : 'facebook';
    return `<tr${rowDelay}${rowClasses ? ` class="${rowClasses}"` : ''}>
      <td data-label="Prospecto"><span class="lead-person"><span class="lead-avatar ${channelClass}" aria-hidden="true">${escapeHtml(leadInitials(name))}</span><span class="lead-person-copy"><strong>${escapeHtml(name)}</strong><span class="lead-meta channel-meta ${channelClass}">${I(channelIcon, 'channel-icon')}<span>${escapeHtml(channelLabel)}</span></span></span></span></td>
      <td data-label="Entrada"><time class="lead-date" datetime="${escapeHtml(lead.createdAt)}">${date}</time></td>
      <td data-label="Oportunidad" class="${lead.product || lead.modality || type ? '' : 'is-empty'}"><span class="interest-stack"><strong>${product}</strong>${modality ? `<span>${modality}</span>` : ''}${type ? `<span class="lead-type">${type}</span>` : ''}</span></td>
      <td data-label="Avance"><span class="progress-stack">${statusBadge(lead.status)}${phoneNote}${blocked}</span></td>
      <td data-label="Acciones"><div class="actions-cell">
        ${['READY_FOR_WHATSAPP', 'CONTACT_OPENED'].includes(lead.status) ? `<a class="btn small primary row-whatsapp has-tooltip" href="/api/leads/${lead.id}" data-open="${lead.id}" data-tooltip="Abrir WhatsApp" aria-label="Abrir WhatsApp de ${escapeHtml(name)}">${I('whatsapp')} <span>WhatsApp</span></a>` : ''}
        <button class="btn small ghost row-detail has-tooltip" data-detail="${lead.id}" data-tooltip="Abrir conversación" aria-label="Abrir conversación de ${escapeHtml(name)}">${I('eye')} <span>Abrir</span></button>
      </div></td>
    </tr>`;
  }).join('');
  updateListSummary(leads);
}

async function openWhatsApp(id) {
  const response = await api(`/api/leads/${id}`, { method: 'GET' });
  const data = await response.json();
  await api(`/api/leads/${id}/open`, { method: 'POST', body: {} });
  window.open(data.whatsappLink.url, '_blank');
  toast('Enlace de WhatsApp abierto', 'ok');
  loadList();
}

async function markContacted(id) {
  await api(`/api/leads/${id}/contact`, { method: 'POST', body: {} });
  toast('Marcado como contactado', 'ok');
  loadList();
  showDetail(id);
}

/* ── Funnel: pedir WhatsApp y responder ── */
async function requestWhatsapp(id) {
  try {
    const response = await api(`/api/leads/${id}/request-whatsapp`, { method: 'POST', body: {} });
    await response.json();
    toast('Solicitud encolada para envío', 'ok');
    showDetail(id);
  } catch (error) {
    toast(error.message, 'err');
  }
}

async function sendMessage(id) {
  const input = $('composer-input');
  const text = (input?.value ?? '').trim();
  if (!text) return;
  input.value = '';
  try {
    const response = await api(`/api/leads/${id}/send-message`, { method: 'POST', body: { text } });
    await response.json();
    toast('Mensaje encolado', 'ok');
    showDetail(id);
  } catch (error) {
    toast(error.message, 'err');
    input.value = text;
  }
}

/* Inserta la burbuja saliente sin recargar todo el chat. */
function appendOutbound(id, text) {
  const thread = document.querySelector('.chat-thread');
  if (!thread) return;
  const time = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'msg outbound';
  div.innerHTML = `<div class="bubble">${escapeHtml(text)}<div class="meta">${I('send')} ${time}</div></div>`;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

/* ── Panel de conversación ── */
function renderPanelEmpty() {
  const el = $('detail');
  delete el.dataset.leadId;
  document.querySelectorAll('tbody tr.row-selected').forEach((row) => row.classList.remove('row-selected'));
  el.setAttribute('aria-label', 'Conversación del prospecto');
  $('workspace').classList.remove('open');
  el.innerHTML = `<div class="panel-empty">
    ${I('message')}
    <div><strong>Ninguna conversación seleccionada</strong>Selecciona un prospecto de la tabla para ver su conversación y las acciones disponibles.</div>
  </div>`;
}

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Hoy';
  if (sameDay(date, yesterday)) return 'Ayer';
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

function chatThread(messages) {
  if (!messages.length) return '<div class="panel-empty" style="min-height:0">Sin mensajes en esta conversación</div>';
  let lastDay = null;
  let out = '';
  messages.forEach((m) => {
    const d = new Date(m.createdAt);
    const day = dayLabel(d);
    if (day !== lastDay) { out += `<div class="day-divider">${day}</div>`; lastDay = day; }
    const time = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    if (m.direction === 'inbound') {
      out += `<div class="msg inbound">
        <div class="bubble">${escapeHtml(m.content)}<div class="meta">${I('clock')} ${time}</div></div>
      </div>`;
    } else {
      const delivery = {
        PENDING: 'Pendiente', SENDING: 'Enviando', RETRY_WAIT: 'Reintentando',
        SENT: 'Enviado', FAILED: 'Falló', UNKNOWN: 'Entrega incierta',
      }[m.deliveryStatus] ?? 'Enviado';
      const retry = ['FAILED', 'UNKNOWN'].includes(m.deliveryStatus)
        ? `<button class="msg-retry" data-retry-message="${m.id}" data-retry-lead="${m.leadId}">Reintentar</button>` : '';
      out += `<div class="msg outbound">
        <div class="bubble">${escapeHtml(m.content)}<div class="meta">${I('send')} ${time} · ${delivery} ${retry}</div></div>
      </div>`;
    }
  });
  return out;
}

function initialOf(name) {
  return (name ?? '?').trim().charAt(0).toUpperCase() || '?';
}

async function showDetail(id) {
  const response = await api(`/api/leads/${id}`);
  const data = await response.json();
  const lead = data.lead;
  const el = $('detail');
  el.dataset.leadId = id;
  $('workspace').classList.add('open');
  const name = lead.metaUsername || `Prospecto de ${CHANNEL_LABEL[lead.sourceChannel] ?? 'Meta'}`;
  el.setAttribute('aria-label', `Conversación con ${name}`);
  const phone = lead.phoneE164 ? escapeHtml(maskPhone(lead.phoneE164)) : '<span class="chip phone missing">sin número</span>';
  const events = data.events.map((e) => {
    const t = new Date(e.createdAt).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<li><span>${escapeHtml(evLabel(e.eventType))}</span><span class="ev-time">${t}</span></li>`;
  }).join('');
  const isReady = lead.status === 'READY_FOR_WHATSAPP';
  const canContact = ['READY_FOR_WHATSAPP', 'CONTACT_OPENED'].includes(lead.status);
  // Jerarquía: la acción que avanza el funnel es primaria; el resto, secundaria.
  const primary = isReady
    ? `<a class="btn small primary panel-primary-action" href="/api/leads/${lead.id}" data-open="${lead.id}">${I('whatsapp')} Abrir WhatsApp</a>`
    : (lead.phoneE164 ? '' : `<button class="btn small primary panel-primary-action" data-request-whatsapp="${lead.id}">${I('whatsapp')} Pedir WhatsApp</button>`);
  const seg = (mode, label) => `<button class="seg-btn ${lead.controlMode === mode ? 'active' : ''}" data-control="${lead.id}" data-mode="${mode}" title="${mode === 'HUMAN' ? 'Pausar el seguimiento automático' : 'Devolver al flujo automático'}">${label}</button>`;
  const actions = `
    ${primary}
    ${canContact ? `<button class="btn small green" data-contact="${lead.id}">${I('check')} Contactado</button>` : ''}
    <div class="seg" role="group" aria-label="Modo de control del lead">${seg('HUMAN', 'Manual')}${seg('AUTO', 'Automático')}</div>`;
  el.innerHTML = `
    <div class="panel-head">
      <div class="avatar">${initialOf(name)}</div>
      <div class="who">
        <strong>${escapeHtml(name)}</strong>
        <small>${CHANNEL_LABEL[lead.sourceChannel] ?? lead.sourceChannel} · ${STATUS_LABEL[lead.status] ?? lead.status} · ${CONTROL_LABEL[lead.controlMode] ?? lead.controlMode}</small>
      </div>
      <button class="close-btn" id="detail-close" aria-label="Cerrar conversación">${I('x')}</button>
    </div>
    <div class="panel-actions">${actions}</div>
    <div class="chat-thread" aria-label="Mensajes de la conversación">${chatThread(data.messages)}</div>
    <div class="composer">
      <input id="composer-input" placeholder="Responder por Messenger…" aria-label="Escribir respuesta para enviar por Messenger">
      <button class="btn primary" id="composer-send" aria-label="Enviar mensaje">${I('send')} <span class="btn-label">Enviar</span></button>
    </div>
    <details class="panel-info">
      <summary>${I('users')} Ficha del lead <span class="chev">${I('chevron')}</span></summary>
      <div class="info-reveal">
        <div class="info-body">
          <dl class="kv">
            <dt>Estado</dt><dd>${statusBadge(lead.status)}</dd>
            <dt>Control</dt><dd>${CONTROL_LABEL[lead.controlMode] ?? lead.controlMode}</dd>
            <dt>WhatsApp</dt><dd>${phone}</dd>
            <dt>Producto</dt><dd>${PRODUCT_LABEL[lead.product] ?? '—'}</dd>
            <dt>Modalidad</dt><dd>${MODALITY_LABEL[lead.modality] ?? '—'}</dd>
            <dt>Origen</dt><dd>${escapeHtml(ORIGIN_LABEL[lead.sourceOrigin] ?? 'Meta')}</dd>
            <dt>Confianza</dt><dd>${lead.classificationConfidence == null ? '—' : `${Math.round(Number(lead.classificationConfidence) * 100)}%`}</dd>
          </dl>
          <div class="phone-edit-row">
            <input id="phone-edit" placeholder="Corregir teléfono" aria-label="Corregir teléfono del prospecto">
            <button class="btn small primary" data-phone="${lead.id}">Guardar</button>
          </div>
          <h4 class="events-title">Eventos</h4>
          <ul class="events-list">${events || '<li>Sin eventos</li>'}</ul>
          <div class="lead-management" aria-label="Gestión del prospecto">
            <button class="btn small ghost" data-close="${lead.id}" title="Cerrar lead (se pide confirmación)">${I('lock')} Cerrar lead</button>
            <button class="btn small ghost del" data-delete="${lead.id}" title="Eliminar definitivamente los datos de este prospecto">${I('trash')} Eliminar</button>
          </div>
        </div>
      </div>
    </details>`;
  $('detail-close').addEventListener('click', () => {
    renderPanelEmpty();
    if (isMobile()) scrollToElement(document.querySelector('.table-card'));
  });
  $('composer-send').addEventListener('click', () => sendMessage(id));
  $('composer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(id); }
  });
  state.lastListKey = null; // refresca la fila seleccionada antes de posicionar el panel
  await loadList(false);
  if (isMobile()) el.scrollIntoView({ block: 'start', behavior: 'auto' });
  const revealLatestMessage = () => {
    const thread = el.querySelector('.chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  };
  requestAnimationFrame(revealLatestMessage);
  setTimeout(revealLatestMessage, 240);
}

function maskPhone(phone) {
  if (!phone) return null;
  return phone.length > 6 ? `${phone.slice(0, 4)}****${phone.slice(-4)}` : phone;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Cierre con confirmación en dos pasos + deshacer ── */
async function closeLead(id, btn) {
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = '¿Confirmar cierre?';
    clearTimeout(closeLead._t);
    closeLead._t = setTimeout(() => disarmClose(btn), 3500);
    return;
  }
  disarmClose(btn);
  await api(`/api/leads/${id}/close`, { method: 'POST', body: {} });
  toast('Lead cerrado', '', 'Deshacer', () => reopenLead(id));
  loadList(false);
  renderPanelEmpty();
}
function disarmClose(btn) {
  if (!btn) return;
  btn.classList.remove('armed');
  if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
}
async function reopenLead(id) {
  try {
    await api(`/api/leads/${id}/reopen`, { method: 'POST', body: {} });
    toast('Lead reabierto', 'ok');
    loadList();
  } catch (error) {
    toast(error.message, 'err');
  }
}

/* ── Eliminación definitiva: doble confirmación (irreversible) ── */
async function deleteLead(id, btn) {
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = '¿Eliminar definitivamente?';
    clearTimeout(deleteLead._t);
    deleteLead._t = setTimeout(() => disarmDelete(btn), 4000);
    return;
  }
  disarmDelete(btn);
  try {
    const response = await api(`/api/leads/${id}/delete`, { method: 'POST', body: {} });
    const data = await response.json();
    if (data.error) { toast('No se pudo eliminar: ' + data.error, 'err'); return; }
    renderPanelEmpty();
    state.lastListKey = null;
    loadList(false);
    toast('Datos del prospecto eliminados', 'ok');
  } catch (error) {
    toast('No se pudo eliminar', 'err');
  }
}
function disarmDelete(btn) {
  if (!btn) return;
  btn.classList.remove('armed');
  if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
}

/* ── Sincronización ── */
async function syncNow() {
  const btn = $('sync');
  btn.disabled = true;
  btn.classList.add('is-syncing');
  try {
    const response = await api('/api/leads/sync', { method: 'POST', body: {} });
    const data = await response.json();
    if (data.error) toast('Error de sincronización: ' + data.error, 'err');
    else if (data.skipped) toast('Sincronización: ' + data.reason);
    else {
      const nuevo = data.leadsCreated + data.messagesImported;
      toast(nuevo === 0 ? 'Sin novedades' : `${data.leadsCreated} leads · ${data.messagesImported} mensajes`, 'ok');
      loadList(true);
    }
  } catch (error) {
    toast('Error de sincronización: ' + error.message, 'err');
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-syncing');
  }
}

async function loadAutoReply() {
  const response = await api('/api/leads/autoreply');
  const data = await response.json();
  const on = Boolean(data.autoReplyEnabled);
  const dot = $('autoreply-state');
  dot.classList.toggle('on', on);
  $('autoreply-toggle').setAttribute('aria-pressed', String(on));
  $('autoreply-toggle').title = on ? 'Desactivar respuesta automática' : 'Activar respuesta automática';
}

function setSyncPill(h) {
  const dot = $('sync-dot');
  const text = $('sync-text');
  if (!h.autoSync) { dot.className = 'sync-dot'; text.textContent = 'Auto-sync desactivado'; return; }
  if (h.syncRunning) { dot.className = 'sync-dot busy'; text.textContent = 'Sincronizando…'; return; }
  if (h.lastSyncError) { dot.className = 'sync-dot err'; text.textContent = 'Última sync falló: ' + h.lastSyncError; return; }
  if (h.lastSync) {
    dot.className = 'sync-dot ok';
    text.textContent = `Auto-sync cada ${Math.round(h.syncIntervalMs / 1000)}s · ${new Date(h.lastSync).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    dot.className = 'sync-dot';
    text.textContent = 'Auto-sync activo · primera ejecución…';
  }
}

async function loadHealth() {
  try {
    const response = await api('/api/admin/health');
    const h = await response.json();
    const db = h.repository === 'postgres' ? 'Datos conectados' : 'Sesión de prueba';
    const sender = h.sender === 'live' ? 'Mensajería conectada' : 'Mensajería de prueba';
    const ai = h.ai === 'deepseek' ? 'Asistencia inteligente' : 'Clasificación estándar';
    $('foot-status').textContent = `Sistema operativo · ${db} · ${sender} · ${ai}`;
    $('foot-sync').textContent = h.autoSync ? `Sincronización automática activa` : 'Sincronización automática desactivada';
    setSyncPill(h);
  } catch {
    $('foot-status').textContent = 'Sistema sin conexión';
    $('sync-dot').className = 'sync-dot err';
    $('sync-text').textContent = 'Sin conexión con el servidor';
  }
}

/* ── Wiring ── */
$('refresh').addEventListener('click', () => loadList(true));
$('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', body: {} });
  location.replace('/login');
});
$('sync').addEventListener('click', syncNow);
$('autoreply-toggle').addEventListener('click', async () => {
  const current = $('autoreply-state').classList.contains('on');
  await api('/api/leads/autoreply', { method: 'POST', body: { enabled: !current } });
  loadAutoReply();
  toast(current ? 'Respuesta automática desactivada' : 'Respuesta automática activada', 'ok');
});
$('export-csv').addEventListener('click', () => exportFile('export.csv'));
$('export-xlsx').addEventListener('click', () => exportFile('export.xlsx'));

async function exportFile(kind) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(state.filters)) {
    if (value) query.set(key, value);
  }
  const response = await api(`/api/leads/${kind}?${query.toString()}`);
  const blob = await response.blob();
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `leads_agua_renew_${date}.${kind.split('.')[1]}`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast('Exportación iniciada', 'ok');
}

document.addEventListener('click', async (event) => {
  const retryMessage = event.target.closest('[data-retry-message]');
  if (retryMessage) {
    await api(`/api/leads/${retryMessage.dataset.retryLead}/messages/${retryMessage.dataset.retryMessage}/retry`, { method: 'POST', body: {} });
    toast('Mensaje reenviado a la cola', 'ok');
    showDetail(retryMessage.dataset.retryLead);
    return;
  }
  const open = event.target.closest('[data-open]');
  if (open) { event.preventDefault(); await openWhatsApp(open.dataset.open); return; }
  const contact = event.target.closest('[data-contact]');
  if (contact) { await markContacted(contact.dataset.contact); return; }
  const reqWa = event.target.closest('[data-request-whatsapp]');
  if (reqWa) { await requestWhatsapp(reqWa.dataset.requestWhatsapp); return; }
  const detail = event.target.closest('[data-detail]');
  if (detail) { await showDetail(detail.dataset.detail); return; }
  const control = event.target.closest('[data-control]');
  if (control) {
    await api(`/api/leads/${control.dataset.control}/control`, { method: 'POST', body: { controlMode: control.dataset.mode } });
    toast(control.dataset.mode === 'HUMAN' ? 'Control manual tomado' : 'De vuelta a automático', 'ok');
    loadList(); showDetail(control.dataset.control);
    return;
  }
  const close = event.target.closest('[data-close]');
  if (close) { await closeLead(close.dataset.close, close); return; }
  const del = event.target.closest('[data-delete]');
  if (del) { await deleteLead(del.dataset.delete, del); return; }
  const phone = event.target.closest('[data-phone]');
  if (phone) {
    const value = $('phone-edit').value.trim();
    if (!value) return;
    await api(`/api/leads/${phone.dataset.phone}/phone`, { method: 'POST', body: { phone: value } });
    toast('Teléfono guardado', 'ok');
    loadList(); showDetail(phone.dataset.phone);
  }
});

/* Orden compartido entre encabezados de escritorio y control móvil. */
function syncSortUi() {
  document.querySelectorAll('th.sortable').forEach((header) => {
    const active = header.dataset.sort === state.sort.key;
    header.toggleAttribute('aria-sort', active);
    if (active) header.setAttribute('aria-sort', state.sort.dir === 'asc' ? 'ascending' : 'descending');
    header.querySelector('.sort-arrow').textContent = active ? (state.sort.dir === 'asc' ? '↑' : '↓') : '';
  });
  const mobileSort = $('mobile-sort');
  const value = `${state.sort.key}:${state.sort.dir}`;
  if ([...mobileSort.options].some((option) => option.value === value)) mobileSort.value = value;
}

function setSort(key, dir = null) {
  state.sort = dir
    ? { key, dir }
    : (state.sort.key === key
      ? { key, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'createdAt' ? 'desc' : 'asc' });
  resetListView();
  syncSortUi();
  loadList();
}

document.querySelectorAll('th.sortable').forEach((th) => th.addEventListener('click', () => setSort(th.dataset.sort)));
$('mobile-sort').addEventListener('change', (event) => {
  const [key, dir] = event.target.value.split(':');
  setSort(key, dir);
});

const mobileSortMedia = window.matchMedia('(max-width: 700px)');
function syncSortTabStops() {
  document.querySelectorAll('.sort-button').forEach((button) => { button.tabIndex = mobileSortMedia.matches ? -1 : 0; });
}
mobileSortMedia.addEventListener('change', syncSortTabStops);
syncSortTabStops();

$('load-more').addEventListener('click', () => {
  state.visibleCount += listPageSize();
  renderTable(state.currentLeads, false);
});

/* ESC cierra la conversación (sin tocar inputs). */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.body.classList.contains('nav-open')) {
    closeNavigation();
    return;
  }
  const el = $('detail');
  if (!el.dataset.leadId) return;
  const a = document.activeElement;
  if (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) return;
  renderPanelEmpty();
});

/* Onda acuática de hover: nace en el punto de entrada y no sigue al cursor.
   Se limita a puntero preciso y se anima con WAAPI para tocar solo transform/opacity. */
document.addEventListener('pointerover', (event) => {
  const card = event.target.closest?.('.stat:not(.stat-loading)');
  if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  card.querySelector('.water-hover-ripple')?.remove();
  const rect = card.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'water-hover-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.left = `${event.clientX - rect.left}px`;
  ripple.style.top = `${event.clientY - rect.top}px`;
  card.appendChild(ripple);

  const motion = ripple.animate([
    { opacity: 0, transform: 'translate(-50%, -50%) scale(.42)' },
    { opacity: .68, transform: 'translate(-50%, -50%) scale(.58)', offset: .18 },
    { opacity: .22, transform: 'translate(-50%, -50%) scale(1.12)', offset: .72 },
    { opacity: 0, transform: 'translate(-50%, -50%) scale(1.42)' },
  ], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' });
  motion.addEventListener('finish', () => ripple.remove(), { once: true });
  motion.addEventListener('cancel', () => ripple.remove(), { once: true });
}, true);

/* Tooltip compartido: vive fuera del ledger para no crear overflow horizontal.
   Se muestra tanto con puntero como con teclado y nunca reemplaza el aria-label. */
const actionTooltip = $('action-tooltip');
let activeTooltipTarget = null;
function showActionTooltip(target) {
  const text = target?.dataset.tooltip;
  if (!text || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  activeTooltipTarget = target;
  actionTooltip.textContent = text;
  actionTooltip.hidden = false;
  const rect = target.getBoundingClientRect();
  const halfWidth = Math.min(actionTooltip.offsetWidth / 2, 80);
  actionTooltip.style.left = `${Math.min(innerWidth - halfWidth - 8, Math.max(halfWidth + 8, rect.left + rect.width / 2))}px`;
  actionTooltip.style.top = `${Math.max(8, rect.top - 8)}px`;
  target.setAttribute('aria-describedby', 'action-tooltip');
}
function hideActionTooltip(target) {
  if (target && activeTooltipTarget !== target) return;
  activeTooltipTarget?.removeAttribute('aria-describedby');
  activeTooltipTarget = null;
  actionTooltip.hidden = true;
}
document.addEventListener('pointerover', (event) => {
  const target = event.target.closest?.('.has-tooltip');
  if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
  showActionTooltip(target);
});
document.addEventListener('pointerout', (event) => {
  const target = event.target.closest?.('.has-tooltip');
  if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
  hideActionTooltip(target);
});
document.addEventListener('focusin', (event) => showActionTooltip(event.target.closest?.('.has-tooltip')));
document.addEventListener('focusout', (event) => hideActionTooltip(event.target.closest?.('.has-tooltip')));
window.addEventListener('scroll', () => hideActionTooltip(), true);

/* Búsqueda con debounce */
let searchTimer;
$('filter-search').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = event.target.value;
    resetListView();
    loadList();
  }, 200);
});

// Dropdown propio (sustituye a los <select> nativos, que no se pueden tematizar ni animar).
function initDropdowns() {
  const dropdowns = [...document.querySelectorAll('.dropdown[data-filter]')];
  const closeAll = () => dropdowns.forEach((d) => setOpen(d, false));

  function setOpen(dd, open) {
    dd.classList.toggle('open', open);
    dd.querySelector('.dropdown-trigger').setAttribute('aria-expanded', String(open));
    dd.querySelector('.dropdown-menu').hidden = !open;
    if (open) {
      const sel = dd.querySelector('.dropdown-option[aria-selected="true"]') ?? dd.querySelector('.dropdown-option');
      sel?.focus();
    }
  }

  function select(dd, opt) {
    const key = dd.dataset.filter;
    const value = opt.dataset.value;
    state.filters[key] = value;
    resetListView();
    dd.querySelector('.dropdown-label').textContent = opt.textContent;
    dd.querySelectorAll('.dropdown-option').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
    closeAll();
    const trigger = dd.querySelector('.dropdown-trigger');
    trigger.setAttribute('aria-label', `Filtrar por ${FILTER_LABEL[key] ?? key}: ${opt.textContent}`);
    trigger.focus();
    loadList();
  }

  dropdowns.forEach((dd) => {
    const trigger = dd.querySelector('.dropdown-trigger');
    const menu = dd.querySelector('.dropdown-menu');
    const options = [...menu.querySelectorAll('.dropdown-option')];
    // estado inicial
    const current = state.filters[dd.dataset.filter] ?? '';
    const initOpt = options.find((o) => o.dataset.value === current) ?? options[0];
    initOpt?.setAttribute('aria-selected', 'true');
    trigger.setAttribute('aria-label', `Filtrar por ${FILTER_LABEL[dd.dataset.filter] ?? dd.dataset.filter}: ${initOpt?.textContent ?? 'todos'}`);

    trigger.addEventListener('click', () => {
      const wasOpen = dd.classList.contains('open');
      closeAll();
      setOpen(dd, !wasOpen);
    });
    options.forEach((opt) => opt.addEventListener('click', () => select(dd, opt)));
    // teclado
    dd.addEventListener('keydown', (event) => {
      const open = dd.classList.contains('open');
      if (event.key === 'Escape') { closeAll(); trigger.focus(); return; }
      if (!open) return;
      const idx = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); (options[idx + 1] ?? options[0])?.focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); (options[idx - 1] ?? options[options.length - 1])?.focus(); }
      else if (event.key === 'Home') { event.preventDefault(); options[0]?.focus(); }
      else if (event.key === 'End') { event.preventDefault(); options[options.length - 1]?.focus(); }
    });
  });

  // cerrar al hacer click fuera
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown')) closeAll();
  });
}

initDropdowns();

const menuToggle = $('menu-toggle');
const sidebarScrim = $('sidebar-scrim');
function setNavigation(open) {
  document.body.classList.toggle('nav-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  sidebarScrim.setAttribute('aria-hidden', String(!open));
}
function closeNavigation() { setNavigation(false); }
menuToggle.addEventListener('click', () => setNavigation(!document.body.classList.contains('nav-open')));
sidebarScrim.addEventListener('click', closeNavigation);
document.querySelectorAll('.sidebar-nav a').forEach((link) => link.addEventListener('click', closeNavigation));

renderLoadingState();
renderPanelEmpty();
loadList(true);
loadAutoReply().catch(() => {});
loadHealth();
setInterval(() => loadList(false), 15_000);
setInterval(loadHealth, 30_000);
