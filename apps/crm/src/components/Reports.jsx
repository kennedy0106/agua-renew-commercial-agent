import { BarChart3, CheckCircle2, Clock3, Coins, FileCheck2, Gauge, Radio, Target, TrendingUp, UsersRound } from "lucide-react";
import { DateTimePicker } from "./OpportunityDrawer.jsx";
import { PageHeader } from "./Shell.jsx";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });

function channelName(channel) {
  if (channel === "facebook_messenger") return "Facebook";
  if (channel === "instagram") return "Instagram";
  return channel || "Sin canal";
}

export function Reports({ data, loading, error = "", onRetry, range, onRangeChange }) {
  const rangeError = range.from && range.to && range.from > range.to
    ? "La fecha final debe ser igual o posterior a la fecha inicial."
    : "";
  const stages = data?.byStage ?? [];
  const owners = data?.byOwner ?? [];
  const channels = data?.byChannel ?? [];
  const losses = data?.lossReasons ?? [];
  const maxStage = Math.max(...stages.map((entry) => entry.total), 1);
  const maxOwner = Math.max(...owners.map((entry) => entry.total), 1);
  const quoteConversion = data?.quotes?.total
    ? Math.round((data.quotes.accepted / data.quotes.total) * 100)
    : null;
  const taskTotal = data?.sla?.total ?? 0;
  const taskCompleted = data?.sla?.completed ?? 0;
  const taskOverdue = data?.sla?.overdue ?? 0;
  const taskCompletion = taskTotal ? Math.round((taskCompleted / taskTotal) * 100) : 0;
  const taskStatus = taskTotal ? (taskOverdue ? "Requiere atención" : "Al día") : "Sin actividad";

  return (
    <div className="renew-reports-page">
      <PageHeader
        className="reports-page-header"
        title="Reportes comerciales"
        description="Lea conversión, valor y seguimiento con datos del periodo seleccionado."
        actions={
          <div className="renew-report-range" aria-label="Rango del reporte">
            <DateTimePicker label="Desde" includeTime={false} value={range.from} onChange={(value) => onRangeChange({ from: value })} />
            <span aria-hidden="true">—</span>
            <DateTimePicker label="Hasta" includeTime={false} value={range.to} onChange={(value) => onRangeChange({ to: value })} />
          </div>
        }
      />

      {rangeError ? <p className="renew-report-range-error" id="report-range-error" role="alert">{rangeError}</p> : null}
      {error && !rangeError ? (
        <section className="renew-report-error" role="alert">
          <div><strong>No pudimos cargar los reportes</strong><span>{error}</span></div>
          <button type="button" className="button secondary" onClick={onRetry}>Reintentar</button>
        </section>
      ) : null}
      {loading && data && !rangeError ? <div className="report-updating" role="status"><span />Actualizando el reporte…</div> : null}
      {!data && loading && !error && !rangeError ? <div className="surface content-skeleton skeleton renew-report-skeleton" aria-label="Cargando reportes" /> : null}

      {data && !rangeError ? (
        <div className="renew-report-content" aria-busy={loading}>
          <section className="report-metrics" aria-label="Indicadores principales">
            <article className="is-primary">
              <header><span><Coins aria-hidden="true" /></span><strong>Ingresos confirmados</strong></header>
              <div><b>{money.format(data.revenue?.ordered ?? 0)}</b><small>{money.format(data.revenue?.collected ?? 0)} cobrados</small></div>
            </article>
            <article className="is-accent">
              <header><span><FileCheck2 aria-hidden="true" /></span><strong>Cotizaciones</strong></header>
              <div><b>{integer.format(data.quotes?.total ?? 0)}</b><small>{integer.format(data.quotes?.accepted ?? 0)} aceptadas · {money.format(data.quotes?.quoted ?? 0)}</small></div>
            </article>
            <article>
              <span><Clock3 aria-hidden="true" /></span>
              <div><b>{Number(data.cycle?.avgDays ?? 0).toFixed(1)} días</b><small>Ciclo promedio</small></div>
            </article>
            <article>
              <span><Target aria-hidden="true" /></span>
              <div><b>{quoteConversion === null ? "Sin base" : `${quoteConversion}%`}</b><small>Conversión de cotización</small></div>
            </article>
          </section>

          <section className="reports-grid">
            <article className="surface report-wide renew-stage-report">
              <header className="section-heading">
                <span><BarChart3 aria-hidden="true" /></span>
                <div><h2>Distribución por etapa</h2><p>Volumen y valor registrado en el periodo.</p></div>
              </header>
              <div className="bar-report" aria-hidden="true">
                {stages.map((stage) => (
                  <div key={stage.stage_key}>
                    <span>{stage.name}</span>
                    <div><i style={{ width: `${(stage.total / maxStage) * 100}%` }} /></div>
                    <strong>{integer.format(stage.total)}</strong>
                    <small>{money.format(stage.value)}</small>
                  </div>
                ))}
                {!stages.length ? <p className="muted">No hay etapas con actividad en este periodo.</p> : null}
              </div>
              <table className="sr-only">
                <caption>Distribución por etapa</caption>
                <thead><tr><th>Etapa</th><th>Oportunidades</th><th>Valor</th></tr></thead>
                <tbody>{stages.map((stage) => <tr key={stage.stage_key}><th>{stage.name}</th><td>{stage.total}</td><td>{money.format(stage.value)}</td></tr>)}</tbody>
              </table>
            </article>

            <div className="report-layout-row is-operational">
              <section className="sla-report" aria-label="Seguimiento de tareas">
                <header>
                  <span><Gauge aria-hidden="true" /></span>
                  <div><h2>Seguimiento</h2><p>Estado de las tareas del periodo.</p></div>
                  <strong className="sla-status">{taskStatus}</strong>
                </header>
                <div className="sla-report-body">
                  <div className="sla-primary-stat">
                    <span>Vencidas</span>
                    <strong>{integer.format(taskOverdue)}</strong>
                    <small>{taskOverdue ? "Necesitan seguimiento" : "Sin tareas fuera de plazo"}</small>
                  </div>
                  <div className="sla-report-detail">
                    <dl>
                      <div><dt>Completadas</dt><dd>{integer.format(taskCompleted)}</dd></div>
                      <div><dt>Total del periodo</dt><dd>{integer.format(taskTotal)}</dd></div>
                    </dl>
                    <div className="sla-completion">
                      <span><b>Avance</b><strong>{taskCompletion}%</strong></span>
                      <div role="progressbar" aria-label="Avance de tareas" aria-valuemin="0" aria-valuemax="100" aria-valuenow={taskCompletion}>
                        <i style={{ width: `${taskCompletion}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <article className="surface renew-owner-report">
              <header className="section-heading"><span><UsersRound aria-hidden="true" /></span><div><h2>Por responsable</h2><p>Distribución del trabajo comercial.</p></div></header>
              <div className="report-list">
                {owners.map((owner) => (
                  <div key={owner.owner}>
                    <span><strong>{owner.owner}</strong><small>{owner.won} ganadas · {money.format(owner.value)}</small></span>
                    <div className="owner-volume"><i style={{ width: `${(owner.total / maxOwner) * 100}%` }} /></div>
                    <b>{integer.format(owner.total)}</b>
                  </div>
                ))}
                {!owners.length ? <p className="muted">No hay responsables con actividad.</p> : null}
              </div>
              <table className="sr-only">
                <caption>Actividad por responsable</caption>
                <thead><tr><th>Responsable</th><th>Oportunidades</th><th>Ganadas</th><th>Valor</th></tr></thead>
                <tbody>{owners.map((owner) => <tr key={owner.owner}><th>{owner.owner}</th><td>{owner.total}</td><td>{owner.won}</td><td>{money.format(owner.value)}</td></tr>)}</tbody>
              </table>
              </article>
            </div>

            <div className="report-layout-row is-context">
              <section className="renew-channel-report" aria-label="Origen de oportunidades">
              <header><span><Radio aria-hidden="true" /></span><div><h2>Origen</h2><p>Canales que originaron oportunidades.</p></div></header>
              {channels.map((channel) => <div key={channel.channel}><span>{channelName(channel.channel)}</span><strong>{integer.format(channel.total)}</strong></div>)}
              {!channels.length ? <p className="muted">Sin canales registrados.</p> : null}
              </section>

              <article className="surface renew-loss-report">
              <header className="section-heading"><span><TrendingUp aria-hidden="true" /></span><div><h2>Motivos de pérdida</h2><p>Razones registradas para orientar mejoras.</p></div></header>
              <div className="report-list">
                {losses.map((entry) => <div key={entry.reason}><span><strong>{entry.reason}</strong></span><b>{integer.format(entry.total)}</b></div>)}
                {!losses.length ? <div className="renew-loss-empty"><CheckCircle2 aria-hidden="true" /><span><strong>Sin motivos registrados</strong><small>No hay pérdidas clasificadas en este periodo.</small></span></div> : null}
              </div>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
