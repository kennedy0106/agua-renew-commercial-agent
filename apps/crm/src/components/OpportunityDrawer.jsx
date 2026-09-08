import { LegacyButton, LegacyInput, LegacyTextarea } from "./controls.jsx";
import { useMemo, useState } from "react";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileText, Image, MessageCircleMore, Plus, SlidersHorizontal } from "lucide-react";
import { Icon } from "../icons.jsx";
import { nextTabValue } from "../tab-navigation.js";
import { Drawer } from "./Drawer.jsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.jsx";

const PRODUCT_OPTIONS = [
  ["maquila_bidon_20l", "Bidón recargable 20 L · Maquila"],
  ["maquila_botella_1l_fliptop", "Botella 1 L · Maquila"],
  ["maquila_botella_625ml_rosca", "Botella 625 ml · Maquila"],
  ["maquila_galonera_10_5l", "Galonera 10.5 L · Maquila"],
  ["distribution_bidon_20l", "Recarga 20 L · Distribución"],
  ["distribution_bidon_20l_new", "Bidón nuevo 20 L · Distribución"],
  ["distribution_botella_1l_fliptop", "Botella 1 L · Distribución"],
  ["distribution_botella_625ml_rosca", "Botella 625 ml · Distribución"],
  ["distribution_galonera_10_5l", "Galonera 10.5 L · Distribución"],
  ["final_customer_bidon_20l_refill", "Recarga 20 L · Consumo"],
  ["final_customer_bidon_20l_new", "Bidón completo 20 L · Consumo"],
];
const DRAWER_TABS = [
  ["conversation", "Conversación", MessageCircleMore],
  ["management", "Gestión", SlidersHorizontal],
  ["quotes", "Cotizaciones", FileText],
];

