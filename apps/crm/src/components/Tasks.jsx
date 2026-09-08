import { LegacyButton, LegacyInput, LegacyTextarea } from "./controls.jsx";
import { useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Check,
  CheckCircle2,
  CircleAlert,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { api, queryString } from "../api.js";
import { ConfirmDialog, Drawer } from "./Drawer.jsx";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import { DateTimePicker } from "./OpportunityDrawer.jsx";
import { Button } from "@/components/ui/button.jsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.jsx";

const buckets = [
  ["OVERDUE", "Vencidas", "overdue", AlarmClock],
  ["TODAY", "Hoy", "today", CalendarDays],
  ["UPCOMING", "Próximas", "upcoming", CalendarClock],
  ["NO_DUE", "Sin fecha", "noDue", CalendarOff],
];
const statusOptions = [["OPEN", "Abiertas"], ["DONE", "Completadas"], ["ALL", "Todas"]];
const priorityOptions = [["__all", "Todas"], ["URGENT", "Urgente"], ["HIGH", "Alta"], ["MEDIUM", "Media"], ["LOW", "Baja"]];

function TaskSelect({ label, value, onValueChange, options, className = "" }) {
  return (
    <div className={`renew-task-filter ${className}`}>
      <label>{label}</label>
      <Select value={value || "__all"} onValueChange={onValueChange}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="renew-task-select-menu">
          <SelectGroup>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function Tasks({ user, users, notify, onError }) {
  const [bucket, setBucket] = useState("OVERDUE");
  const [status, setStatus] = useState("OPEN");
  const [priority, setPriority] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settlingTaskId, setSettlingTaskId] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestId = useRef(0);
  const load = async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api(`/api/crm/v1/tasks?${queryString({ page, pageSize: 50, bucket: status === "OPEN" ? bucket : "", status, priority, assignedTo, q })}`);
      if (currentRequest === requestId.current) setData(result);
    } catch (error) {
      if (currentRequest === requestId.current) {
        setLoadError(error.message || "No pudimos cargar las tareas.");
        onError(error);
      }
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer); }, [bucket, status, priority, assignedTo, q, page]);
  async function mutate(path, method, body, message) {
    setBusy(true);
    try {
      await api(path, { method, body });
      setSelected(null);
      notify(message);
      await load();
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50)));
  const viewTitle = status === "OPEN" ? (buckets.find(([key]) => key === bucket)?.[1] ?? "Agenda") : "Historial de tareas";

  return (
    <div className="renew-tasks-page">
      <PageHeader title="Tareas" description="Agenda comercial priorizada por vencimiento, responsable y estado." />

      <section className="renew-task-buckets" aria-label="Grupos de agenda">
        {buckets.map(([key, label, count, BucketIcon]) => (
          <LegacyButton
            key={key}
            className={bucket === key && status === "OPEN" ? "active" : ""}
            aria-pressed={bucket === key && status === "OPEN"}
            onClick={() => { setStatus("OPEN"); setBucket(key); setPage(1); }}
          >
            <span className="renew-task-bucket-icon"><BucketIcon aria-hidden="true" /></span>
            <span><strong>{label}</strong><small>{key === "OVERDUE" ? "Requieren atención" : key === "TODAY" ? "Agenda de hoy" : key === "UPCOMING" ? "Siguientes acciones" : "Pendientes de agendar"}</small></span>
            <b>{data?.buckets?.[count] ?? 0}</b>
          </LegacyButton>
        ))}
      </section>

      <section className={`renew-task-toolbar ${user.role === "ADVISOR" ? "is-advisor" : ""}`} aria-label="Filtros de tareas">
        <div className="renew-task-search">
          <label htmlFor="task-search">Buscar tareas</label>
          <InputGroup>
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput id="task-search" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="Buscar tarea, contacto u oportunidad" />
          </InputGroup>
        </div>
        <TaskSelect label="Estado" value={status} options={statusOptions} onValueChange={(value) => { setStatus(value); setPage(1); }} />
        <TaskSelect label="Prioridad" value={priority || "__all"} options={priorityOptions} onValueChange={(value) => { setPriority(value === "__all" ? "" : value); setPage(1); }} />
        {user.role !== "ADVISOR" ? (
          <TaskSelect
            label="Responsable"
            value={assignedTo || "__all"}
            options={[["__all", "Todo el equipo"], ...users.map((member) => [member.id, member.displayName])]}
            onValueChange={(value) => { setAssignedTo(value === "__all" ? "" : value); setPage(1); }}
          />
        ) : null}
      </section>

      <section className="renew-task-inbox" aria-labelledby="task-view-title">
        <header>
          <div><h2 id="task-view-title">{viewTitle}</h2><p>{data?.total ?? 0} tareas en esta vista</p></div>
          <span className="renew-task-view-state"><span /> {status === "OPEN" ? "Agenda activa" : status === "DONE" ? "Historial completado" : "Todas las tareas"}</span>
        </header>
        {data?.items?.length ? (
          <div className="renew-task-columns" aria-hidden="true"><span>Tarea</span><span>Prioridad</span><span>Vencimiento</span><span>Responsable</span><span /></div>
        ) : null}
        <div className="renew-task-scroll">
          {loadError ? <DataState kind="error" description={loadError} onAction={load} /> : null}
          {loading && !data ? <DataState kind="loading" title="Cargando tareas" /> : null}
          {(data?.items ?? []).map((task, index) => (
            <article
              className={`renew-task-row ${task.status === "DONE" ? "done" : ""} ${settlingTaskId === task.id ? "settling" : ""}`}
              aria-busy={settlingTaskId === task.id}
              key={task.id}
              style={{ "--task-index": index }}
            >
              <LegacyButton
                className="renew-task-check"
                disabled={busy}
                onClick={() => {
                  setSettlingTaskId(task.id);
                  const request = task.status === "DONE"
                    ? mutate(`/api/crm/v1/tasks/${task.id}/reopen`, "POST", { version: task.version }, "Tarea reabierta")
                    : mutate(`/api/crm/v1/tasks/${task.id}/complete`, "POST", { version: task.version }, "Tarea completada");
                  request.finally(() => setSettlingTaskId(null));
                }}
                aria-label={task.status === "DONE" ? `Reabrir ${task.title}` : `Completar ${task.title}`}
              ><Check aria-hidden="true" /></LegacyButton>
              <LegacyButton className="renew-task-copy" onClick={() => setSelected(task)} aria-label={`Abrir ${task.title}`}>
                <span className="renew-task-title"><strong>{task.title}</strong><small>{task.contact_name || "Sin contacto"}{task.opportunity_title ? ` · ${task.opportunity_title}` : ""}</small></span>
                <span className={`renew-task-priority priority-${task.priority.toLowerCase()}`}>{labelPriority(task.priority)}</span>
                <span className={isOverdue(task) ? "renew-task-due overdue" : "renew-task-due"}>{formatDue(task.due_at)}</span>
                <span className="renew-task-owner"><UserRound aria-hidden="true" /> {task.assignee_name || "Sin asignar"}</span>
                <span className="renew-task-arrow"><ArrowRight aria-hidden="true" /></span>
              </LegacyButton>
            </article>
          ))}
          {!loading && !loadError && !data?.items?.length ? (
            <div className="renew-task-empty">
              <span>{status === "OPEN" ? <CheckCircle2 aria-hidden="true" /> : <CalendarOff aria-hidden="true" />}</span>
              <div><strong>{status === "OPEN" ? "No hay tareas en este grupo" : "No encontramos tareas"}</strong><p>{q || priority || assignedTo ? "Cambie los filtros para ampliar los resultados." : "La agenda está al día en esta vista."}</p></div>
            </div>
          ) : null}
        </div>
      </section>

      <nav className="pagination renew-task-pagination" aria-label="Paginación de tareas">
        <span>{data?.total ?? 0} tareas</span>
        <div><LegacyButton disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</LegacyButton><span>Página {page} de {pages}</span><LegacyButton disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</LegacyButton></div>
      </nav>

      {selected ? (
        <TaskDrawer
          task={selected}
          users={users}
          canAssign={user.role !== "ADVISOR"}
          busy={busy}
          onClose={() => { setDeletePending(false); setSelected(null); }}
          onSave={(patch) => mutate(`/api/crm/v1/tasks/${selected.id}`, "PATCH", { version: selected.version, patch }, "Tarea actualizada")}
          onDelete={() => setDeletePending(true)}
        />
      ) : null}
      {selected && deletePending ? (
        <ConfirmDialog
          title="Eliminar tarea"
          description={`“${selected.title}” dejará de aparecer en la agenda. El registro permanecerá disponible en la auditoría.`}
          confirmLabel="Eliminar tarea"
          tone="danger"
          busy={busy}
          onClose={() => setDeletePending(false)}
          onConfirm={() => { setDeletePending(false); mutate(`/api/crm/v1/tasks/${selected.id}`, "DELETE", { version: selected.version }, "Tarea eliminada"); }}
        />
      ) : null}
    </div>
  );
}

