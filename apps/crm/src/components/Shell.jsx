import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Bell, Building2, ChartNoAxesCombined,
  ContactRound, LogOut, Mail, Search, Settings2, Sparkles, X,
} from "lucide-react";
import { api, queryString } from "../api.js";
import { viewsForRole } from "../view-registry.js";
import { AnimatedThemeToggler } from "./ui/animated-theme-toggler.jsx";
import { Avatar, AvatarFallback } from "./ui/avatar.jsx";
import { Button } from "./ui/button.jsx";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "./ui/dropdown-menu.jsx";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarSeparator, useSidebar,
} from "./ui/sidebar.jsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip.jsx";
import { useTheme } from "./ThemeProvider.jsx";

const ShellContext = createContext(null);

const roleLabel = { ADMIN: "Administrador", SUPERVISOR: "Supervisor", ADVISOR: "Asesor" };

function initialSidebarOpen() {
  const saved = window.localStorage.getItem("agua-renew-crm-sidebar");
  if (saved) return saved === "expanded";
  return window.matchMedia("(min-width: 1280px)").matches;
}

export function Shell({
  user, activeView, onNavigate, notifications, onLogout, onOpenSearchResult, children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);
  const setOpen = (open) => {
    setSidebarOpen(open);
    window.localStorage.setItem("agua-renew-crm-sidebar", open ? "expanded" : "collapsed");
  };
  return (
    <ShellContext.Provider value={{ user, notifications, onNavigate, onOpenSearchResult, onLogout }}>
      <TooltipProvider delayDuration={250}>
        <SidebarProvider
          open={sidebarOpen}
          onOpenChange={setOpen}
          className="renew-shell-v2"
          style={{
            "--sidebar-width": "244px",
            "--sidebar-width-icon": "102px",
          }}
        >
        <a
          className="renew-skip-link"
          href="#crm-main"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("crm-main")?.focus();
          }}
        >
          Saltar al contenido
        </a>
        <RenewSidebar
          user={user}
          activeView={activeView}
          notifications={notifications}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
        <SidebarInset id="crm-main" tabIndex="-1" className="renew-main">{children}</SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </ShellContext.Provider>
  );
}

