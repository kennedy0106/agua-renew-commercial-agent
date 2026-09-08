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
  PageHeader: ({ title, description, actions }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </header>
  ),
}));

import { api, queryString } from "../api.js";
import { Contacts } from "./Contacts.jsx";

const list = {
  items: [
    {
      id: "contact-1",
      displayName: "María López",
      district: "Miraflores",
      companyName: "Agua Norte",
      jobTitle: "Compras",
      phoneE164: "+51987654321",
      email: "maria@example.com",
      ownerName: "Ana Torres",
    },
  ],
  total: 26,
  page: 1,
  pageSize: 25,
};

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue(list);
  queryString.mockClear();
});
afterEach(cleanup);

describe("Contactos", () => {
  it("reserva la lista desde el primer render", () => {
    api.mockImplementation(() => new Promise(() => {}));
    render(
      <Contacts user={{ role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />,
    );
    expect(screen.getByRole("status", { name: "Cargando contactos" })).toBeVisible();
  });

  it("mantiene búsqueda, tabla y paginación accesibles", async () => {
    const user = userEvent.setup();
    render(
      <Contacts
        user={{ role: "ADMIN" }}
        notify={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(await screen.findByRole("cell", { name: /María López/ })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Buscar contactos" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Empresa y cargo" })).toBeVisible();
    expect(screen.getByText("Página 1 de 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("abre el alta de contacto con campos etiquetados", async () => {
    const user = userEvent.setup();
    render(
      <Contacts
        user={{ role: "ADMIN" }}
        notify={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await screen.findByText("María López");
    await user.click(screen.getByRole("button", { name: "Nuevo contacto" }));

    expect(screen.getByRole("dialog", { name: "Nuevo contacto" })).toBeVisible();
    expect(screen.getByText("Nombre completo")).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar contacto" })).toBeVisible();
  });

  it("filtra por responsable usando el contrato existente", async () => {
    const user = userEvent.setup();
    render(
      <Contacts
        user={{ role: "ADMIN" }}
        users={[{ id: "user-1", displayName: "Ana Torres", active: true }]}
        notify={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await screen.findByText("María López");

    await user.click(screen.getByRole("combobox", { name: "Responsable" }));
    await user.click(screen.getByRole("option", { name: "Ana Torres" }));

    await waitFor(() =>
      expect(queryString).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: "user-1", page: 1 }),
      ),
    );
  });

  it("muestra un flujo de coincidencias claro y vuelve sin cerrar el contacto", async () => {
    const user = userEvent.setup();
    api.mockImplementation((url) => {
      if (url.includes("/duplicates")) return Promise.resolve({ candidates: [] });
      if (url === "/api/crm/v1/contacts/contact-1") {
        return Promise.resolve({
          contact: { ...list.items[0], version: 1 },
          opportunities: [],
          tasks: [],
          activities: [],
        });
      }
      return Promise.resolve(list);
    });
    render(
      <Contacts
        user={{ role: "ADMIN" }}
        notify={vi.fn()}
        onError={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Abrir María López" }));
    await user.click(await screen.findByRole("button", { name: "Revisar coincidencias" }));
    expect(await screen.findByText("No encontramos coincidencias seguras")).toBeVisible();
    expect(screen.getByText("Elegir duplicados")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Volver al contacto" }));
    await waitFor(() => expect(screen.queryByText("No encontramos coincidencias seguras")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "María López" })).toBeVisible();
  });
});
