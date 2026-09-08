import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, BarChart3, Bell, CalendarDays, CircleDollarSign, Clock3,
  Inbox, ListTodo, MessageCircleMore, SearchX, UserRoundX, UsersRound,
} from "lucide-react";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty.jsx";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.jsx";
import { Skeleton } from "@/components/ui/skeleton.jsx";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("es-PE");
const compactMoney = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", notation: "compact", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", timeZone: "America/Lima" });
const time = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });

function greeting(name) {
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: "America/Lima" }).format(new Date()));
  return `¡${hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"}, ${name}!`;
}

export function Dashboard(props) {
  return <DashboardV2 {...props} />;
}

function EmptyCompact({ title, text, icon: EmptyIcon = SearchX }) {
  return <Empty className="sh-empty"><EmptyHeader><EmptyMedia variant="icon"><EmptyIcon /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{text}</EmptyDescription></EmptyHeader></Empty>;
}
function DashboardV2({ data, user, notifications = [], onOpenTasks, onOpenCalendar, onOpenIntervention, onOpenOpportunity, onReadNotification, onPeriodChange, periodLoading, error, onRetry }) {
  const [selectedPeriod, setSelectedPeriod] = useState(data?.period?.key ?? "8w");
  const [chartMode, setChartMode] = useState("trend");
  const periodSelectionRequest = useRef(0);
  useEffect(() => setSelectedPeriod(data?.period?.key ?? "8w"), [data?.period?.key]);

  if (!data && error) return <DataState kind="error" title="No pudimos cargar el Resumen" description={error} onAction={onRetry} />;
  if (!data) return <DashboardV2Skeleton />;

  const operational = data.operationalSummary ?? {};
  const active = Number(data.open ?? 0);
  const ready = Number(operational.readyForHandoff ?? 0);
  const isAdvisor = user.role === "ADVISOR";
  const riskCards = isAdvisor
    ? [
        { label: "Seguimientos vencidos", value: Number(data.overdue ?? 0), detail: "Requieren una acción", icon: Clock3, action: onOpenTasks },
        { label: "Tareas abiertas", value: Number(operational.openTasks ?? 0), detail: "En tu agenda comercial", icon: ListTodo, action: onOpenTasks },
      ]
    : [
        { label: "Casos por revisar", value: Number(operational.needsReview ?? 0), detail: "Pendientes de calificación", icon: Inbox, action: onOpenIntervention },
        { label: "Sin responsable", value: Number(operational.unassigned ?? 0), detail: "Necesitan asignación", icon: UserRoundX, action: () => onOpenOpportunity(null) },
      ];
  const priority = data.priorityOpportunity;
  const nextAgenda = data.upcomingAgenda?.[0];
  const recent = data.recentOpportunities?.[0];
  const chartModes = ["trend", "pipeline"];
  const chooseChartMode = (mode, target) => {
    setChartMode(mode);
    target?.focus();
  };
  const handleChartKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = chartModes.indexOf(chartMode);
    const next = event.key === "Home" ? 0 : event.key === "End" ? chartModes.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + chartModes.length) % chartModes.length;
    const target = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')?.[next];
    chooseChartMode(chartModes[next], target);
  };

  return (
    <div className="flow-dashboard">
      <PageHeader
        className="flow-dashboard-header"
        title={greeting(user.displayName.split(" ")[0])}
        description="Prioriza la cartera, mueve conversaciones y mantén al equipo en ritmo."
        actions={<Button size="lg" onClick={onOpenIntervention}><Inbox data-icon="inline-start" />Revisar bandeja<ArrowRight data-icon="inline-end" /></Button>}
      />
      {error ? <Alert variant="destructive"><Bell /><AlertTitle>No se pudo actualizar el resumen</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" onClick={onRetry}>Reintentar</Button></Alert> : null}

      <div className="flow-dashboard-layout">
        <div className="flow-dashboard-main">
          <section className="flow-overview" aria-label="Indicadores principales">
            <FlowMetricCard label={isAdvisor ? "Mis oportunidades" : "Oportunidades activas"} value={active} total={active} badge="Cartera" detail={isAdvisor ? "En tu cartera actual" : "En el pipeline actual"} icon={UsersRound} />
            <FlowMetricCard label="Listos para WhatsApp" value={ready} total={active} detail="Preparados para el siguiente contacto" icon={MessageCircleMore} accent />
            <PriorityCard opportunity={priority} onOpenOpportunity={onOpenOpportunity} />
          </section>

          <section className="flow-performance" aria-busy={periodLoading}>
            <header className="flow-performance-header">
              <span className="flow-soft-icon"><BarChart3 /></span>
              <div><h2>Rendimiento comercial</h2><p>{periodLoading ? "Actualizando datos…" : data.period?.label ?? "Período actual"}</p></div>
              <div className="flow-chart-tabs" role="tablist" aria-label="Vista del gráfico">
                <button id="flow-tab-trend" type="button" role="tab" aria-selected={chartMode === "trend"} aria-controls="flow-chart-panel" tabIndex={chartMode === "trend" ? 0 : -1} onKeyDown={handleChartKeyDown} onClick={() => setChartMode("trend")}>Tendencia</button>
                <button id="flow-tab-pipeline" type="button" role="tab" aria-selected={chartMode === "pipeline"} aria-controls="flow-chart-panel" tabIndex={chartMode === "pipeline" ? 0 : -1} onKeyDown={handleChartKeyDown} onClick={() => setChartMode("pipeline")}>Pipeline</button>
              </div>
              <Select value={selectedPeriod} disabled={periodLoading} onValueChange={async (next) => {
                const request = ++periodSelectionRequest.current;
                setSelectedPeriod(next);
                const accepted = await onPeriodChange(next);
                if (!accepted && request === periodSelectionRequest.current) setSelectedPeriod(data.period?.key ?? "8w");
              }}>
                <SelectTrigger size="sm" aria-label="Período de análisis"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" side="bottom" align="end" sideOffset={8} avoidCollisions={false} className="flow-period-menu"><SelectGroup><SelectItem value="8w">8 semanas</SelectItem><SelectItem value="6m">6 meses</SelectItem><SelectItem value="12m">12 meses</SelectItem></SelectGroup></SelectContent>
              </Select>
            </header>
            <div id="flow-chart-panel" className="flow-chart-stage" role="tabpanel" aria-labelledby={`flow-tab-${chartMode}`} key={`${chartMode}-${data.period?.key ?? "8w"}`}>
              {chartMode === "trend" ? <GroupedTrend rows={data.trend ?? []} /> : <PipelineDistribution stages={data.stages ?? []} />}
            </div>
          </section>
        </div>

        <aside className="flow-rail" aria-label="Resumen operativo">
          <div className="flow-risk-grid">
            {riskCards.map((item) => <RailMetric key={item.label} {...item} total={active} />)}
          </div>
          <RailLink icon={CalendarDays} title="Próxima actividad" detail={nextAgenda ? `${nextAgenda.title} · ${date.format(new Date(nextAgenda.startsAt))}, ${time.format(new Date(nextAgenda.startsAt))}` : "Agenda libre"} onClick={onOpenCalendar} />
          <RailLink icon={CircleDollarSign} title="Oportunidad reciente" detail={recent ? `${recent.contactName} · ${recent.stageName}` : "Sin movimientos recientes"} onClick={() => onOpenOpportunity(recent?.stageKey ?? null, recent?.id)} />
          <RailLink icon={Bell} title="Notificaciones" detail={notifications.length ? `${number.format(notifications.length)} pendiente${notifications.length === 1 ? "" : "s"}` : "Todo al día"} onClick={() => notifications[0] ? onReadNotification(notifications[0].id) : undefined} disabled={!notifications.length} />
          <RailLink icon={ListTodo} title="Abrir tareas" detail={`${number.format(Number(operational.openTasks ?? 0))} tareas abiertas`} onClick={onOpenTasks} />
        </aside>
      </div>
    </div>
  );
}

