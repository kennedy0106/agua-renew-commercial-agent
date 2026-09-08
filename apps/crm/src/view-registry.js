import {
  BellRing,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  ContactRound,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Mail,
  UsersRound,
  Workflow,
} from "lucide-react";

export const VIEW_REGISTRY = [
  { id: "dashboard", title: "Resumen", icon: LayoutDashboard },
  { id: "intervention", title: "Bandeja Meta", icon: Inbox },
  { id: "opportunities", title: "Oportunidades", icon: ChartNoAxesCombined },
  { id: "contacts", title: "Contactos", icon: ContactRound },
  { id: "companies", title: "Empresas", icon: Building2 },
  { id: "tasks", title: "Tareas", icon: ListTodo },
  { id: "calendar", title: "Calendario", icon: CalendarDays },
  { id: "revenue", title: "Ingresos", icon: CircleDollarSign },
  { id: "communications", title: "Comunicaciones", icon: Mail },
  {
    id: "automations",
    title: "Automatizaciones",
    icon: Workflow,
    roles: ["ADMIN", "SUPERVISOR"],
  },
  { id: "reports", title: "Reportes", icon: BellRing },
  { id: "users", title: "Equipo", icon: UsersRound, roles: ["ADMIN"] },
];

export const VIEW_BY_ID = Object.fromEntries(
  VIEW_REGISTRY.map((view) => [view.id, view]),
);

export function isKnownView(viewId) {
  return Boolean(VIEW_BY_ID[viewId]);
}

export function canAccessView(role, viewId) {
  const view = VIEW_BY_ID[viewId];
  return Boolean(view && (!view.roles || view.roles.includes(role)));
}

export function viewsForRole(role) {
  return VIEW_REGISTRY.filter((view) => canAccessView(role, view.id));
}

export function viewFromLocation(hash = window.location.hash) {
  const candidate = hash.replace(/^#\/?/, "").split(/[?&]/)[0];
  return isKnownView(candidate) ? candidate : "dashboard";
}
