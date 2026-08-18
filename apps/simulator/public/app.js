const conversation = document.querySelector('#conversation');
const form = document.querySelector('#composer');
const input = document.querySelector('#message-input');
const sendButton = form.querySelector('button[type="submit"]');
const restart = document.querySelector('#restart');
const newConversation = document.querySelector('#new-conversation');
const status = document.querySelector('#conversation-status');
const modeLabel = document.querySelector('#mode-label');
const modeDetail = document.querySelector('#mode-detail');

let sessionId;
let latestState;
let isSending = false;

function stableCustomerId() {
  const key = 'agua-renew-simulator-customer-id';
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

function setStatus(state) {
  const labels = {
    choose_family: 'Selecciona una presentación',
    choose_modality: 'Selecciona una modalidad comercial',
    choose_product: 'Selecciona una presentación exacta',
    await_quantity: 'Esperando cantidad',
    await_purchase_type: 'Selecciona el tipo de pedido',
    await_fulfillment: 'Selecciona el tipo de recojo',
    await_fulfillment_confirmation: 'Confirma o cambia el recojo',
    complete: 'Consulta comercial completada',
    handoff: 'Atención humana requerida',
  };
  status.textContent = state.mode === 'ai'
    ? 'Asistente comercial disponible'
    : (labels[state.stage] ?? 'Conversación activa');
  input.disabled = state.mode !== 'ai' && !['await_quantity'].includes(state.stage);
  input.placeholder = state.stage === 'await_quantity'
    ? 'Escribe la cantidad…'
    : state.mode === 'ai'
      ? 'Escribe tu consulta con libertad…'
      : 'Usa los botones disponibles';
}

function renderMessageText(container, content) {
  const blocks = String(content).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    let paragraphLines = [];
    let productDetail = null;
    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      const paragraph = document.createElement('p');
      paragraphLines.forEach((line, index) => {
        if (index > 0) paragraph.append(document.createElement('br'));
        paragraph.append(document.createTextNode(line));
      });
      container.append(paragraph);
      paragraphLines = [];
    };
    for (const line of lines) {
      if (/^•\s+/.test(line)) {
        flushParagraph();
        productDetail = document.createElement('section');
        productDetail.className = 'product-detail';
        const title = document.createElement('strong');
        title.textContent = line.replace(/^•\s+/, '');
        productDetail.append(title);
        container.append(productDetail);
      } else if (/^\s+/.test(line) && productDetail) {
        const detail = document.createElement('p');
        detail.textContent = line.trim();
        productDetail.append(detail);
      } else {
        productDetail = null;
        paragraphLines.push(line);
      }
    }
    flushParagraph();
  }
}

function render(snapshot) {
  latestState = snapshot.state;
  conversation.replaceChildren();
  for (const message of snapshot.messages) {
    const article = document.createElement('article');
    article.className = `message ${message.role} ${message.kind}`;
    const role = document.createElement('span');
    role.className = 'message-role';
    role.textContent = message.role === 'bot' ? 'Agua ReNew' : 'Tú';
    const content = document.createElement('div');
    content.className = 'message-content';
    renderMessageText(content, message.text);
    article.append(role, content);
    if (message.options?.length) {
      const options = document.createElement('div');
      options.className = 'options';
      for (const option of message.options) {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'option-button';
        optionButton.textContent = option.label;
        optionButton.addEventListener('click', () => sendEvent(option.event));
        options.append(optionButton);
      }
      article.append(options);
    }
    conversation.append(article);
  }
  setStatus(snapshot.state);
  if (modeLabel) modeLabel.textContent = snapshot.state.mode === 'ai' ? 'Modo DeepSeek IA' : 'Modo determinístico';
  if (modeDetail) modeDetail.textContent = snapshot.state.mode === 'ai'
    ? 'Texto libre · Sugerencias opcionales'
    : 'Sin IA · Sin WhatsApp · Sin n8n';
  conversation.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function appendOptimisticUser(text) {
  const article = document.createElement('article');
  article.className = 'message user message';
  const role = document.createElement('span');
  role.className = 'message-role';
  role.textContent = 'Tú';
  const content = document.createElement('p');
  content.textContent = text;
  article.append(role, content);
  conversation.append(article);
  article.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function showTypingIndicator() {
  const article = document.createElement('article');
  article.className = 'message bot typing';
  article.id = 'typing-indicator';
  article.setAttribute('aria-label', 'Agua ReNew está escribiendo');
  const role = document.createElement('span');
  role.className = 'message-role';
  role.textContent = 'Agua ReNew';
  const dots = document.createElement('span');
  dots.className = 'typing-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.innerHTML = '<i></i><i></i><i></i>';
  const label = document.createElement('p');
  label.textContent = 'Agua ReNew está escribiendo…';
  article.append(role, dots, label);
  conversation.append(article);
  article.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function removeTypingIndicator() {
  document.querySelector('#typing-indicator')?.remove();
}

async function sendEvent(event, { optimisticText = null } = {}) {
  if (!sessionId || isSending) return;
  isSending = true;
  sendButton.disabled = true;
  if (optimisticText) appendOptimisticUser(optimisticText);
  showTypingIndicator();
  try {
    status.textContent = 'Consultando el servicio comercial…';
    const response = await fetch(`/api/conversations/${sessionId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!response.ok) throw new Error('No se pudo procesar el evento');
    render(await response.json());
  } catch (error) {
    removeTypingIndicator();
    status.textContent = error.message;
  } finally {
    isSending = false;
    sendButton.disabled = false;
  }
}

async function startConversation({ newTestConversation = false } = {}) {
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerExternalId: stableCustomerId(),
      newConversation: newTestConversation,
      mode: 'ai',
    }),
  });
  if (!response.ok) throw new Error('No se pudo iniciar el simulador');
  const payload = await response.json();
  sessionId = payload.id;
  render(payload);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  sendEvent({
    type: latestState?.mode === 'ai' || latestState?.stage !== 'await_quantity'
      ? 'submit_text'
      : 'submit_quantity',
    value,
  }, { optimisticText: value });
});

restart.addEventListener('click', () => sendEvent({ type: 'restart' }));
newConversation.addEventListener('click', () => startConversation({ newTestConversation: true }));
startConversation().catch((error) => {
  status.textContent = error.message;
});
