import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("../api.js", () => ({ api: vi.fn(), queryString: vi.fn(() => "page=1&pageSize=50") }));
vi.mock("./Shell.jsx", () => ({ PageHeader: ({ title, description }) => <header><h1>{title}</h1><p>{description}</p></header> }));

import { api, queryString } from "../api.js";
import { Tasks } from "./Tasks.jsx";

const list = {
  items: [{
    id: "task-1",
    title: "Confirmar cantidad y envío",
    description: "Validar disponibilidad",
    status: "OPEN",
    priority: "HIGH",
    due_at: "2026-09-03T15:00:00.000Z",
    assigned_to: "user-1",
    assignee_name: "Ana Torres",
    contact_name: "María López",
    opportunity_title: "Bidón 20 L",
    version: 1,
  }],
  total: 51,
  page: 1,
  pageSize: 50,
  buckets: { overdue: 1, today: 2, upcoming: 3, noDue: 4 },
};
const props = { user: { role: "ADMIN" }, users: [{ id: "user-1", displayName: "Ana Torres" }], notify: vi.fn(), onError: vi.fn() };

beforeEach(() => { api.mockReset(); api.mockResolvedValue(list); queryString.mockClear(); });
afterEach(cleanup);

describe("Tareas", () => {
  it("mantiene grupos, filtros y paginación accesibles", async () => {
    const user = userEvent.setup();
    render(<Tasks {...props} />);
    expect(await screen.findByRole("button", { name: "Abrir Confirmar cantidad y envío" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Grupos de agenda" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Buscar tareas" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Prioridad" })).toBeVisible();
    expect(screen.getByText("Página 1 de 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Próximas.*Siguientes acciones.*3/ }));
    await waitFor(() => expect(queryString).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: "UPCOMING" })));
  });

  it("completa una tarea desde su control explícito", async () => {
    const user = userEvent.setup();
    render(<Tasks {...props} />);
    await user.click(await screen.findByRole("button", { name: "Completar Confirmar cantidad y envío" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/crm/v1/tasks/task-1/complete", expect.objectContaining({ method: "POST" })));
  });

  it("abre la ficha con calendario y controles personalizados", async () => {
    const user = userEvent.setup();
    render(<Tasks {...props} />);
    await user.click(await screen.findByRole("button", { name: "Abrir Confirmar cantidad y envío" }));

    expect(screen.getByRole("dialog", { name: "Editar tarea" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Elegir vencimiento" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Prioridad" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeVisible();
  });
});
