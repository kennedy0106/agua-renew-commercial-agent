import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("../api.js", () => ({ api: vi.fn(), queryString: vi.fn(() => "from=x&to=y") }));
vi.mock("./Shell.jsx", () => ({
  PageHeader: ({ title, description, actions }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

import { api } from "../api.js";
import { Calendar } from "./Calendar.jsx";

const event = {
  id: "event-1",
  title: "Revisión de propuesta",
  event_type: "FOLLOW_UP",
  starts_at: "2026-09-04T15:00:00.000Z",
  ends_at: "2026-09-04T16:00:00.000Z",
  assigned_to: "user-1",
  assignee_name: "Ana Torres",
  status: "SCHEDULED",
  version: 1,
};
const props = {
  user: { id: "user-1", role: "ADMIN" },
  users: [{ id: "user-1", displayName: "Ana Torres" }],
  notify: vi.fn(),
  onError: vi.fn(),
  onOpenTasks: vi.fn(),
};

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ events: [event], tasks: [] });
});
afterEach(cleanup);

describe("Calendario", () => {
  it("expone navegación, filtro y agenda con nombres accesibles", async () => {
    render(<Calendar {...props} />);
    expect((await screen.findAllByRole("button", { name: /Abrir evento: Revisión de propuesta/ }))[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "Mes anterior" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Responsable" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Agenda del mes" })).toBeVisible();
  });

  it("abre el editor con selects y calendarios personalizados", async () => {
    const user = userEvent.setup();
    render(<Calendar {...props} />);
    await user.click(screen.getByRole("button", { name: "Nuevo evento" }));

    expect(screen.getByRole("dialog", { name: "nuevo evento" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Tipo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Elegir inicio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Elegir fin" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Programar evento" })).toBeVisible();
  });
});
