import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast as sonnerToast } from "sonner";
import { api, queryString, setCsrfToken } from "./api.js";
import { Login } from "./components/Login.jsx";
import { Shell } from "./components/Shell.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { DataState, PermissionState, ViewLoadingState } from "./components/patterns.jsx";
import {
  canAccessView,
  isKnownView,
  VIEW_BY_ID,
  viewFromLocation,
} from "./view-registry.js";

const InterventionInbox = lazy(() =>
  import("./components/InterventionInbox.jsx").then((module) => ({
    default: module.InterventionInbox,
  })),
);
const Opportunities = lazy(() =>
  import("./components/Opportunities.jsx").then((module) => ({
    default: module.Opportunities,
  })),
);
const OpportunityDrawer = lazy(() =>
  import("./components/OpportunityDrawer.jsx").then((module) => ({
    default: module.OpportunityDrawer,
  })),
);
const ConfirmDialog = lazy(() =>
  import("./components/Drawer.jsx").then((module) => ({
    default: module.ConfirmDialog,
  })),
);
const Contacts = lazy(() =>
  import("./components/Contacts.jsx").then((module) => ({
    default: module.Contacts,
  })),
);
const Companies = lazy(() =>
  import("./components/Companies.jsx").then((module) => ({
    default: module.Companies,
  })),
);
const Tasks = lazy(() =>
  import("./components/Tasks.jsx").then((module) => ({
    default: module.Tasks,
  })),
);
const Calendar = lazy(() =>
  import("./components/Calendar.jsx").then((module) => ({
    default: module.Calendar,
  })),
);
const Revenue = lazy(() =>
  import("./components/Revenue.jsx").then((module) => ({
    default: module.Revenue,
  })),
);
const Communications = lazy(() =>
  import("./components/Communications.jsx").then((module) => ({
    default: module.Communications,
  })),
);
const Automations = lazy(() =>
  import("./components/Automations.jsx").then((module) => ({
    default: module.Automations,
  })),
);
const Reports = lazy(() =>
  import("./components/Reports.jsx").then((module) => ({
    default: module.Reports,
  })),
);
const Users = lazy(() =>
  import("./components/Users.jsx").then((module) => ({
    default: module.Users,
  })),
);
class ViewBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <DataState
        kind="error"
        title="No pudimos cargar esta vista"
        description="Revise su conexión y recargue para intentarlo nuevamente."
        actionLabel="Recargar vista"
        onAction={() => window.location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}

