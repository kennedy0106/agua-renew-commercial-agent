import { LegacyButton, LegacyInput, LegacyTextarea } from "./controls.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, queryString } from "../api.js";
import { Icon } from "../icons.jsx";
import { Drawer } from "./Drawer.jsx";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import {
  FileText,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";

function CommunicationSelect({ label, value, options, onValueChange, disabled = false }) {
  return (
    <div className="renew-communication-select">
      <span>{label}</span>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent
          position="popper"
          side="bottom"
          align="start"
          sideOffset={8}
          avoidCollisions={false}
          className="renew-communication-select-menu"
        >
          <SelectGroup>
            {options.map(([optionValue, optionLabel]) => (
              <SelectItem value={optionValue} key={optionValue || "empty"}>{optionLabel}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

const channelLabel = {
  EMAIL: "Correo",
  WHATSAPP: "WhatsApp",
  INTERNAL: "Interno",
};
const statusLabel = {
  DRAFT: "Borrador",
  READY: "Preparado",
  HANDED_OFF: "Entregado al canal",
  SENT: "Enviado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

function channelIcon(channel) {
  if (channel === "EMAIL") return "mail";
  if (channel === "WHATSAPP") return "whatsapp";
  return "message";
}

function formatLimaDate(value) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export function Communications({ user, notify, onError }) {
  const [templates, setTemplates] = useState({ items: [] });
  const [messages, setMessages] = useState({ items: [], total: 0 });
  const [composer, setComposer] = useState(false);
  const [templateForm, setTemplateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [page, setPage] = useState(1);
  const loadRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError("");
    try {
      const [t, m] = await Promise.all([
        api("/api/crm/v1/communication-templates"),
        api(`/api/crm/v1/communications?${queryString({ page, pageSize: 25 })}`),
      ]);
      if (request !== loadRequest.current) return;
      setTemplates(t);
      setMessages(m);
    } catch (error) {
      if (request !== loadRequest.current) return;
      setLoadError(error.message || "No pudimos cargar las comunicaciones.");
      onError(error);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [page, onError]);
  useEffect(() => {
    load();
  }, [load]);
  async function mutate(work, message) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await work();
      notify(message);
      setComposer(false);
      setTemplateForm(false);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setActionBusy(false);
    }
  }
  return (
    <>
      <div className="renew-communications-page">
        <PageHeader
          title="Comunicaciones"
          description="Prepare mensajes trazables y continúe el contacto en el canal autorizado."
          actions={
            <div className="renew-communications-actions">
            {user.role !== "ADVISOR" ? (
              <LegacyButton
                className="button secondary"
                onClick={() => setTemplateForm(true)}
                disabled={actionBusy}
              >
                <FileText aria-hidden="true" /> Nueva plantilla
              </LegacyButton>
            ) : null}
            <LegacyButton
              className="button primary"
              onClick={() => setComposer(true)}
              disabled={actionBusy}
            >
              <Plus aria-hidden="true" /> Crear borrador
            </LegacyButton>
            </div>
          }
        />
        <section className="communication-summary" aria-label="Protecciones de comunicación">
          <header>
            <span><ShieldCheck aria-hidden="true" /></span>
            <div><h2>Preparación segura</h2><p>El CRM registra y prepara; el envío siempre ocurre fuera.</p></div>
          </header>
          <article>
          <LockKeyhole aria-hidden="true" />
          <span>
            <strong>Meta permanece protegido</strong>
            <small>Solo lectura; ningún endpoint envía mensajes.</small>
          </span>
        </article>
        <article>
          <Send aria-hidden="true" />
          <span>
            <strong>Handoff controlado</strong>
            <small>El asesor revisa y abre el canal externo.</small>
          </span>
        </article>
        <article>
          <MessageSquareText aria-hidden="true" />
          <span>
            <strong>Historial auditable</strong>
            <small>Cada borrador conserva autor, versión y estado.</small>
          </span>
        </article>
      </section>
      <section className="communication-layout">
        <article className="surface template-rail">
          <header>
            <div><h2>Plantillas</h2><p>Seleccione una base para preparar el mensaje.</p></div>
            <span>{templates.total ?? templates.items.length}</span>
          </header>
          {loading && !templates.items.length ? <DataState kind="loading" title="Cargando plantillas" /> : null}
          {loadError ? <DataState kind="error" title="No se pudieron cargar las plantillas" description={loadError} onAction={load} /> : null}
          {templates.items.map((template) => (
            <LegacyButton key={template.id} onClick={() => setComposer(template)} disabled={actionBusy}>
              <span
                className={`channel-mark ${template.channel.toLowerCase()}`}
              >
                <Icon name={channelIcon(template.channel)} />
              </span>
              <span>
                <strong>{template.name}</strong>
                <small>{channelLabel[template.channel]}</small>
              </span>
            </LegacyButton>
          ))}
          {!loading && !loadError && !templates.items.length ? (
            <p className="muted">Aún no hay plantillas.</p>
          ) : null}
        </article>
        <section className="surface communication-ledger">
          <header>
            <div>
              <h2>Historial de preparación</h2>
              <p>{messages.total} comunicaciones registradas · página {page}.</p>
            </div>
          </header>
          {loading && !messages.items.length ? <DataState kind="loading" title="Cargando historial" /> : null}
          {loadError ? <DataState kind="error" title="No se pudo cargar el historial" description={loadError} onAction={load} /> : null}
          {messages.items.map((message) => {
            const summary = message.subject || message.body.slice(0, 60);
            return (
              <article key={message.id}>
                <span
                  className={`channel-mark ${message.channel.toLowerCase()}`}
                >
                  <Icon name={channelIcon(message.channel)} />
                </span>
                <span>
                  <strong title={summary}>{summary}</strong>
                  <small>
                    {message.contact_name ||
                      message.recipient ||
                      "Sin destinatario vinculado"}{" "}
                    · {formatLimaDate(message.created_at)}
                  </small>
                </span>
                <span
                  className={`status-chip status-${message.status.toLowerCase()}`}
                >
                  {statusLabel[message.status]}
                </span>
                {message.status === "DRAFT" ? (
                  <LegacyButton
                    className="button secondary compact"
                    disabled={actionBusy || (message.channel !== "INTERNAL" && !message.recipient)}
                    title={message.channel !== "INTERNAL" && !message.recipient ? "Añada un destinatario antes de preparar la salida" : undefined}
                    onClick={() =>
                      mutate(
                        () =>
                          api(
                            `/api/crm/v1/communications/${message.id}/handoff`,
                            {
                              method: "POST",
                              body: { version: message.version },
                            },
                          ),
                        "Borrador entregado al canal manual",
                      )
                    }
                  >
                    Preparar salida
                  </LegacyButton>
                ) : message.status === "HANDED_OFF" && message.recipient && message.channel !== "INTERNAL" ? (
                  <a
                    className="button secondary compact"
                    target="_blank"
                    rel="noreferrer"
                    href={channelUrl(message)}
                  >
                    Abrir canal
                  </a>
                ) : null}
              </article>
            );
          })}
          {!loading && !loadError && !messages.items.length ? (
            <div className="empty-state renew-communication-empty">
              <span><Sparkles aria-hidden="true" /></span>
              <strong>Sin borradores</strong>
              <p>Prepare el primer mensaje desde una plantilla o comience desde cero.</p>
              <small><ShieldCheck aria-hidden="true" /> Nada se enviará sin intervención humana.</small>
            </div>
          ) : null}
          <CommunicationPagination data={messages} page={page} onPageChange={setPage} />
        </section>
      </section>
      </div>
      {composer ? (
        <Composer
          seed={composer === true ? null : composer}
          templates={templates.items}
          busy={actionBusy}
          onClose={() => setComposer(false)}
          onSave={(form) =>
            mutate(
              () =>
                api("/api/crm/v1/communications", {
                  method: "POST",
                  body: form,
                }),
              "Borrador guardado",
            )
          }
        />
      ) : null}
      {templateForm ? (
        <TemplateDrawer
          busy={actionBusy}
          onClose={() => setTemplateForm(false)}
          onSave={(form) =>
            mutate(
              () =>
                api("/api/crm/v1/communication-templates", {
                  method: "POST",
                  body: form,
                }),
              "Plantilla creada",
            )
          }
        />
      ) : null}
    </>
  );
}

function channelUrl(message) {
  if (message.channel === "EMAIL")
    return `mailto:${encodeURIComponent(message.recipient)}?subject=${encodeURIComponent(message.subject ?? "")}&body=${encodeURIComponent(message.body)}`;
  if (message.channel === "WHATSAPP")
    return `https://wa.me/${String(message.recipient).replace(/\D/g, "")}?text=${encodeURIComponent(message.body)}`;
  return undefined;
}

function Composer({ seed, templates, busy, onClose, onSave }) {
  const [form, setForm] = useState({
    channel: seed?.channel ?? "WHATSAPP",
    recipient: "",
    subject: seed?.subject ?? "",
    body: seed?.body ?? "",
    templateId: seed?.id ?? "",
  });
  function choose(id) {
    const template = templates.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      templateId: id,
      channel: template?.channel ?? current.channel,
      subject: template?.subject ?? "",
      body: template?.body ?? "",
    }));
  }
  return (
    <Drawer label="preparar comunicación" onClose={onClose} className="communication-drawer">
      <header>
        <div>
          <h2>Preparar comunicación</h2>
          <p>Se guardará como borrador; no se enviará automáticamente.</p>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar borrador"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const recipient = event.currentTarget.elements.recipient;
          if (form.channel === "WHATSAPP") {
            const digits = form.recipient.replace(/\D/g, "");
            recipient.setCustomValidity(digits.length >= 8 && digits.length <= 15 ? "" : "Ingrese un teléfono de WhatsApp válido (8 a 15 dígitos).");
            if (!event.currentTarget.reportValidity()) return;
          }
          onSave(form);
        }}
      >
        <CommunicationSelect label="Plantilla" value={form.templateId || "__empty"} onValueChange={(value) => choose(value === "__empty" ? "" : value)} disabled={busy} options={[["__empty", "Desde cero"], ...templates.map((template) => [template.id, template.name])]} />
        <CommunicationSelect label="Canal" value={form.channel} onValueChange={(value) => setForm({ ...form, channel: value })} disabled={busy} options={[["WHATSAPP", "WhatsApp"], ["EMAIL", "Correo"]]} />
        <label>
          <span>
            Destinatario{" "}
            <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyInput
            name="recipient"
            value={form.recipient}
            required
            inputMode={form.channel === "WHATSAPP" ? "tel" : "email"}
            onChange={(event) => {
              event.target.setCustomValidity("");
              setForm({ ...form, recipient: event.target.value });
            }}
            placeholder={
              form.channel === "EMAIL" ? "cliente@empresa.com" : "+51…"
            }
          />
        </label>
        {form.channel === "EMAIL" ? (
          <label>
            Asunto
            <LegacyInput
              value={form.subject}
              onChange={(event) =>
                setForm({ ...form, subject: event.target.value })
              }
            />
          </label>
        ) : null}
        <label>
          <span>
            Contenido <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyTextarea
            rows="9"
            required
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </label>
        <div className="observer-note">
          <Icon name="shield" />
          <span>
            Guardar crea un registro interno. “Preparar salida” solo marca el
            handoff; el envío ocurre fuera del CRM.
          </span>
        </div>
        <LegacyButton className="button primary" disabled={busy}>{busy ? "Guardando…" : "Guardar borrador"}</LegacyButton>
      </form>
    </Drawer>
  );
}
function TemplateDrawer({ busy, onClose, onSave }) {
  const [form, setForm] = useState({
    name: "",
    channel: "WHATSAPP",
    subject: "",
    body: "",
  });
  return (
    <Drawer label="nueva plantilla" onClose={onClose} className="communication-drawer">
      <header>
        <div>
          <h2>Nueva plantilla</h2>
          <p>
            Use variables como texto guía; no se sustituyen automáticamente.
          </p>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar plantilla"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <label>
          <span>
            Nombre <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyInput
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <CommunicationSelect label="Canal" value={form.channel} onValueChange={(value) => setForm({ ...form, channel: value })} disabled={busy} options={[["WHATSAPP", "WhatsApp"], ["EMAIL", "Correo"]]} />
        {form.channel === "EMAIL" ? (
          <label>
            Asunto
            <LegacyInput
              value={form.subject}
              onChange={(event) =>
                setForm({ ...form, subject: event.target.value })
              }
            />
          </label>
        ) : null}
        <label>
          <span>
            Contenido <small className="required-mark">Obligatorio</small>
          </span>
          <LegacyTextarea
            rows="9"
            required
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </label>
        <LegacyButton className="button primary" disabled={busy}>{busy ? "Creando…" : "Crear plantilla"}</LegacyButton>
      </form>
    </Drawer>
  );
}

function CommunicationPagination({ data, page, onPageChange }) {
  const pageSize = Number(data.pageSize || 25);
  const totalPages = Math.max(1, Math.ceil(Number(data.total || 0) / pageSize));
  if (totalPages <= 1) return null;
  return (
    <nav className="renew-communication-pagination" aria-label="Paginación de comunicaciones">
      <span>{data.total} registros</span>
      <div>
        <LegacyButton className="button secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</LegacyButton>
        <span>Página {page} de {totalPages}</span>
        <LegacyButton className="button secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente</LegacyButton>
      </div>
    </nav>
  );
}
