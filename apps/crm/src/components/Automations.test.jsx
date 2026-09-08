import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("../api.js", () => ({ api: vi.fn() }));
vi.mock("./Shell.jsx", () => ({ PageHeader: ({ title, description, actions }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header> }));

import { api } from "../api.js";
import { Automations } from "./Automations.jsx";

const rules = {
  total: 2,
  items: [
    { id: "rule-1", name: "Alertar inactividad", trigger_type: "OPPORTUNITY_IDLE", action_type: "NOTIFY_OWNER", active: true, version: 1 },
    { id: "rule-2", name: "Escalar vencimientos", trigger_type: "TASK_OVERDUE", action_type: "NOTIFY_SUPERVISOR", active: false, version: 2 },
  ],
};
const props = { user: { role: "ADMIN" }, notify: vi.fn(), onError: vi.fn() };

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((path) => Promise.resolve(path.endsWith("/run") ? { overdue: 1, idle: 2 } : rules));
});
afterEach(cleanup);

describe("Automatizaciones V2", () => {
  it("presenta guardas, estados y ejecución con permisos", async () => {
    const user = userEvent.setup();
    render(<Automations {...props} />);
    expect(await screen.findByText("Alertar inactividad")).toBeVisible();
    expect(screen.getByRole("region", { name: "Protecciones de automatización" })).toBeVisible();
    expect(screen.getByText("1 reglas activas")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Ejecutar ahora" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/crm/v1/automations/run", { method: "POST", body: {} }));
  });

  it("abre el formulario con selects anclados y campos obligatorios", async () => {
    const user = userEvent.setup();
    render(<Automations {...props} />);
    await screen.findByText("Alertar inactividad");
    await user.click(screen.getByRole("button", { name: "Nueva regla" }));
    expect(screen.getByRole("dialog", { name: "nueva automatización" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Cuándo" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Qué hacer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Crear regla" })).toBeVisible();
  });

  it("no presenta ceros como datos reales cuando falla la carga", async () => {
    api.mockRejectedValueOnce(new Error("Servicio no disponible"));
    render(<Automations {...props} />);
    expect(await screen.findByText("Estado no disponible")).toBeVisible();
    expect(screen.getByText("Disponibilidad desconocida")).toBeVisible();
    expect(screen.getByText("No se pudieron cargar las reglas")).toBeVisible();
  });
});
