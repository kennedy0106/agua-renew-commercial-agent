import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("./Shell.jsx", () => ({ PageHeader: ({ title, description, actions }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header> }));

import { Users } from "./Users.jsx";

const users = [
  { id: "admin-1", displayName: "Ana Torres", email: "ana@example.com", role: "ADMIN", active: true },
  { id: "advisor-1", displayName: "Luis Ramos", email: "luis@example.com", role: "ADVISOR", active: false },
];

afterEach(cleanup);

describe("Equipo comercial", () => {
  it("no convierte la carga inicial en un equipo vacío", () => {
    render(<Users users={[]} ready={false} loading onCreate={vi.fn()} busy={false} />);
    expect(screen.getByText("Equipo en carga")).toBeVisible();
    expect(screen.getByLabelText("Cargando equipo comercial")).toBeVisible();
    expect(screen.queryByText("0 integrantes")).not.toBeInTheDocument();
  });

  it("distingue un error inicial de una actualización en curso", () => {
    render(<Users users={[]} ready={false} loading={false} error="Sin conexión" onRetry={vi.fn()} onCreate={vi.fn()} busy={false} />);
    expect(screen.getByText("Equipo no disponible")).toBeVisible();
    expect(screen.getByText("No disponible")).toBeVisible();
    expect(screen.queryByText("Actualizando")).not.toBeInTheDocument();
  });

  it("resume y alinea el directorio en una tabla semántica", () => {
    render(<Users users={users} onCreate={vi.fn()} busy={false} />);
    expect(screen.getByRole("heading", { name: "Equipo comercial" })).toBeVisible();
    expect(screen.getByText("2 integrantes")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Correo" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "ana@example.com" })).toBeVisible();
    expect(screen.getByText("Inactivo")).toBeVisible();
  });

  it("crea usuarios con un selector de rol accesible", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<Users users={users} onCreate={onCreate} busy={false} />);
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveAttribute("aria-expanded", "true");
    await user.type(screen.getByRole("textbox", { name: /Nombre/ }), "Marta Díaz");
    await user.type(screen.getByRole("textbox", { name: /Correo/ }), "marta@example.com");
    await user.click(screen.getByRole("combobox", { name: "Rol del nuevo usuario" }));
    await user.click(screen.getByRole("option", { name: "Supervisor" }));
    await user.type(screen.getByLabelText(/Contraseña temporal/), "clave-segura-123");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Marta Díaz", role: "SUPERVISOR" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Nuevo usuario" })).toHaveFocus());
  });

  it("conserva el formulario cuando la creación falla", async () => {
    const user = userEvent.setup();
    render(<Users users={users} onCreate={vi.fn().mockResolvedValue(false)} busy={false} />);
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await user.type(screen.getByRole("textbox", { name: /Nombre/ }), "Marta Díaz");
    await user.type(screen.getByRole("textbox", { name: /Correo/ }), "marta@example.com");
    await user.type(screen.getByLabelText(/Contraseña temporal/), "clave-segura-123");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Nombre/ })).toHaveValue("Marta Díaz");
  });

  it("bloquea todos los controles mientras crea", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Users users={users} onCreate={vi.fn()} busy={false} />);
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    rerender(<Users users={users} onCreate={vi.fn()} busy />);
    expect(document.querySelector("#renew-create-user")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox", { name: /Nombre/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Rol del nuevo usuario" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Creando usuario…" })).toBeDisabled();
  });
});
