import { LegacyButton, LegacyInput, LegacyTextarea } from "./controls.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, queryString } from "../api.js";
import { ConfirmDialog, Drawer } from "./Drawer.jsx";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import {
  AlignLeft,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  MapPin,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { DateTimePicker } from "./OpportunityDrawer.jsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";

const monthName = new Intl.DateTimeFormat("es-PE", {
  month: "long",
  year: "numeric",
  timeZone: "America/Lima",
});
const limaDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayKey = (value) => {
  const parts = Object.fromEntries(limaDateParts.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const formatLimaTime = (value) => new Date(value).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
const formatItemTime = (item) => item.all_day ? "Todo el día" : formatLimaTime(item.starts_at);
const parseLimaDateTime = (value) => new Date(`${value}:00-05:00`);
const startOfGrid = (month) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  return new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
};

function CalendarSelect({ label, value, options, onValueChange, className = "" }) {
  return (
    <div className={`renew-calendar-filter ${className}`}>
      <label>{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent
          position="popper"
          side="bottom"
          align="end"
          sideOffset={8}
          avoidCollisions={false}
          className="renew-calendar-select-menu"
        >
          <SelectGroup>
            {options.map(([optionValue, optionLabel]) => (
              <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function Calendar({ user, users, notify, onError, onOpenTasks }) {
  const [month, setMonth] = useState(() => new Date());
  const [mobileDay, setMobileDay] = useState(() => dayKey(new Date()));
  const [assignedTo, setAssignedTo] = useState("");
  const [data, setData] = useState({ events: [], tasks: [] });
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadRequest = useRef(0);
  const range = useMemo(() => {
    const from = startOfGrid(month);
    const to = new Date(from);
    to.setDate(to.getDate() + 42);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [month]);
  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api(
        `/api/crm/v1/calendar?${queryString({ ...range, assignedTo })}`,
      );
      if (request === loadRequest.current) setData(result);
    } catch (error) {
      if (request === loadRequest.current) {
        setLoadError(error.message || "No pudimos cargar el calendario.");
        onError(error);
      }
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [range, assignedTo, onError]);
  useEffect(() => {
    load();
  }, [load]);
  const days = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => {
        const date = startOfGrid(month);
        date.setDate(date.getDate() + index);
        return date;
      }),
    [month],
  );
  const records = useMemo(
    () => [
      ...data.events.map((item) => ({ ...item, kind: "event" })),
      ...data.tasks.map((item) => ({ ...item, kind: "task" })),
    ],
    [data],
  );
  const recordsByDay = useMemo(
    () =>
      records.reduce((daysByKey, item) => {
        const key = dayKey(item.starts_at);
        const entries = daysByKey.get(key) ?? [];
        entries.push(item);
        daysByKey.set(key, entries);
        return daysByKey;
      }, new Map()),
    [records],
  );
  const agendaRecords = useMemo(() => {
    return [...records]
      .sort(
        (first, second) =>
          new Date(first.starts_at) - new Date(second.starts_at),
      )
      .slice(0, 10);
  }, [records]);
  const monthRecords = useMemo(
    () => records.filter((item) => {
      const startsAt = new Date(item.starts_at);
      return startsAt.getMonth() === month.getMonth() && startsAt.getFullYear() === month.getFullYear();
    }),
    [records, month],
  );
  useEffect(() => {
    const today = new Date();
    const nextDay = today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear()
      ? today
      : new Date(month.getFullYear(), month.getMonth(), 1);
    setMobileDay(dayKey(nextDay));
  }, [month]);
  async function mutate(work, message) {
    if (mutating) return;
    setMutating(true);
    try {
      await work();
      notify(message);
      setSelected(null);
      setCreating(false);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setMutating(false);
    }
  }
  function updateMonth(nextMonth, event, direction) {
    const shouldAnimate =
      event.detail > 0 &&
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!shouldAnimate) {
      setMonth(nextMonth);
      return;
    }
    document.documentElement.dataset.calendarDirection = direction;
    const transition = document.startViewTransition(() =>
      flushSync(() => setMonth(nextMonth)),
    );
    transition.finished.finally(() => {
      delete document.documentElement.dataset.calendarDirection;
    });
  }
  function moveMonth(delta, event) {
    updateMonth(
      new Date(month.getFullYear(), month.getMonth() + delta, 1),
      event,
      delta > 0 ? "forward" : "backward",
    );
  }
  function moveToToday(event) {
    const today = new Date();
    const currentIndex = month.getFullYear() * 12 + month.getMonth();
    const todayIndex = today.getFullYear() * 12 + today.getMonth();
    updateMonth(
      today,
      event,
      todayIndex >= currentIndex ? "forward" : "backward",
    );
  }
  function openRecord(item) {
    if (item.kind === "event") setSelected(item);
    else onOpenTasks();
  }
  return (
    <>
      <div className="renew-calendar-page">
        <PageHeader
          title="Calendario"
          description="Organice seguimientos, llamadas, reuniones y entregas del equipo."
          actions={
            <LegacyButton className="button primary renew-calendar-create" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> Nuevo evento
            </LegacyButton>
          }
        />

        <section className="renew-calendar-command" aria-label="Controles del calendario">
          <div className="renew-calendar-period">
            <span className="renew-calendar-period-icon"><CalendarDays aria-hidden="true" /></span>
            <div><h2>{monthName.format(month)}</h2><p>{monthRecords.length} actividades en el mes</p></div>
          </div>
          <div className="renew-calendar-actions">
            <div className="renew-calendar-nav" aria-label="Cambiar mes">
              <LegacyButton onClick={(event) => moveMonth(-1, event)} aria-label="Mes anterior"><ChevronLeft aria-hidden="true" /></LegacyButton>
              <LegacyButton onClick={moveToToday}>Hoy</LegacyButton>
              <LegacyButton onClick={(event) => moveMonth(1, event)} aria-label="Mes siguiente"><ChevronRight aria-hidden="true" /></LegacyButton>
            </div>
            {user.role !== "ADVISOR" ? (
              <CalendarSelect
                label="Responsable"
                value={assignedTo || "__all"}
                onValueChange={(value) => setAssignedTo(value === "__all" ? "" : value)}
                options={[["__all", "Todo el equipo"], ...users.map((member) => [member.id, member.displayName])]}
              />
            ) : null}
          </div>
        </section>

        {loadError ? <DataState kind="error" description={loadError} onAction={load} /> : null}
        {loading && !records.length ? <DataState kind="loading" title="Cargando calendario" /> : null}

        <div className="renew-calendar-layout">
          <section className="month-calendar renew-month-calendar" aria-label={monthName.format(month)}>
            <div className="calendar-weekdays">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => <strong key={label}>{label}</strong>)}
            </div>
            <div className="calendar-days">
              {days.map((date) => {
                const key = dayKey(date);
                const entries = recordsByDay.get(key) ?? [];
                const today = key === dayKey(new Date());
                return (
                  <article className={`${date.getMonth() !== month.getMonth() ? "outside " : ""}${today ? "today" : ""}`} key={key}>
                    <header><span>{date.getDate()}</span>{today ? <small>Hoy</small> : null}</header>
                    <div>
                      {entries.map((item) => (
                        <LegacyButton
                          type="button"
                          className={`calendar-entry ${item.kind} type-${String(item.event_type).toLowerCase()}`}
                          key={`${item.kind}-${item.id}`}
                          onClick={() => openRecord(item)}
                          title={item.title}
                          aria-label={`${item.kind === "task" ? "Abrir tareas:" : "Abrir evento:"} ${item.title}, ${date.toLocaleDateString("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" })}, ${formatItemTime(item)}`}
                        >
                          <span>{formatItemTime(item)}</span>
                          <strong>{item.title}</strong>
                        </LegacyButton>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="renew-calendar-agenda" aria-labelledby="upcoming-calendar-title">
            <header>
              <span><Clock3 aria-hidden="true" /></span>
              <div><h2 id="upcoming-calendar-title">Agenda del mes</h2><p>Actividades en orden cronológico</p></div>
            </header>
            <div className="renew-calendar-agenda-list">
              {agendaRecords.map((item, index) => (
                <LegacyButton
                  type="button"
                  key={`${item.kind}-${item.id}`}
                  className="renew-calendar-agenda-item"
                  onClick={() => openRecord(item)}
                  aria-label={`${item.kind === "task" ? "Abrir tareas:" : "Abrir evento:"} ${item.title}`}
                  style={{ "--calendar-index": index }}
                >
                  <time><strong>{new Date(item.starts_at).toLocaleDateString("es-PE", { day: "2-digit", timeZone: "America/Lima" })}</strong><small>{new Date(item.starts_at).toLocaleDateString("es-PE", { month: "short", timeZone: "America/Lima" })}</small></time>
                  <span><strong>{item.title}</strong><small>{formatItemTime(item)} · {item.contact_name || item.assignee_name || "Agenda interna"}</small></span>
                  <span className={`renew-calendar-kind ${item.kind}`}>{item.kind === "task" ? <ListChecks aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}</span>
                </LegacyButton>
              ))}
              {!agendaRecords.length ? (
                <div className="renew-calendar-empty"><Sparkles aria-hidden="true" /><strong>Mes despejado</strong><p>No hay actividades programadas en este mes.</p></div>
              ) : null}
            </div>
          </aside>
        </div>

        <section className="mobile-calendar renew-mobile-calendar" aria-label="Agenda por día">
          <CalendarSelect
            label="Día"
            value={mobileDay}
            onValueChange={setMobileDay}
            options={days.filter((date) => date.getMonth() === month.getMonth()).map((date) => [dayKey(date), date.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })])}
          />
          <div>
            {(recordsByDay.get(mobileDay) ?? []).map((item, index) => (
              <LegacyButton type="button" className="mobile-calendar-entry" key={`${item.kind}-${item.id}`} onClick={() => openRecord(item)} style={{ "--calendar-index": index }}>
                <time>{formatItemTime(item)}</time>
                <span><strong>{item.title}</strong><small>{item.contact_name || item.assignee_name || "Agenda interna"}</small></span>
                <span className={`renew-calendar-kind ${item.kind}`}>{item.kind === "task" ? "Tarea" : "Evento"}</span>
              </LegacyButton>
            ))}
            {!recordsByDay.get(mobileDay)?.length ? <div className="renew-calendar-empty"><Sparkles aria-hidden="true" /><strong>Día disponible</strong><p>No hay actividades programadas.</p></div> : null}
          </div>
        </section>
      </div>
      {creating ? (
        <EventDrawer
          users={users}
          actor={user}
          busy={mutating}
          onClose={() => setCreating(false)}
          onSave={(form) =>
            mutate(
              () => api("/api/crm/v1/calendar", { method: "POST", body: form }),
              "Evento programado",
            )
          }
        />
      ) : null}
      {selected ? (
        <EventDrawer
          event={selected}
          users={users}
          actor={user}
          busy={mutating}
          onClose={() => {
            setDeletePending(false);
            setSelected(null);
          }}
          onSave={(patch) =>
            mutate(
              () =>
                api(`/api/crm/v1/calendar/${selected.id}`, {
                  method: "PATCH",
                  body: { version: selected.version, patch },
                }),
              "Evento actualizado",
            )
          }
          onDelete={() => setDeletePending(true)}
        />
      ) : null}
      {selected && deletePending ? (
        <ConfirmDialog
          title="Eliminar evento"
          description={`“${selected.title}” dejará de aparecer en el calendario. El cambio quedará registrado en la auditoría.`}
          confirmLabel="Eliminar evento"
          tone="danger"
          onClose={() => setDeletePending(false)}
          onConfirm={() => {
            const event = selected;
            setDeletePending(false);
            mutate(
              () =>
                api(`/api/crm/v1/calendar/${event.id}`, {
                  method: "DELETE",
                  body: { version: event.version },
                }),
              "Evento eliminado",
            );
          }}
        />
      ) : null}
    </>
  );
}

function asLocalDateTimeInput(date) {
  const parts = Object.fromEntries(limaDateParts.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function EventDrawer({
  event = null,
  users,
  actor,
  busy,
  onClose,
  onSave,
  onDelete,
}) {
  const initialStart = event?.starts_at
    ? new Date(event.starts_at)
    : new Date(Date.now() + 3600000);
  const initialEnd = event?.ends_at
    ? new Date(event.ends_at)
    : new Date(initialStart.getTime() + 3600000);
  const [form, setForm] = useState({
    title: event?.title ?? "",
    eventType: event?.event_type ?? "FOLLOW_UP",
    startsAt: asLocalDateTimeInput(initialStart),
    endsAt: asLocalDateTimeInput(initialEnd),
    location: event?.location ?? "",
    description: event?.description ?? "",
    assignedTo: event?.assigned_to ?? actor.id,
    allDay: Boolean(event?.all_day),
    status: event?.status ?? "SCHEDULED",
  });
  const [timeError, setTimeError] = useState("");
  function validateTimes(next) {
    const starts = parseLimaDateTime(next.startsAt);
    const ends = parseLimaDateTime(next.endsAt);
    if (Number.isNaN(starts.valueOf()) || Number.isNaN(ends.valueOf()))
      return "Ingrese fechas y horas válidas.";
    if (ends < starts)
      return "La fecha de fin no puede ser anterior al inicio.";
    return "";
  }
  const field = (key) => ({
    value: form[key],
    onChange: (e) => {
      const next = { ...form, [key]: e.target.value };
      setForm(next);
      if (key === "startsAt" || key === "endsAt")
        setTimeError(validateTimes(next));
    },
  });
  function submit(e) {
    e.preventDefault();
    const error = validateTimes(form);
    if (error) {
      setTimeError(error);
      return;
    }
    const starts = parseLimaDateTime(form.startsAt);
    const ends = parseLimaDateTime(form.endsAt);
    setTimeError("");
    onSave({
      ...form,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
    });
  }
  function updateDate(key, value) {
    const next = { ...form, [key]: value };
    setForm(next);
    setTimeError(validateTimes(next));
  }
  return (
    <Drawer label={event ? "editar evento" : "nuevo evento"} onClose={onClose} className="calendar-event-drawer">
      <header className="calendar-event-drawer-header">
        <div className="calendar-event-drawer-heading">
          <span><CalendarDays aria-hidden="true" /></span>
          <div><h2>{event ? "Editar evento" : "Nuevo evento"}</h2><p>Hora de Lima · los cambios quedan registrados</p></div>
        </div>
        <LegacyButton className="icon-button quiet" onClick={onClose} aria-label="Cerrar evento" data-drawer-close><X aria-hidden="true" /></LegacyButton>
      </header>
      <form className="entity-drawer-body" onSubmit={submit}>
        <section className="drawer-section calendar-event-main">
          <div className="calendar-event-section-heading"><span><AlignLeft aria-hidden="true" /></span><div><h3>Información del evento</h3><p>Defina el propósito y el tipo de actividad.</p></div></div>
          <label><span>Título <small className="required-mark">Obligatorio</small></span><LegacyInput required {...field("title")} placeholder="Ej. Seguimiento de propuesta" /></label>
          <div className="field-grid calendar-event-selects">
            <CalendarSelect label="Tipo" value={form.eventType} onValueChange={(value) => setForm((current) => ({ ...current, eventType: value }))} options={[["FOLLOW_UP", "Seguimiento"], ["CALL", "Llamada"], ["MEETING", "Reunión"], ["DELIVERY", "Entrega"], ["OTHER", "Otro"]]} />
            {event ? <CalendarSelect label="Estado" value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[["SCHEDULED", "Programado"], ["COMPLETED", "Completado"], ["CANCELLED", "Cancelado"]]} /> : null}
          </div>
          <label><span>Descripción</span><LegacyTextarea rows="4" {...field("description")} placeholder="Agregue contexto útil para el equipo" /></label>
        </section>

        <section className="drawer-section calendar-event-schedule">
          <div className="calendar-event-section-heading"><span><Clock3 aria-hidden="true" /></span><div><h3>Fecha y responsable</h3><p>Coordine el horario y quién atenderá la actividad.</p></div></div>
          <div className="field-grid calendar-event-dates">
            <DateTimePicker label="Inicio" value={form.startsAt} onChange={(value) => updateDate("startsAt", value)} />
            <DateTimePicker label="Fin" value={form.endsAt} onChange={(value) => updateDate("endsAt", value)} />
          </div>
          <LegacyButton
            type="button"
            role="switch"
            aria-checked={form.allDay}
            className={`calendar-all-day ${form.allDay ? "active" : ""}`}
            onClick={() => setForm((current) => ({ ...current, allDay: !current.allDay }))}
          >
            <span aria-hidden="true"><span /></span>
            <span><strong>Evento de todo el día</strong><small>Oculta la hora en las vistas de agenda.</small></span>
          </LegacyButton>
          {timeError ? <p className="inline-error" id="calendar-time-error" role="alert">{timeError}</p> : null}
          {actor.role !== "ADVISOR" ? (
            <CalendarSelect label="Responsable" value={form.assignedTo} onValueChange={(value) => setForm((current) => ({ ...current, assignedTo: value }))} options={users.map((member) => [member.id, member.displayName])} />
          ) : null}
          <label className="calendar-location-field"><span>Lugar</span><div><MapPin aria-hidden="true" /><LegacyInput {...field("location")} placeholder="Dirección, llamada o videollamada" /></div></label>
        </section>

        <footer className="calendar-event-actions">
          <span>El evento aparecerá en la agenda del responsable.</span>
          <div>
            {event ? <LegacyButton className="text-button danger-text" type="button" onClick={onDelete}>Eliminar evento</LegacyButton> : null}
            <LegacyButton className="button primary" disabled={busy}>{busy ? "Guardando…" : event ? "Guardar cambios" : "Programar evento"}</LegacyButton>
          </div>
        </footer>
      </form>
    </Drawer>
  );
}