function FlowMetricCard({ label, value, total, badge, detail, icon: Icon, accent = false }) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const filled = value > 0 ? Math.max(1, value === total && total > 0 ? 8 : Math.round((percent / 100) * 8)) : 0;
  return <article className={`flow-metric ${accent ? "is-accent" : ""}`}>
    <header><span className="flow-soft-icon"><Icon /></span><h2>{label}</h2></header>
    <div className="flow-metric-value"><strong>{number.format(value)}</strong><span>{badge ?? (total ? `${percent}%` : "Sin datos")}</span></div>
    <p>{detail}</p>
    <div className="flow-segments" aria-label={badge ? `${number.format(value)} ${label.toLowerCase()}` : `${percent}% del total`}>{Array.from({ length: 8 }, (_, index) => <i key={index} className={index < filled ? "is-filled" : ""} style={{ "--segment-index": index }} />)}</div>
  </article>;
}

function PriorityCard({ opportunity, onOpenOpportunity }) {
  if (!opportunity) return <article className="flow-priority is-empty"><span>Prioridad comercial</span><h2>Sin oportunidades urgentes</h2><p>La cartera no tiene una acción prioritaria pendiente.</p></article>;
  return <article className="flow-priority">
    <span>Prioridad comercial</span>
    <h2>{opportunity.contactName}</h2>
    <p>{opportunity.nextAction || `${opportunity.stageName} · Próxima acción por definir`}</p>
    <div><Badge variant="secondary">{opportunity.stageName}</Badge>{opportunity.estimatedValue ? <strong>{money.format(opportunity.estimatedValue)}</strong> : <small>Sin valor estimado</small>}</div>
    <Button onClick={() => onOpenOpportunity(opportunity.stageKey, opportunity.id)}>Abrir oportunidad<ArrowRight data-icon="inline-end" /></Button>
  </article>;
}

