import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("../api.js", () => ({
  api: vi.fn(),
  queryString: vi.fn(({ page }) => `page=${page}&pageSize=25`),
}));
vi.mock("./Shell.jsx", () => ({
  PageHeader: ({ title, description, actions }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

import { api, queryString } from "../api.js";
import { Communications } from "./Communications.jsx";

const templates = {
  total: 1,
  items: [{ id: "template-1", name: "Continuidad por WhatsApp", channel: "WHATSAPP", subject: "", body: "Hola" }],
};
const messages = { total: 51, page: 1, pageSize: 25, items: [] };
const props = { user: { role: "ADMIN" }, notify: vi.fn(), onError: vi.fn() };

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((path) => Promise.resolve(path.includes("communication-templates") ? templates : messages));
  queryString.mockClear();
});
afterEach(cleanup);

describe("Comunicaciones", () => {
  it("presenta protecciones, plantillas y paginación accesible", async () => {
    const user = userEvent.setup();
    render(<Communications {...props} />);

    expect(await screen.findByText("Continuidad por WhatsApp")).toBeVisible();
    expect(screen.getByRole("region", { name: "Protecciones de comunicación" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Paginación de comunicaciones" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(queryString).toHaveBeenLastCalledWith({ page: 2, pageSize: 25 }));
  });

  it("abre el compositor con selects personalizados", async () => {
    const user = userEvent.setup();
    render(<Communications {...props} />);
    await screen.findByText("Continuidad por WhatsApp");
    await user.click(screen.getByRole("button", { name: "Crear borrador" }));

    expect(screen.getByRole("dialog", { name: "preparar comunicación" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Plantilla" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Canal" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeVisible();
  });
});
