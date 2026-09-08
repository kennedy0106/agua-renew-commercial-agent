import { LegacyButton } from "./controls.jsx";
import { lazy, Suspense, useDeferredValue, useEffect, useState } from "react";
import { Columns3, Download, List, Search, SlidersHorizontal } from "lucide-react";
import { queryString } from "../api.js";
import { Icon } from "../icons.jsx";
import { nextTabValue } from "../tab-navigation.js";
import { PageHeader } from "./Shell.jsx";
import { DataState } from "./patterns.jsx";
import { Button } from "@/components/ui/button.jsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.jsx";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.jsx";

const PRODUCT = {
  "20l": "Bidón 20 L",
  "1l": "Botella 1 L",
  "625ml": "Botella 625 ml",
  "10_5l": "Galonera 10.5 L",
};
const MODALITY = {
  maquila: "Maquila",
  distribution_agua_renew: "Distribución",
  final_customer: "Consumo propio",
};
const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});
const PipelineBoard = lazy(() => import("./PipelineBoard.jsx"));
const VIEW_TABS = [
  ["list", "Lista"],
  ["kanban", "Pipeline"],
];

function OpportunityFilterSelect({ id, label, value, options, onValueChange }) {
  const selected = value || "__all";
  return <div className="renew-opportunity-filter"><label htmlFor={id}>{label}</label><Select value={selected} onValueChange={(next) => onValueChange(next === "__all" ? "" : next)}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent position="popper" side="bottom" align="start" sideOffset={8} avoidCollisions={false} className="renew-opportunity-select-menu"><SelectGroup>{options.map(([optionValue, optionLabel]) => <SelectItem value={optionValue || "__all"} key={optionValue || "__all"}>{optionLabel}</SelectItem>)}</SelectGroup></SelectContent></Select></div>;
}