function RenewSidebar({ user, activeView, notifications, onNavigate, onLogout }) {
  const { setOpen, setOpenMobile, state } = useSidebar();
  const available = viewsForRole(user.role);
  const handleSidebarToggle = () => {
    setOpen(state !== "expanded");
  };
  const navigate = (view) => {
    onNavigate(view);
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" mobileBehavior="fixed" className="renew-sidebar renew-sidebar-v2" aria-label="Menú del CRM">
      <SidebarHeader className="renew-sidebar-header">
        <button
          type="button"
          className="renew-brand"
          aria-label={state === "expanded" ? "Contraer navegación" : "Expandir navegación"}
          aria-expanded={state === "expanded"}
          onClick={handleSidebarToggle}
        >
          <img className="renew-wordmark" src="/brand/logo-renew.svg" alt="" />
          <img className="renew-mark" src="/brand/logo-gotita.svg" alt="" />
        </button>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {available.map((item) => {
                const NavIcon = item.icon;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeView === item.id}
                      tooltip={item.title}
                      onClick={() => navigate(item.id)}
                      aria-current={activeView === item.id ? "page" : undefined}
                    >
                      <NavIcon />
                      <span>{item.title}</span>
                      {item.id === "dashboard" && notifications > 0 ? (
                        <b className="renew-nav-count">{notifications}</b>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle sidebar />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user.displayName} className="renew-profile-trigger">
                  <Avatar>
                    <AvatarFallback>{user.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="renew-profile-copy">
                    <strong>{user.displayName}</strong>
                    <small>{roleLabel[user.role]}</small>
                  </span>
                  <Settings2 className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={14}
                collisionPadding={14}
                className="renew-account-menu"
              >
                <DropdownMenuLabel className="renew-account-summary">
                  <Avatar className="renew-account-avatar">
                    <AvatarFallback>{user.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="renew-account-copy">
                    <strong>{user.displayName}</strong>
                    <small>{roleLabel[user.role]}</small>
                    <span><i aria-hidden="true" /> Sesión activa</span>
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onSelect={onLogout} className="renew-account-logout">
                    <LogOut />
                    <span>
                      <strong>Cerrar sesión</strong>
                      <small>Salir de forma segura</small>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function PageHeader({ title, description, actions, className = "" }) {
  const shell = useContext(ShellContext);
  const titleRef = useRef(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <header className={`renew-page-header renew-page-header-v2 ${className}`.trim()}>
      <div className="renew-page-identity">
        <div>
          <h1 ref={titleRef} tabIndex="-1">{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="renew-workspace-actions">
        <GlobalSearch onSelect={shell?.onOpenSearchResult} />
        <HeaderIcon label="Abrir comunicaciones" onClick={() => shell?.onNavigate("communications")}><Mail /></HeaderIcon>
        <HeaderIcon label={`${shell?.notifications ?? 0} notificaciones pendientes`} onClick={() => shell?.onNavigate("dashboard")}>
          <Bell />
          {shell?.notifications ? <b className="renew-notification-count">{shell.notifications}</b> : null}
        </HeaderIcon>
        {actions ? <div className="renew-page-actions">{actions}</div> : null}
      </div>
    </header>
  );
}

function HeaderIcon({ label, onClick, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" onClick={onClick} aria-label={label} className="renew-header-icon">{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle({ sidebar = false }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="renew-theme-placeholder" aria-hidden="true" />;
  const label = resolvedTheme === "dark" ? "Usar tema claro" : "Usar tema oscuro";
  return (
    <AnimatedThemeToggler
      className={sidebar ? "renew-sidebar-theme" : "renew-theme-toggle"}
      duration={240}
      theme={resolvedTheme}
      onThemeChange={setTheme}
      aria-label={label}
      title={label}
    >{sidebar ? <span>{resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}</span> : null}</AnimatedThemeToggler>
  );
}

function GlobalSearch({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [state, setState] = useState({ loading: false, items: [], error: "" });
  const inputRef = useRef(null);

  useEffect(() => {
    const shortcut = (event) => {
      if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setState({ loading: false, items: [], error: "" });
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const result = await api(`/api/crm/v1/search?${queryString({ q: query, limit: 8 })}`, { signal: controller.signal });
        const items = result.items ?? [];
        setState({ loading: false, items, error: "" });
        setActiveIndex(items.length ? 0 : -1);
      } catch (error) {
        if (error.name !== "AbortError") {
          setState({ loading: false, items: [], error: "No pudimos completar la búsqueda." });
          setActiveIndex(-1);
        }
      }
    }, 240);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const choose = (item) => {
    onSelect?.(item);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.blur();
  };
  const groups = [
    ["opportunity", "Oportunidades", ChartNoAxesCombined],
    ["contact", "Contactos", ContactRound],
    ["company", "Empresas", Building2],
  ];
  const showResults = open && query.trim().length >= 2;
  const activeItemId = activeIndex >= 0 ? `renew-search-option-${activeIndex}` : undefined;

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showResults || !state.items.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
        return (start + direction + state.items.length) % state.items.length;
      });
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(state.items[activeIndex]);
    }
  };

  return (
    <div
      className="renew-global-search"
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Buscar clientes, oportunidades…"
        aria-label="Buscar clientes, oportunidades y empresas"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls="renew-global-search-results"
        aria-activedescendant={showResults ? activeItemId : undefined}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {query ? (
        <button
          type="button"
          className="renew-search-clear"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setQuery("");
            setState({ loading: false, items: [], error: "" });
            setActiveIndex(-1);
            inputRef.current?.focus();
          }}
        >
          <X />
        </button>
      ) : <kbd aria-hidden="true">/</kbd>}
      {showResults ? (
        <div
          id="renew-global-search-results"
          className="renew-search-results"
          role="listbox"
          aria-label="Resultados de búsqueda"
          aria-busy={state.loading}
          onMouseDown={(event) => event.preventDefault()}
      >
          {state.loading ? (
            <div className="renew-search-state" role="status"><Sparkles /> Buscando registros…</div>
          ) : state.error ? (
            <div className="renew-search-state is-error" role="status">{state.error}</div>
          ) : state.items.length ? (
            groups.map(([type, label, ResultIcon]) => {
              const items = state.items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.type === type);
              const headingId = `renew-search-group-${type}`;
              return items.length ? (
                <div className="renew-search-group" role="group" aria-labelledby={headingId} key={type}>
                  <span id={headingId}>{label}</span>
                  {items.map(({ item, index }) => (
                    <button
                      type="button"
                      id={`renew-search-option-${index}`}
                      role="option"
                      aria-selected={activeIndex === index}
                      className="renew-search-option"
                      key={`${item.type}-${item.id}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(item)}
                    >
                      <ResultIcon />
                      <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                    </button>
                  ))}
                </div>
              ) : null;
            })
          ) : (
            <div className="renew-search-state" role="status">Sin coincidencias para “{query}”.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