function TaskDrawer({ task, users, canAssign, busy, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? "",
    dueAt: task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : "",
    priority: task.priority,
    assignedTo: task.assigned_to ?? "",
    status: task.status,
  });
  const field = (key) => ({ value: form[key], onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })) });
  return (
    <Drawer label="Editar tarea" onClose={onClose} className="task-drawer">
      <header className="task-drawer-header">
        <div className="task-drawer-heading"><span><CheckCircle2 aria-hidden="true" /></span><div><h2>Editar tarea</h2><p>{task.contact_name || "Sin contacto vinculado"}{task.opportunity_title ? ` · ${task.opportunity_title}` : ""}</p></div></div>
        <LegacyButton className="icon-button quiet" onClick={onClose} aria-label="Cerrar tarea" data-drawer-close><X aria-hidden="true" /></LegacyButton>
      </header>
      <form className="entity-drawer-body" onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null });
      }}>
        <section className="drawer-section task-main-section">
          <div className="task-section-heading"><span><CircleAlert aria-hidden="true" /></span><div><h3>Información de la tarea</h3><p>Defina el resultado esperado y su nivel de atención.</p></div></div>
          <label><span>Título <small className="required-mark">Obligatorio</small></span><LegacyInput required {...field("title")} /></label>
          <label><span>Descripción</span><LegacyTextarea rows="4" {...field("description")} /></label>
          <div className="field-grid task-drawer-selects">
            <TaskSelect label="Prioridad" value={form.priority} options={priorityOptions.filter(([key]) => key !== "__all")} onValueChange={(value) => setForm((current) => ({ ...current, priority: value }))} />
            <TaskSelect label="Estado" value={form.status} options={[["OPEN", "Abierta"], ["DONE", "Completada"]]} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))} />
          </div>
        </section>
        <section className="drawer-section task-schedule-section">
          <div className="task-section-heading"><span><CalendarClock aria-hidden="true" /></span><div><h3>Agenda y responsable</h3><p>Programe el seguimiento y confirme quién lo atenderá.</p></div></div>
          <DateTimePicker value={form.dueAt} onChange={(value) => setForm((current) => ({ ...current, dueAt: value }))} label="Vencimiento" />
          {canAssign ? (
            <TaskSelect label="Responsable" value={form.assignedTo || "__none"} options={[["__none", "Sin asignar"], ...users.map((member) => [member.id, member.displayName])]} onValueChange={(value) => setForm((current) => ({ ...current, assignedTo: value === "__none" ? "" : value }))} />
          ) : null}
        </section>
        <footer className="task-drawer-actions">
          <span>Los cambios se aplicarán a la agenda comercial.</span>
          <div><LegacyButton className="text-button danger-text" type="button" onClick={onDelete}>Eliminar tarea</LegacyButton><LegacyButton className="button primary" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</LegacyButton></div>
        </footer>
      </form>
    </Drawer>
  );
}

function labelPriority(value) {
  return ({ URGENT: "Urgente", HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" }[value] ?? value);
}
function formatDue(value) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function isOverdue(task) {
  return task.status === "OPEN" && task.due_at && new Date(task.due_at) < new Date();
}