export function Opportunities({
  data,
  stages,
  users,
  filters,
  onFiltersChange,
  onSelect,
  loading,
  error = "",
  onRetry,
  onMoved,
  onError,
}) {
  const [search, setSearch] = useState(filters.q ?? "");
  const [mode, setMode] = useState("list");
  const [tabInput, setTabInput] = useState("pointer");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  useEffect(() => {
    const timeout = setTimeout(
      () => onFiltersChange({ q: deferredSearch, page: 1 }),
      250,
    );
    return () => clearTimeout(timeout);
  }, [deferredSearch, onFiltersChange]);

  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)),
  );
  function moveTab(event, current) {
    const next = nextTabValue(VIEW_TABS, current, event.key);
    if (!next) return;
    event.preventDefault();
    setTabInput("keyboard");
    setMode(next);
    requestAnimationFrame(() =>
      document.getElementById(`opportunities-tab-${next}`)?.focus(),
    );
  }
  return (
    <div className="renew-opportunities-page">
      <PageHeader
        title="Oportunidades"
        description="Cada prospecto con responsable, etapa y próxima acción visibles."
        actions={
          <div className="renew-opportunity-actions">
            <Button asChild variant="secondary" className="renew-opportunities-export"><a href={`/api/crm/v1/opportunities.csv?${queryString(filters)}`}><Download aria-hidden="true" />Exportar CSV</a></Button>
            <div
              className={`view-toggle ${tabInput === "keyboard" ? "is-keyboard-navigation" : ""}`}
              role="tablist"
              aria-label="Vista de oportunidades"
            >
              {VIEW_TABS.map(([value, label]) => (
                <LegacyButton
                  id={`opportunities-tab-${value}`}
                  role="tab"
                  aria-selected={mode === value}
                  aria-controls={`opportunities-panel-${value}`}
                  tabIndex={mode === value ? 0 : -1}
                  className={mode === value ? "active" : ""}
                  onClick={(event) => {
                    setTabInput(event.detail === 0 ? "keyboard" : "pointer");
                    setMode(value);
                  }}
                  onKeyDown={(event) => moveTab(event, value)}
                  key={value}
                >
                  {value === "list" ? <List aria-hidden="true" /> : <Columns3 aria-hidden="true" />}{label}
                </LegacyButton>
              ))}
            </div>
          </div>
        }
      />
      <LegacyButton
        className="button secondary mobile-filter-toggle"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((value) => !value)}
      >
        <SlidersHorizontal aria-hidden="true" />{" "}
        {filtersOpen ? "Ocultar filtros" : "Buscar y filtrar"}
      </LegacyButton>
      <section
        className={`surface opportunity-toolbar renew-opportunity-toolbar ${filtersOpen ? "mobile-open" : ""}`}
        aria-label="Filtros de oportunidades"
      >
        <div className="renew-opportunity-search"><label htmlFor="opportunity-search">Buscar oportunidades</label><InputGroup><InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon><InputGroupInput id="opportunity-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, teléfono u oportunidad" /></InputGroup></div>
        <OpportunityFilterSelect id="opportunity-stage" label="Etapa" value={filters.stage ?? ""} onValueChange={(stage) => onFiltersChange({ stage, page: 1 })} options={[["", "Todas las etapas"], ...stages.map((stage) => [stage.key, stage.name])]} />
        <OpportunityFilterSelect id="opportunity-owner" label="Responsable" value={filters.ownerId ?? ""} onValueChange={(ownerId) => onFiltersChange({ ownerId, page: 1 })} options={[["", "Todo el equipo"], ...users.map((candidate) => [candidate.id, candidate.displayName])]} />
        <OpportunityFilterSelect id="opportunity-status" label="Estado" value={filters.lifecycle ?? "OPEN"} onValueChange={(lifecycle) => onFiltersChange({ lifecycle, page: 1 })} options={[["OPEN", "Activas"], ["WON", "Ganadas"], ["LOST", "Perdidas"], ["ARCHIVED", "Archivadas"], ["ALL", "Todas"]]} />
      </section>
      {mode === "list" ? (
        <div
          id="opportunities-panel-list"
          role="tabpanel"
          aria-labelledby="opportunities-tab-list"
          aria-busy={loading}
        >
          <OpportunityTable data={data} loading={loading} error={error} onRetry={onRetry} onSelect={onSelect} />
          <nav className="pagination" aria-label="Paginación">
            <span>{data?.total ?? 0} oportunidades</span>
            <div>
              <LegacyButton
                disabled={(data?.page ?? 1) <= 1 || loading}
                onClick={() => onFiltersChange({ page: data.page - 1 })}
              >
                Anterior
              </LegacyButton>
              <span>
                Página {data?.page ?? 1} de {totalPages}
              </span>
              <LegacyButton
                disabled={(data?.page ?? 1) >= totalPages || loading}
                onClick={() => onFiltersChange({ page: data.page + 1 })}
              >
                Siguiente
              </LegacyButton>
            </div>
          </nav>
        </div>
      ) : (
        <div
          id="opportunities-panel-kanban"
          role="tabpanel"
          aria-labelledby="opportunities-tab-kanban"
        >
          <Suspense
            fallback={
              <div className="surface empty-state" role="status">
                <strong>Preparando pipeline…</strong>
              </div>
            }
          >
            <PipelineBoard
              stages={stages}
              filters={filters}
              onSelect={onSelect}
              onMoved={onMoved}
              onError={onError}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function OpportunityTable({ data, loading, error, onRetry, onSelect }) {
  return (
    <section
      className={`surface opportunity-list renew-opportunity-list ${loading ? "is-loading" : ""}`}
    >
      {loading && !data ? <DataState kind="loading" title="Cargando oportunidades" className="renew-list-loading" /> : null}
      {error && !data ? <DataState kind="error" title="No se pudieron cargar las oportunidades" description={error} onAction={onRetry} className="renew-list-error" /> : null}
      {data ? <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Contacto</th>
              <th scope="col">Etapa</th>
              <th scope="col">Oportunidad</th>
              <th scope="col">Responsable</th>
              <th scope="col">Próxima acción</th>
              <th scope="col" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((item, index) => (
              <tr key={item.id} style={{ "--opportunity-index": index }}>
                <td data-label="Contacto">
                  <LegacyButton
                    className="person-cell"
                    onClick={() => onSelect(item.id)}
                  >
                    <span>{initials(item.contactName)}</span>
                    <div>
                      <strong>{item.contactName}</strong>
                      <small>
                        {channel(item.sourceChannel)} ·{" "}
                        {maskPhone(item.phoneE164)}
                      </small>
                    </div>
                  </LegacyButton>
                </td>
                <td data-label="Etapa">
                  <span
                    className="stage-chip"
                    style={{ "--stage-color": item.stageColor }}
                  >
                    {item.stageName}
                  </span>
                </td>
                <td data-label="Oportunidad">
                  <strong>{PRODUCT[item.product] ?? "Por definir"}</strong>
                  <small>
                    {MODALITY[item.modality] ?? "Modalidad pendiente"}
                    {item.estimatedValue
                      ? ` · ${money.format(item.estimatedValue)}`
                      : ""}
                  </small>
                </td>
                <td data-label="Responsable">
                  {item.ownerName ?? <span className="muted">Sin asignar</span>}
                </td>
                <td data-label="Próxima acción">
                  <span
                    className={
                      isOverdue(item.nextActionAt) ? "due overdue" : "due"
                    }
                  >
                    {item.nextAction || "Sin próxima acción"}
                    <small>{dateTime(item.nextActionAt)}</small>
                  </span>
                </td>
                <td>
                  <LegacyButton
                    className="icon-button quiet"
                    aria-label={`Abrir ${item.contactName}`}
                    onClick={() => onSelect(item.id)}
                  >
                    <Icon name="arrow" />
                  </LegacyButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : null}
      {!loading && !data?.items?.length ? (
        <div className="empty-state">
          <Icon name="pipeline" size={32} />
          <strong>No hay oportunidades en esta vista</strong>
          <p>Ajuste los filtros o revise otro estado del pipeline.</p>
        </div>
      ) : null}
    </section>
  );
}

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AR"
  );
}
function maskPhone(phone) {
  return phone ? `${phone.slice(0, 4)}••••${phone.slice(-4)}` : "Sin teléfono";
}
function channel(value) {
  return value === "instagram"
    ? "Instagram"
    : value === "facebook_messenger"
      ? "Facebook"
      : "Meta";
}
function dateTime(value) {
  return value
    ? new Date(value).toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}
function isOverdue(value) {
  return value && new Date(value) < new Date();
}