function DrawerSelect({ label, ariaLabel = label, value, onValueChange, options, disabled }) {
  return (
    <div className="opportunity-drawer-select">
      {label ? <span>{label}</span> : null}
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger aria-label={ariaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          position="popper"
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="renew-opportunity-select-menu"
        >
          <SelectGroup>
            {options.map(([optionValue, optionLabel]) => (
              <SelectItem value={optionValue} key={optionValue || "empty"}>
                {optionLabel}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function DateTimePicker({ value, onChange, label = "Fecha de seguimiento", includeTime = true }) {
  const selected = value ? new Date(includeTime ? value : `${value}T12:00`) : null;
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const base = selected && !Number.isNaN(selected.getTime()) ? selected : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - offset + 1;
      return day > 0 && day <= count ? new Date(year, month, day) : null;
    });
  }, [visibleMonth]);
  const time = value?.split("T")[1]?.slice(0, 5) || "09:00";
  const datePartFor = (date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const selectedKey = selected && !Number.isNaN(selected.getTime()) ? datePartFor(selected) : "";
  const today = new Date();
  const selectedInMonth = selected && selected.getFullYear() === visibleMonth.getFullYear() && selected.getMonth() === visibleMonth.getMonth();
  const todayInMonth = today.getFullYear() === visibleMonth.getFullYear() && today.getMonth() === visibleMonth.getMonth();
  const focusKey = selectedInMonth ? selectedKey : todayInMonth ? datePartFor(today) : datePartFor(days.find(Boolean));
  const focusCalendarDate = (target) => {
    const targetKey = datePartFor(target);
    if (target.getFullYear() !== visibleMonth.getFullYear() || target.getMonth() !== visibleMonth.getMonth()) {
      setVisibleMonth(new Date(target.getFullYear(), target.getMonth(), 1));
    }
    window.setTimeout(() => document.querySelector(`.opportunity-calendar-grid [data-date="${targetKey}"]`)?.focus(), 0);
  };
  const handleCalendarKeyDown = (event, date) => {
    let target = null;
    if (event.key === "ArrowLeft") target = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
    if (event.key === "ArrowRight") target = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    if (event.key === "ArrowUp") target = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7);
    if (event.key === "ArrowDown") target = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
    if (event.key === "Home") target = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
    if (event.key === "End") target = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (6 - ((date.getDay() + 6) % 7)));
    if (event.key === "PageUp") target = new Date(date.getFullYear(), date.getMonth() - 1, Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth(), 0).getDate()));
    if (event.key === "PageDown") target = new Date(date.getFullYear(), date.getMonth() + 1, Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth() + 2, 0).getDate()));
    if (!target) return;
    event.preventDefault();
    focusCalendarDate(target);
  };
  const updateTime = (nextTime) => {
    const datePart = value?.split("T")[0] || datePartFor(new Date());
    onChange(`${datePart}T${nextTime}`);
  };
  const chooseDate = (date) => {
    onChange(includeTime ? `${datePartFor(date)}T${time}` : datePartFor(date));
  };
  const displayValue = selected && !Number.isNaN(selected.getTime())
    ? selected.toLocaleString("es-PE", includeTime
      ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "long", year: "numeric" })
    : includeTime ? "Seleccionar fecha y hora" : "Seleccionar fecha";
  return (
    <div className="opportunity-date-field">
      <span>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="opportunity-date-trigger" aria-label={`Elegir ${label.toLowerCase()}`}>
            <CalendarDays aria-hidden="true" />
            <span>{displayValue}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" side="left" sideOffset={10} collisionPadding={12} className="opportunity-calendar-popover" onOpenAutoFocus={(event) => { event.preventDefault(); window.setTimeout(() => document.querySelector(`.opportunity-calendar-grid [data-date="${focusKey}"]`)?.focus(), 0); }}>
          <div className="opportunity-calendar-header">
            <Button type="button" variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft aria-hidden="true" /></Button>
            <strong>{visibleMonth.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</strong>
            <Button type="button" variant="ghost" size="icon" aria-label="Mes siguiente" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight aria-hidden="true" /></Button>
          </div>
          <div className="opportunity-calendar-week" aria-hidden="true">{["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="opportunity-calendar-grid" role="grid" aria-label={`Calendario de ${visibleMonth.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}`}>
            {Array.from({ length: 6 }, (_, week) => (
              <div role="row" key={`week-${week}`}>
                {days.slice(week * 7, week * 7 + 7).map((date, index) => date ? (
                  <Button
                    type="button"
                    variant="ghost"
                    key={date.toISOString()}
                    data-date={datePartFor(date)}
                    className={selectedKey === datePartFor(date) ? "is-selected" : ""}
                    aria-label={date.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
                    aria-selected={selectedKey === datePartFor(date)}
                    role="gridcell"
                    tabIndex={focusKey === datePartFor(date) ? 0 : -1}
                    onKeyDown={(event) => handleCalendarKeyDown(event, date)}
                    onClick={() => chooseDate(date)}
                  >
                    {date.getDate()}
                  </Button>
                ) : <span role="gridcell" aria-hidden="true" key={`empty-${week}-${index}`} />)}
              </div>
            ))}
          </div>
          {includeTime ? (
            <div className="opportunity-time-field">
              <Clock3 aria-hidden="true" />
              <span>Hora</span>
              <input
                type="time"
                aria-label="Hora de seguimiento"
                value={time}
                onInput={(event) => updateTime(event.currentTarget.value)}
                onChange={(event) => updateTime(event.currentTarget.value)}
              />
            </div>
          ) : null}
          <div className="opportunity-calendar-actions">
            <Button type="button" variant="ghost" disabled={!value} onClick={() => onChange("")}>Limpiar</Button>
            <Button type="button" onClick={() => setOpen(false)}>Listo</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function OpportunityDrawer({
  detail,
  stages,
  users,
  onClose,
  onMoveStage,
  onSave,
  onCreateTask,
  onCompleteTask,
  onAddNote,
  onCreateQuote,
  busy,
}) {
  const [tab, setTab] = useState("conversation");
  const [tabInput, setTabInput] = useState("pointer");
  if (!detail) return null;
  const item = detail.opportunity;
  function moveTab(event, current) {
    const next = nextTabValue(DRAWER_TABS, current, event.key);
    if (!next) return;
    event.preventDefault();
    setTabInput("keyboard");
    setTab(next);
    requestAnimationFrame(() =>
      document.getElementById(`opportunity-drawer-tab-${next}`)?.focus(),
    );
  }
  return (
    <Drawer
      label={`Oportunidad de ${item.contactName}`}
      onClose={onClose}
      className="opportunity-drawer"
    >
      <header className="drawer-header">
        <div className="drawer-person">
          <span>{item.contactName.slice(0, 1)}</span>
          <div>
            <h2>{item.contactName}</h2>
            <p>{item.title}</p>
          </div>
        </div>
        <LegacyButton
          className="icon-button quiet"
          onClick={onClose}
          aria-label="Cerrar oportunidad"
        >
          <Icon name="close" />
        </LegacyButton>
      </header>
      <div className="drawer-stage">
        <span
          className="stage-chip"
          style={{ "--stage-color": item.stageColor }}
        >
          {item.stageName}
        </span>
        <DrawerSelect
          ariaLabel="Cambiar etapa"
          value={item.stageKey}
          onValueChange={onMoveStage}
          disabled={busy}
          options={stages.map((stage) => [stage.key, stage.name])}
        />
      </div>
      <nav
        className={`drawer-tabs ${tabInput === "keyboard" ? "is-keyboard-navigation" : ""}`}
        role="tablist"
        aria-label="Secciones"
      >
        {DRAWER_TABS.map(([value, label, TabIcon]) => (
          <LegacyButton
            id={`opportunity-drawer-tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`opportunity-drawer-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? "active" : ""}
            onClick={(event) => {
              setTabInput(event.detail === 0 ? "keyboard" : "pointer");
              setTab(value);
            }}
            onKeyDown={(event) => moveTab(event, value)}
            key={value}
          >
            <TabIcon aria-hidden="true" />
            {label}
          </LegacyButton>
        ))}
      </nav>
      <div className="drawer-content">
        {tab === "conversation" ? (
          <div
            id="opportunity-drawer-panel-conversation"
            role="tabpanel"
            aria-labelledby="opportunity-drawer-tab-conversation"
          >
            <Conversation messages={detail.messages} />
          </div>
        ) : null}
        {tab === "management" ? (
          <div
            id="opportunity-drawer-panel-management"
            role="tabpanel"
            aria-labelledby="opportunity-drawer-tab-management"
          >
            <Management
              detail={detail}
              users={users}
              onSave={onSave}
              onCreateTask={onCreateTask}
              onCompleteTask={onCompleteTask}
              onAddNote={onAddNote}
              busy={busy}
            />
          </div>
        ) : null}
        {tab === "quotes" ? (
          <div
            id="opportunity-drawer-panel-quotes"
            role="tabpanel"
            aria-labelledby="opportunity-drawer-tab-quotes"
          >
            <Quotes detail={detail} onCreateQuote={onCreateQuote} busy={busy} />
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

function Conversation({ messages }) {
  const time = (message) => new Date(
    message.sourceCreatedAt ?? message.createdAt,
  ).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="conversation-panel">
      {messages.length ? (
        messages.map((message) => message.messageKind === "event" ? (
          <article className={`conversation-event is-${message.eventKind}`} key={message.id} role="note">
            <span className="conversation-event-icon" aria-hidden="true"><Activity /></span>
            <span className="conversation-event-copy">
              <strong>{message.eventTitle || "Actividad de Meta"}</strong>
              <small>{time(message)}{message.duplicateCount > 1 ? ` · ${message.duplicateCount} eventos agrupados` : ""}</small>
            </span>
            {message.eventLink ? (
              <a href={message.eventLink} target="_blank" rel="noreferrer" aria-label="Abrir publicación de Meta">
                Ver publicación <ExternalLink aria-hidden="true" />
              </a>
            ) : null}
          </article>
        ) : (
          <article className={`message ${message.direction} ${message.messageKind === "media" ? "is-media" : ""}`} key={message.id}>
            <div className="message-bubble">
              <span className="message-author">{message.actorLabel || (message.direction === "outbound" ? "Agua ReNew" : "Prospecto")}</span>
              {message.messageKind === "media" ? <span className="message-media"><Image aria-hidden="true" />{message.displayContent || "Contenido multimedia compartido"}</span> : (message.displayContent || String(message.content ?? "").replace(/�+/g, "").trim())}
              {message.duplicateCount > 1 ? <span className="message-duplicate">×{message.duplicateCount}</span> : null}
              <small>{time(message)}</small>
            </div>
          </article>
        ))
      ) : (
        <div className="empty-state">
          <Icon name="message" />
          <strong>Sin mensajes registrados</strong>
        </div>
      )}
      <div className="observer-note">
        <Icon name="whatsapp" />
        <span>
          La conversación es de solo lectura. Continúe el contacto en WhatsApp
          desde el canal autorizado.
        </span>
      </div>
    </div>
  );
}

function Management({
  detail,
  users,
  onSave,
  onCreateTask,
  onCompleteTask,
  onAddNote,
  busy,
}) {
  const item = detail.opportunity;
  const [ownerId, setOwnerId] = useState(item.ownerId ?? "");
  const [nextAction, setNextAction] = useState(item.nextAction ?? "");
  const [nextActionAt, setNextActionAt] = useState(
    item.nextActionAt ? item.nextActionAt.slice(0, 16) : "",
  );
  const [value, setValue] = useState(item.estimatedValue ?? "");
  const [taskTitle, setTaskTitle] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="management-stack">
      <section className="drawer-section">
        <h3>Ficha comercial</h3>
        <div className="field-grid">
          <DrawerSelect
            label="Responsable"
            value={ownerId || "__unassigned"}
            onValueChange={(next) => setOwnerId(next === "__unassigned" ? "" : next)}
            options={[["__unassigned", "Sin asignar"], ...users.map((user) => [user.id, user.displayName])]}
          />
          <label>
            Valor estimado
            <LegacyInput
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <label className="span-2">
            Próxima acción
            <LegacyInput
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="Ej. Confirmar cantidad y envío"
            />
          </label>
          <div className="span-2">
            <DateTimePicker value={nextActionAt} onChange={setNextActionAt} />
          </div>
        </div>
        <LegacyButton
          className="button primary"
          disabled={busy}
          onClick={() =>
            onSave({
              ownerId,
              estimatedValue: value,
              nextAction,
              nextActionAt: nextActionAt
                ? new Date(nextActionAt).toISOString()
                : null,
            })
          }
        >
          Guardar cambios
        </LegacyButton>
      </section>
      <section className="drawer-section">
        <h3>Tareas</h3>
        <div className="quick-create">
          <LegacyInput
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="Nueva tarea"
          />
          <LegacyButton
            className="button secondary"
            disabled={!taskTitle.trim() || busy}
            onClick={() => {
              onCreateTask({ title: taskTitle });
              setTaskTitle("");
            }}
          >
            <Icon name="plus" /> Crear
          </LegacyButton>
        </div>
        <div className="task-list">
          {detail.tasks.map((task) => (
            <div
              className={task.status === "DONE" ? "task done" : "task"}
              key={task.id}
            >
              <LegacyButton
                disabled={task.status !== "OPEN" || busy}
                onClick={() => onCompleteTask(task.id, task.version)}
                aria-label="Completar tarea"
              >
                <Icon name="check" />
              </LegacyButton>
              <span>
                <strong>{task.title}</strong>
                <small>
                  {task.assignee_name ?? "Sin asignar"}
                  {task.due_at
                    ? ` · ${new Date(task.due_at).toLocaleString("es-PE")}`
                    : ""}
                </small>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="drawer-section">
        <h3>Notas internas</h3>
        <LegacyTextarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Registre contexto útil para el equipo"
          rows="3"
        />
        <LegacyButton
          className="button secondary"
          disabled={!note.trim() || busy}
          onClick={() => {
            onAddNote(note);
            setNote("");
          }}
        >
          <Icon name="note" /> Añadir nota
        </LegacyButton>
        {detail.notes.map((entry) => (
          <article className="note" key={entry.id}>
            <p>{entry.body}</p>
            <small>
              {entry.author_name ?? "Equipo"} ·{" "}
              {new Date(entry.created_at).toLocaleString("es-PE")}
            </small>
          </article>
        ))}
      </section>
    </div>
  );
}

function Quotes({ detail, onCreateQuote, busy }) {
  const blank = () => ({
    productId: "maquila_botella_625ml_rosca",
    quantity: 20,
    discountPercent: 0,
    purchaseType: "",
  });
  const [items, setItems] = useState([blank()]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(
    "Pago y entrega por coordinar con el asesor.",
  );
  const update = (index, patch) =>
    setItems((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    );
  return (
    <div className="management-stack">
      <section className="drawer-section">
        <div className="section-heading">
          <div>
            <h3>Nueva cotización</h3>
            <p className="section-copy">
              Combine productos; cada precio se valida contra la regla comercial
              vigente.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="add-quote-product"
            onClick={() => setItems((current) => [...current, blank()])}
          >
            <Plus aria-hidden="true" /> Añadir producto
          </Button>
        </div>
        <div className="quote-builder">
          {items.map((item, index) => (
            <article key={index}>
              <DrawerSelect
                label="Producto"
                ariaLabel={`Producto ${index + 1}`}
                value={item.productId}
                onValueChange={(productId) => update(index, { productId, purchaseType: "" })}
                options={PRODUCT_OPTIONS}
              />
              <div className="quote-line-fields">
                <label>
                  Cantidad
                  <LegacyInput
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) =>
                      update(index, { quantity: event.target.value })
                    }
                  />
                </label>
                <label>
                  Descuento %
                  <LegacyInput
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={item.discountPercent}
                    onChange={(event) =>
                      update(index, { discountPercent: event.target.value })
                    }
                  />
                </label>
                {items.length > 1 ? (
                  <LegacyButton
                    className="icon-button quiet"
                    onClick={() =>
                      setItems((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    aria-label="Quitar producto"
                  >
                    <Icon name="close" />
                  </LegacyButton>
                ) : null}
              </div>
              {item.productId === "maquila_bidon_20l" ? (
                <DrawerSelect
                  label="Tipo de compra · Obligatorio"
                  value={item.purchaseType || "__select"}
                  onValueChange={(purchaseType) => update(index, { purchaseType: purchaseType === "__select" ? "" : purchaseType })}
                  options={[
                    ["__select", "Seleccionar"],
                    ["refill_with_own_container", "Recarga con envase propio"],
                    ["new_bidon_first_refill", "Bidón nuevo + recarga"],
                  ]}
                />
              ) : null}
            </article>
          ))}
        </div>
        <DateTimePicker
          label="Válida hasta"
          includeTime={false}
          value={validUntil}
          onChange={setValidUntil}
        />
        <label>
          Condiciones
          <LegacyTextarea
            rows="3"
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
          />
        </label>
        <label>
          Notas internas
          <LegacyTextarea
            rows="2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <LegacyButton
          className="button primary"
          disabled={
            busy ||
            items.some(
              (item) =>
                !Number(item.quantity) ||
                (item.productId === "maquila_bidon_20l" && !item.purchaseType),
            )
          }
          onClick={() =>
            onCreateQuote({
              items: items.map((item) => ({
                ...item,
                quantity: Number(item.quantity),
                discountPercent: Number(item.discountPercent),
                purchaseType: item.purchaseType || undefined,
                fulfillment:
                  item.productId === "maquila_bidon_20l"
                    ? "plant_collection"
                    : undefined,
                description: PRODUCT_OPTIONS.find(
                  ([id]) => id === item.productId,
                )?.[1],
              })),
              validUntil: validUntil || null,
              notes,
              terms,
            })
          }
        >
          <Icon name="quote" /> Generar cotización multiproducto
        </LegacyButton>
      </section>
      <section className="drawer-section">
        <h3>Historial</h3>
        {detail.quotes.length ? (
          detail.quotes.map((quote) => (
            <article className="quote-row" key={quote.id}>
              <span>
                <strong>{quote.quote_number}</strong>
                <small>
                  {new Date(quote.created_at).toLocaleDateString("es-PE")} ·{" "}
                  {quote.status}
                </small>
              </span>
              <b>S/ {Number(quote.total).toFixed(2)}</b>
              <a
                className="icon-button quiet"
                href={`/api/crm/v1/quotes/${quote.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Abrir PDF ${quote.quote_number}`}
              >
                <Icon name="quote" />
              </a>
            </article>
          ))
        ) : (
          <p className="muted">Aún no hay cotizaciones.</p>
        )}
      </section>
    </div>
  );
}