export function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState(viewFromLocation);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState({
    stages: [],
    users: [],
    notifications: [],
  });
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [opportunities, setOpportunities] = useState(null);
  const [opportunitiesError, setOpportunitiesError] = useState("");
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 25,
    lifecycle: "OPEN",
    sort: "updated_desc",
  });
  const [selected, setSelected] = useState(null);
  const [searchTarget, setSearchTarget] = useState(null);
  const [reports, setReports] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [reportsRetry, setReportsRetry] = useState(0);
  const [reportRange, setReportRange] = useState({ from: "", to: "" });
  const [stageDecision, setStageDecision] = useState(null);
  const [loading, setLoading] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const reportRequest = useRef(0);
  const dashboardRequest = useRef(0);
  const searchSelection = useRef(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const notify = useCallback((message, kind = "success") => {
    if (kind === "error") {
      sonnerToast.error(message, {
        duration: Infinity,
        action: { label: "Recargar", onClick: () => window.location.reload() },
      });
      return;
    }
    sonnerToast.success(message);
  }, []);
  const updateFilters = useCallback(
    (patch) =>
      setFilters((current) =>
        Object.entries(patch).every(([key, value]) => current[key] === value)
          ? current
          : { ...current, ...patch },
      ),
    [],
  );
  const handleError = useCallback(
    (error) => {
      if (error.status === 401) {
        setUser(null);
        setCsrfToken("");
        return;
      }
      notify(
        `${error.message || "No pudimos completar la operación"}. Puede recargar la vista e intentarlo nuevamente.`,
        "error",
      );
    },
    [notify],
  );
  const loadBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError("");
    try {
      const data = await api("/api/crm/v1/bootstrap");
      setBootstrap(data);
      setBootstrapReady(true);
      return data;
    } catch (error) {
      setBootstrapError(error?.message || "No pudimos cargar el equipo comercial.");
      throw error;
    } finally {
      setBootstrapLoading(false);
    }
  }, []);
  const loadDashboard = useCallback(async (period = "8w") => {
    const request = ++dashboardRequest.current;
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const result = await api(`/api/crm/v1/dashboard?${queryString({ period })}`);
      if (request === dashboardRequest.current) setDashboard(result);
      return request === dashboardRequest.current;
    } catch (error) {
      if (request === dashboardRequest.current) {
        setDashboardError(error.message || "No pudimos actualizar el resumen.");
        handleError(error);
      }
      return false;
    } finally {
      if (request === dashboardRequest.current) setDashboardLoading(false);
    }
  }, [handleError]);
  const loadOpportunities = useCallback(
    async (nextFilters = filters) => {
      const request = ++listRequest.current;
      setLoading(true);
      setOpportunitiesError("");
      try {
        const data = await api(
          `/api/crm/v1/opportunities?${queryString(nextFilters)}`,
        );
        if (request === listRequest.current) setOpportunities(data);
      } catch (error) {
        if (request === listRequest.current) {
          setOpportunitiesError(error?.message || "No pudimos cargar las oportunidades.");
          handleError(error);
        }
      } finally {
        if (request === listRequest.current) setLoading(false);
      }
    },
    [filters, handleError],
  );
  const loadDetail = useCallback(
    async (id) => {
      const request = ++detailRequest.current;
      if (!id) {
        setSelected(null);
        return;
      }
      try {
        const data = await api(`/api/crm/v1/opportunities/${id}`);
        if (request === detailRequest.current) setSelected(data);
      } catch (error) {
        if (request === detailRequest.current) handleError(error);
      }
    },
    [handleError],
  );
  const navigate = useCallback((nextView, { replace = false, target = null } = {}) => {
    if (!isKnownView(nextView)) return;
    const hash = `#/${nextView}`;
    if (window.location.hash !== hash)
      window.history[replace ? "replaceState" : "pushState"]({}, "", hash);
    detailRequest.current += 1;
    setView(nextView);
    setMenuOpen(false);
    setSelected(null);
    setSearchTarget(target);
  }, []);

  useEffect(() => {
    const sync = () => {
      detailRequest.current += 1;
      setSelected(null);
      setSearchTarget(null);
      setMenuOpen(false);
      setView(viewFromLocation());
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    if (!window.location.hash) navigate("dashboard", { replace: true });
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [navigate]);
  useEffect(() => {
    if (view === "opportunities" && searchTarget?.type === "opportunity") loadDetail(searchTarget.id);
  }, [view, searchTarget, loadDetail]);
  useEffect(() => {
    api("/api/crm/v1/auth/session")
      .then((session) => {
        setCsrfToken(session.csrfToken);
        setUser(session.user);
      })
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);
  useEffect(() => {
    if (user)
      Promise.all([loadBootstrap(), loadDashboard()]).catch(handleError);
  }, [user, loadBootstrap, loadDashboard, handleError]);
  useEffect(() => {
    if (user && view === "opportunities") loadOpportunities(filters);
    else listRequest.current += 1;
  }, [user, view, filters, loadOpportunities]);
  useEffect(() => {
    if (!user || view !== "reports") {
      reportRequest.current += 1;
      return;
    }
    if (
      reportRange.from &&
      reportRange.to &&
      reportRange.from > reportRange.to
    ) {
      reportRequest.current += 1;
      setReportsLoading(false);
      return;
    }
    const request = ++reportRequest.current;
    setReportsLoading(true);
    setReportsError("");
    api(`/api/crm/v1/reports?${queryString(reportRange)}`)
      .then((data) => {
        if (request === reportRequest.current) setReports(data);
      })
      .catch((error) => {
        if (request === reportRequest.current) {
          setReportsError(error?.message || "No pudimos cargar los reportes.");
          handleError(error);
        }
      })
      .finally(() => {
        if (request === reportRequest.current) setReportsLoading(false);
      });
  }, [user, view, reportRange, reportsRetry, handleError]);
  useEffect(() => {
    document.title = user
      ? `${VIEW_BY_ID[view]?.title ?? "CRM"} · Agua ReNew`
      : "Acceso · Agua ReNew";
  }, [user, view]);

  async function refreshOpportunity({ id, token, originView }) {
    await Promise.all([
      originView === "opportunities"
        ? loadOpportunities(filters)
        : Promise.resolve(),
      loadDashboard(),
    ]);
    if (
      id &&
      token === detailRequest.current &&
      window.location.hash === `#/${originView}`
    )
      await loadDetail(id);
  }
  async function mutate(work, successMessage) {
    const id = selected?.opportunity?.id;
    const token = detailRequest.current;
    const originView = view;
    setLoading(true);
    try {
      await work();
      notify(successMessage);
      await refreshOpportunity({ id, token, originView });
      return true;
    } catch (error) {
      handleError(error);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function createUser(form) {
    setLoading(true);
    try {
      await api("/api/crm/v1/users", { method: "POST", body: form });
      notify("Usuario creado");
      try {
        await loadBootstrap();
      } catch (error) {
        handleError(error);
      }
      return true;
    } catch (error) {
      handleError(error);
      return false;
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession)
    return (
      <div className="app-loading">
        <img src="/brand/logo-gotita.svg" alt="" />
        <span>Preparando CRM…</span>
      </div>
    );
  if (!user) return <Login onAuthenticated={setUser} />;
  const unread = bootstrap.notifications.filter((item) => !item.read_at);
  const hasViewPermission = canAccessView(user.role, view);

  return (
    <Shell
      user={user}
      activeView={view}
      onNavigate={navigate}
      notifications={unread.length}
      menuOpen={menuOpen}
      onMenuToggle={() => setMenuOpen((value) => !value)}
      onLogout={async () => {
        try {
          await api("/api/crm/v1/auth/logout", { method: "POST", body: {} });
        } finally {
          setCsrfToken("");
          setUser(null);
        }
      }}
      onOpenSearchResult={(result) => navigate(result.destination, { target: { ...result, requestKey: ++searchSelection.current } })}
    >
      <div className="crm-content">
        <ViewBoundary key={view}>
          <Suspense
            fallback={
              <ViewLoadingState title={`Cargando ${VIEW_BY_ID[view]?.title?.toLowerCase() ?? "vista"}`} />
            }
          >
            {!hasViewPermission ? (
              <PermissionState onReturn={() => navigate("dashboard")} />
            ) : null}
            {hasViewPermission && view === "dashboard" ? (
              <Dashboard
                data={dashboard}
                user={user}
                users={bootstrap.users}
                notifications={unread}
                onOpenPipeline={() => navigate("opportunities")}
                onOpenTasks={() => navigate("tasks")}
                onOpenCalendar={() => navigate("calendar")}
                onOpenTeam={() => navigate("users")}
                onOpenIntervention={() => navigate("intervention")}
                onOpenOpportunity={(stage, id) => {
                  setFilters((current) => ({ ...current, stage: stage || undefined, page: 1 }));
                  navigate("opportunities", { target: id ? { type: "opportunity", id, destination: "opportunities" } : null });
                }}
                onPeriodChange={loadDashboard}
                periodLoading={dashboardLoading}
                error={dashboardError}
                onRetry={() => loadDashboard(dashboard?.period?.key ?? "8w")}
                onReadNotification={(id) =>
                  mutate(async () => {
                    await api(`/api/crm/v1/notifications/${id}/read`, {
                      method: "POST",
                      body: {},
                    });
                    await loadBootstrap();
                  }, "Notificación revisada")
                }
              />
            ) : null}
            {hasViewPermission && view === "intervention" ? (
              <InterventionInbox
                user={user}
                notify={notify}
                onError={handleError}
              />
            ) : null}
            {hasViewPermission && view === "opportunities" ? (
              <Opportunities
                data={opportunities}
                stages={bootstrap.stages}
                users={bootstrap.users}
                filters={filters}
                loading={loading || (!opportunities && !opportunitiesError)}
                error={opportunitiesError}
                onRetry={() => loadOpportunities(filters)}
                onFiltersChange={updateFilters}
                onSelect={loadDetail}
                onMoved={notify}
                onError={handleError}
              />
            ) : null}
            {hasViewPermission && view === "contacts" ? (
              <Contacts user={user} users={bootstrap.users} notify={notify} onError={handleError} initialSelection={searchTarget?.type === "contact" ? searchTarget : null} />
            ) : null}
            {hasViewPermission && view === "companies" ? (
              <Companies user={user} notify={notify} onError={handleError} initialSelection={searchTarget?.type === "company" ? searchTarget : null} />
            ) : null}
            {hasViewPermission && view === "tasks" ? (
              <Tasks
                user={user}
                users={bootstrap.users}
                notify={notify}
                onError={handleError}
              />
            ) : null}
            {hasViewPermission && view === "calendar" ? (
              <Calendar
                user={user}
                users={bootstrap.users}
                notify={notify}
                onError={handleError}
                onOpenTasks={() => navigate("tasks")}
              />
            ) : null}
            {hasViewPermission && view === "revenue" ? (
              <Revenue user={user} notify={notify} onError={handleError} />
            ) : null}
            {hasViewPermission && view === "communications" ? (
              <Communications
                user={user}
                notify={notify}
                onError={handleError}
              />
            ) : null}
            {hasViewPermission && view === "automations" ? (
              <Automations user={user} notify={notify} onError={handleError} />
            ) : null}
            {hasViewPermission && view === "reports" ? (
              <Reports
                data={reports}
                loading={reportsLoading || (!reports && !reportsError)}
                error={reportsError}
                onRetry={() => setReportsRetry((current) => current + 1)}
                range={reportRange}
                onRangeChange={(patch) =>
                  setReportRange((current) => ({ ...current, ...patch }))
                }
              />
            ) : null}
            {hasViewPermission && view === "users" ? (
              <Users
                users={bootstrap.users}
                ready={bootstrapReady}
                loading={bootstrapLoading}
                error={bootstrapError}
                onRetry={() => loadBootstrap().catch(handleError)}
                busy={loading}
                onCreate={createUser}
              />
            ) : null}
          </Suspense>
        </ViewBoundary>
      </div>
      <Suspense fallback={null}><OpportunityDrawer
        key={selected?.opportunity?.id ?? "none"}
        detail={selected}
        stages={bootstrap.stages}
        users={bootstrap.users}
        busy={loading}
        onClose={() => {
          detailRequest.current += 1;
          setStageDecision(null);
          setSelected(null);
        }}
        onMoveStage={(stageKey) => {
          if (stageKey === "WON") {
            setStageDecision({
              stageKey,
              title: "Marcar oportunidad como ganada",
              description:
                "El negocio pasará al historial de cierres y conservará toda su actividad comercial.",
              confirmLabel: "Confirmar como ganada",
              reason: "",
            });
            return;
          }
          if (stageKey === "LOST") {
            setStageDecision({
              stageKey,
              title: "Marcar oportunidad como perdida",
              description:
                "Registre el motivo para que el equipo pueda analizar y mejorar la conversión.",
              confirmLabel: "Confirmar pérdida",
              reason: "",
            });
            return;
          }
          mutate(
            () =>
              api(
                `/api/crm/v1/opportunities/${selected.opportunity.id}/stage`,
                {
                  method: "POST",
                  body: { stageKey, version: selected.opportunity.version },
                },
              ),
            "Etapa actualizada",
          );
        }}
        onSave={(patch) =>
          mutate(
            () =>
              api(`/api/crm/v1/opportunities/${selected.opportunity.id}`, {
                method: "PATCH",
                body: { version: selected.opportunity.version, patch },
              }),
            "Oportunidad actualizada",
          )
        }
        onCreateTask={(task) =>
          mutate(
            () =>
              api(
                `/api/crm/v1/opportunities/${selected.opportunity.id}/tasks`,
                { method: "POST", body: task },
              ),
            "Tarea creada",
          )
        }
        onCompleteTask={(id, version) =>
          mutate(
            () =>
              api(`/api/crm/v1/tasks/${id}/complete`, {
                method: "POST",
                body: { version },
              }),
            "Tarea completada",
          )
        }
        onAddNote={(body) =>
          mutate(
            () =>
              api(
                `/api/crm/v1/opportunities/${selected.opportunity.id}/notes`,
                { method: "POST", body: { body } },
              ),
            "Nota registrada",
          )
        }
        onCreateQuote={(quote) =>
          mutate(
            () =>
              api(
                `/api/crm/v1/opportunities/${selected.opportunity.id}/quotes`,
                { method: "POST", body: quote },
              ),
            "Cotización creada con precios validados",
          )
        }
      /></Suspense>
      {stageDecision ? (
        <Suspense fallback={null}><ConfirmDialog
          title={stageDecision.title}
          description={stageDecision.description}
          confirmLabel={stageDecision.confirmLabel}
          tone={stageDecision.stageKey === "LOST" ? "danger" : "primary"}
          busy={loading}
          inputLabel={
            stageDecision.stageKey === "LOST" ? "Motivo de pérdida" : undefined
          }
          inputHint={
            stageDecision.stageKey === "LOST"
              ? "Sea específico: precio, plazo, competencia u otra razón verificable."
              : undefined
          }
          value={stageDecision.reason}
          onValueChange={(reason) =>
            setStageDecision((current) => ({ ...current, reason }))
          }
          onClose={() => setStageDecision(null)}
          onConfirm={() => {
            const decision = stageDecision;
            setStageDecision(null);
            mutate(
              () =>
                api(
                  `/api/crm/v1/opportunities/${selected.opportunity.id}/stage`,
                  {
                    method: "POST",
                    body: {
                      stageKey: decision.stageKey,
                      reason: decision.reason || null,
                      version: selected.opportunity.version,
                    },
                  },
                ),
              decision.stageKey === "WON"
                ? "Oportunidad marcada como ganada"
                : "Oportunidad marcada como perdida",
            );
          }}
        /></Suspense>
      ) : null}
    </Shell>
  );
}