function RailMetric({ label, value, detail, icon: Icon, action, total }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return <button type="button" className="flow-rail-metric" onClick={action}>
    <span className="flow-soft-icon"><Icon /></span><strong>{number.format(value)}</strong><small>{label}</small><em>{percent}% · {detail}</em>
  </button>;
}

function RailLink({ icon: Icon, title, detail, onClick, disabled = false }) {
  return <button type="button" className="flow-rail-link" onClick={onClick} disabled={disabled}>
    <span className="flow-soft-icon"><Icon /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight />
  </button>;
}

function GroupedTrend({ rows }) {
  if (!rows.length) return <EmptyCompact title="Sin tendencia disponible" text="No hay datos para el período seleccionado." />;
  const max = Math.max(1, ...rows.map((row) => Number(row.created ?? 0)));
  const scale = (value) => value <= 0 ? 0 : 28 + (Math.log1p(value) / Math.log1p(max)) * 64;
  const ticks = Array.from({ length: 10 }, (_, index) => ((10 - index) / 10).toFixed(1));
  return <section className="flow-grouped-chart" aria-labelledby="flow-trend-title">
    <div className="flow-chart-legend"><div><h3 id="flow-trend-title">Actividad por período</h3><small>Intensidad relativa; consulta cada barra para ver las cifras</small></div><div><span data-series="created">Creadas</span><span data-series="won">Ganadas</span><span data-series="lost">Perdidas</span></div></div>
    <div className="flow-chart-plot">
      <div className="flow-y-axis" aria-hidden="true">{ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
      <div className="flow-bars" style={{ "--flow-columns": rows.length }} aria-label="Oportunidades creadas, ganadas y perdidas por período">
        {rows.map((row, index) => {
          const created = Number(row.created ?? 0);
          const won = Number(row.won ?? 0);
          const lost = Number(row.lost ?? 0);
          const height = scale(created);
          const wonShare = created > 0 && won > 0 ? Math.min(76, Math.max(18, (won / created) * 100)) : 0;
          const label = `${row.bucketStart.slice(0,10)} · Creadas: ${created}, ganadas: ${won}, perdidas: ${lost}`;
          return <div className="flow-bar-group" key={row.bucketStart} style={{ "--bar-index": index }}>
          <div className="flow-bar-set">
            <span className={`flow-stat-capsule ${created === 0 ? "is-empty" : ""}`} style={{ "--bar-height": `${height}%`, "--won-share": `${wonShare}%` }} tabIndex="0" role="img" aria-label={label}>
              {created > 0 ? <><i className="flow-stat-created" /><i className="flow-stat-won" aria-hidden="true" /><i className="flow-stat-created-dot" aria-hidden="true" /><i className="flow-stat-won-dot" aria-hidden="true" /></> : <i className="flow-stat-empty-dot" aria-hidden="true" />}
              <b><span>{number.format(created)} creadas</span><span>{number.format(won)} ganadas</span><span>{number.format(lost)} perdidas</span></b>
              <i className={`flow-stat-loss ${lost > 0 ? "has-value" : ""}`} aria-hidden="true" />
            </span>
          </div>
          <span>{new Intl.DateTimeFormat("es-PE", { month: "short", day: rows.length > 6 ? "2-digit" : undefined, timeZone: "America/Lima" }).format(new Date(`${row.bucketStart.slice(0,10)}T12:00:00-05:00`))}</span>
        </div>})}
      </div>
    </div>
    <div className="sr-only"><table><caption>Datos de la tendencia comercial</caption><thead><tr><th>Período</th><th>Creadas</th><th>Ganadas</th><th>Perdidas</th></tr></thead><tbody>{rows.map((row) => <tr key={row.bucketStart}><td>{row.bucketStart.slice(0,10)}</td><td>{row.created}</td><td>{row.won}</td><td>{row.lost}</td></tr>)}</tbody></table></div>
  </section>;
}

function PipelineDistribution({ stages }) {
  const active = stages.filter((stage) => !["WON", "LOST"].includes(stage.stageKey));
  const total = active.reduce((sum, stage) => sum + Number(stage.total ?? 0), 0);
  if (!total) return <EmptyCompact title="Sin oportunidades activas" text="No hay datos para distribuir por etapa." />;
  return <section className="flow-pipeline" aria-labelledby="flow-pipeline-title">
    <div className="flow-chart-legend"><h3 id="flow-pipeline-title">Distribución actual</h3><p>{number.format(total)} oportunidades</p></div>
    <div className="flow-pipeline-list">{active.map((stage, index) => {
      const percent = Math.round((Number(stage.total) / total) * 100);
      return <div key={stage.id} style={{ "--stage-index": index }}><span><i style={{ background: stage.color || "var(--flow-ink)" }} />{stage.name}</span><div><i style={{ width: `${Math.max(2, percent)}%`, background: stage.color || "var(--flow-ink)" }} /></div><strong>{number.format(stage.total)}</strong><small>{percent}%{stage.value ? ` · ${compactMoney.format(stage.value)}` : ""}</small></div>;
    })}</div>
    <div className="sr-only"><table><caption>Distribución actual del pipeline</caption><thead><tr><th>Etapa</th><th>Oportunidades</th><th>Valor</th></tr></thead><tbody>{active.map((stage) => <tr key={stage.id}><td>{stage.name}</td><td>{stage.total}</td><td>{money.format(stage.value)}</td></tr>)}</tbody></table></div>
  </section>;
}

function DashboardV2Skeleton() {
  return <div className="flow-dashboard" role="status" aria-label="Cargando dashboard"><Skeleton className="h-24 w-full" /><div className="flow-overview">{[1,2,3].map((item) => <Skeleton className="h-56 w-full rounded-3xl" key={item} />)}</div><Skeleton className="h-96 w-full rounded-3xl" /></div>;
}
