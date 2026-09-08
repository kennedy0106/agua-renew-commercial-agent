import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Clock3, FileClock, PauseCircle, Play, Plus, ShieldCheck, UsersRound, Workflow, Zap } from "lucide-react";
import { api } from "../api.js";
import { Icon } from "../icons.jsx";
import { LegacyButton, LegacyInput } from "./controls.jsx";
import { Drawer } from "./Drawer.jsx";
import { DataState } from "./patterns.jsx";
import { PageHeader } from "./Shell.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.jsx";

const triggerLabels = {
  TASK_OVERDUE: "Al vencer una tarea",
  OPPORTUNITY_IDLE: "Sin actividad comercial",
};
const actionLabels = {
  NOTIFY_OWNER: "Notificar al responsable",
};

function AutomationSelect({ label, value, options, onValueChange, disabled }) {
  return (
    <label className="renew-automation-select">
      <span>{label}</span>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="renew-automation-select-menu">
          <SelectGroup>
            {options.map(([optionValue, optionLabel]) => <SelectItem value={optionValue} key={optionValue}>{optionLabel}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

export function Automations({ user, notify, onError }) {
  const [data, setData] = useState({ items: [], total: 0 });
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const loadRequest = useRef(0);
  const canManage = user.role !== "ADVISOR";
  const activeRules = data.items.filter((item) => item.active).length;
  const countsAvailable = !loadError || data.items.length > 0;

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await api("/api/crm/v1/automations");
      if (request === loadRequest.current) setData(result);
    } catch (error) {
      if (request !== loadRequest.current) return;
      setLoadError(error.message || "No pudimos cargar las automatizaciones.");
      onError(error);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  async function mutate(work, message) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await work();
      notify(message);
      setCreating(false);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setActionBusy(false);
    }
  }

  async function runNow() {
    if (running || user.role !== "ADMIN") return;
    setRunning(true);
    try {
      const result = await api("/api/crm/v1/automations/run", { method: "POST", body: {} });
      notify(`Ejecución completa: ${result.overdue + result.idle} alertas nuevas`);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="renew-automations-page">
        <PageHeader
          title="Automatizaciones"
          description="Proteja el seguimiento con reglas internas, visibles y auditables."
          actions={canManage ? (
            <div className="renew-automations-actions">
              <LegacyButton className="button secondary" disabled={running || actionBusy || user.role !== "ADMIN"} title={user.role !== "ADMIN" ? "Solo un administrador puede ejecutar las reglas" : undefined} onClick={runNow}>
                <Play aria-hidden="true" /> {running ? "Ejecutando…" : "Ejecutar ahora"}
              </LegacyButton>
              <LegacyButton className="button primary" disabled={actionBusy} onClick={() => setCreating(true)}><Plus aria-hidden="true" /> Nueva regla</LegacyButton>
            </div>
          ) : null}
        />

        <section className="automation-summary" aria-label="Protecciones de automatización">
          <header><span><ShieldCheck aria-hidden="true" /></span><div><h2>Control preventivo</h2><p>Las reglas ordenan el trabajo; nunca escriben en Meta.</p></div></header>
          <article><Zap aria-hidden="true" /><span><strong>{countsAvailable ? `${activeRules} reglas activas` : "Estado no disponible"}</strong><small>{countsAvailable ? `De ${data.total ?? data.items.length} configuradas.` : "Recargue para consultar las reglas."}</small></span></article>
          <article><FileClock aria-hidden="true" /><span><strong>Ejecución trazable</strong><small>Cada cambio conserva autor y versión.</small></span></article>
          <article><UsersRound aria-hidden="true" /><span><strong>Permisos protegidos</strong><small>Gestión por rol y ejecución solo ADMIN.</small></span></article>
        </section>

        <section className="automation-layout">
          <aside className="surface automation-principles">
            <header><div><h2>Guardas SLA</h2><p>Condiciones que protegen la continuidad comercial.</p></div><span>72 h</span></header>
            <article><span><Clock3 aria-hidden="true" /></span><div><strong>Primera respuesta</strong><p>Una oportunidad sin actividad durante 72 horas genera una alerta.</p></div></article>
            <article><span><BellRing aria-hidden="true" /></span><div><strong>Seguimientos vencidos</strong><p>Cada tarea vencida mantiene una sola notificación activa.</p></div></article>
            <article><span><UsersRound aria-hidden="true" /></span><div><strong>Escalamiento visible</strong><p>Supervisores ajustan reglas sin modificar código.</p></div></article>
          </aside>

          <section className="surface automation-list">
            <header><div><h2>Reglas configuradas</h2><p>{countsAvailable ? `${activeRules} activas de ${data.total ?? data.items.length}` : "Disponibilidad desconocida"}</p></div><span className="automation-list-count">{countsAvailable ? (data.total ?? data.items.length) : "—"}</span></header>
            {loadError ? <DataState kind="error" title="No se pudieron cargar las reglas" description={loadError} onAction={load} /> : null}
            {loading && !data.items.length ? <DataState kind="loading" title="Cargando automatizaciones" /> : null}
            <div className="automation-rule-ledger">
              {data.items.map((rule) => (
                <article key={rule.id} className={!rule.active ? "disabled" : ""}>
                  <span className={`automation-rule-icon ${rule.active ? "is-active" : ""}`}>{rule.active ? <CheckCircle2 aria-hidden="true" /> : <PauseCircle aria-hidden="true" />}</span>
                  <span className="automation-rule-copy"><strong>{rule.name}</strong><small>{triggerLabels[rule.trigger_type] ?? rule.trigger_type}</small></span>
                  <span className="automation-rule-action"><Workflow aria-hidden="true" /><small>{actionLabels[rule.action_type] ?? rule.action_type}</small></span>
                  <span className={`automation-state ${rule.active ? "is-active" : ""}`}><i /><small>{rule.active ? "Activa" : "Pausada"}</small></span>
                  {canManage ? (
                    <LegacyButton className="button secondary compact" disabled={actionBusy} onClick={() => mutate(() => api(`/api/crm/v1/automations/${rule.id}`, { method: "PATCH", body: { version: rule.version, patch: { active: !rule.active } } }), rule.active ? "Automatización pausada" : "Automatización activada")}>
                      {rule.active ? "Pausar" : "Activar"}
                    </LegacyButton>
                  ) : null}
                </article>
              ))}
            </div>
            {!loading && !loadError && !data.items.length ? (
              <div className="empty-state renew-automation-empty"><span><Workflow aria-hidden="true" /></span><strong>Sin reglas todavía</strong><p>Cree la primera regla para proteger el seguimiento del equipo.</p></div>
            ) : null}
          </section>
        </section>
      </div>

      {creating && canManage ? <AutomationDrawer busy={actionBusy} onClose={() => setCreating(false)} onSave={(form) => mutate(() => api("/api/crm/v1/automations", { method: "POST", body: form }), "Automatización creada")} /> : null}
    </>
  );
}

function AutomationDrawer({ busy, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", triggerType: "OPPORTUNITY_IDLE", actionType: "NOTIFY_OWNER", triggerConfig: { hours: 72 }, actionConfig: {} });
  return (
    <Drawer label="nueva automatización" onClose={onClose} className="automation-drawer">
      <header><div><h2>Nueva automatización</h2><p>Defina una condición y una acción interna, siempre auditables.</p></div><LegacyButton className="icon-button quiet" onClick={onClose} aria-label="Cerrar automatización"><Icon name="close" /></LegacyButton></header>
      <form onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label><span>Nombre <small className="required-mark">Obligatorio</small></span><LegacyInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Alertar oportunidades inactivas" /></label>
        <AutomationSelect label="Cuándo" value={form.triggerType} onValueChange={(value) => setForm({ ...form, triggerType: value })} disabled={busy} options={Object.entries(triggerLabels)} />
        {form.triggerType === "OPPORTUNITY_IDLE" ? <label><span>Horas sin actividad <small className="required-mark">Obligatorio</small></span><LegacyInput type="number" min="1" max="8760" required value={form.triggerConfig.hours ?? 72} onChange={(event) => setForm({ ...form, triggerConfig: { hours: Number(event.target.value) } })} /></label> : null}
        <AutomationSelect label="Qué hacer" value={form.actionType} onValueChange={(value) => setForm({ ...form, actionType: value })} disabled={busy} options={Object.entries(actionLabels)} />
        <div className="observer-note"><ShieldCheck aria-hidden="true" /><span>Las reglas generan alertas internas para el responsable. No envían mensajes a Meta.</span></div>
        <LegacyButton className="button primary" disabled={busy}>{busy ? "Creando…" : "Crear regla"}</LegacyButton>
      </form>
    </Drawer>
  );
}
