import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("../api.js", () => ({
  api: vi.fn(),
  queryString: vi.fn(() => "page=1&pageSize=25"),
}));
vi.mock("./Shell.jsx", () => ({
  PageHeader: ({ title, description, actions }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

import { api } from "../api.js";
import { Companies } from "./Companies.jsx";

const list = {
  items: [{
    id: "company-1",
    name: "Aqua Norte SAC",
    taxId: "20123456789",
    phoneE164: "+51987654321",
    email: "ventas@aquanorte.pe",
    district: "Miraflores",
    contacts: 2,
    opportunities: 3,
  }],
  total: 26,
  page: 1,
  pageSize: 25,
};

beforeEach(() => { api.mockReset(); api.mockResolvedValue(list); });
afterEach(cleanup);

describe("Empresas", () => {
  it("reserva el directorio desde el primer render", () => {
    api.mockImplementation(() => new Promise(() => {}));
    render(<Companies user={{ role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByRole("status", { name: "Cargando empresas" })).toBeVisible();
  });

  it("mantiene búsqueda, tabla y paginación accesibles", async () => {
    const user = userEvent.setup();
    render(<Companies user={{ role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole("cell", { name: /Aqua Norte SAC/ })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Buscar empresas" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Datos de contacto" })).toBeVisible();
    expect(screen.getByText("Página 1 de 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("abre el alta con campos fiscales y comerciales etiquetados", async () => {
    const user = userEvent.setup();
    render(<Companies user={{ role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);
    await screen.findByText("Aqua Norte SAC");
    await user.click(screen.getByRole("button", { name: "Nueva empresa" }));

    expect(screen.getByRole("dialog", { name: "Nueva empresa" })).toBeVisible();
    expect(screen.getByText("Datos de la empresa")).toBeVisible();
    expect(screen.getByText("Razón social")).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar empresa" })).toBeVisible();
  });

  it("muestra contactos vinculados en la ficha de detalle", async () => {
    const user = userEvent.setup();
    api.mockImplementation((url) => url === "/api/crm/v1/companies/company-1"
      ? Promise.resolve({ company: { ...list.items[0], version: 1 }, contacts: [{ id: "contact-1", displayName: "María López", jobTitle: "Compras", phoneE164: "+51911111111" }] })
      : Promise.resolve(list));
    render(<Companies user={{ role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Abrir Aqua Norte SAC" }));
    expect(await screen.findByRole("dialog", { name: "Aqua Norte SAC" })).toBeVisible();
    expect(screen.getByText("Contactos vinculados")).toBeVisible();
    expect(screen.getByText("María López")).toBeVisible();
  });
});
