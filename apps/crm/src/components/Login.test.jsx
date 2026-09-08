import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api.js", () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
}));

import { api, setCsrfToken } from "../api.js";
import { Login } from "./Login.jsx";
import { ThemeProvider } from "./ThemeProvider.jsx";

function renderLogin(onAuthenticated = vi.fn()) {
  render(<ThemeProvider><Login onAuthenticated={onAuthenticated} /></ThemeProvider>);
  return onAuthenticated;
}

describe("Login", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("inicia sin exponer un correo y ofrece campos accesibles", () => {
    renderLogin();

    expect(screen.getByRole("textbox", { name: /Correo corporativo/ })).toHaveValue("");
    expect(screen.getByLabelText(/Contraseña/)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled();
    expect(screen.getByText("Meta continúa en modo observación")).toBeVisible();
  });

  it("muestra y vuelve a ocultar la contraseña sin reemplazar su valor", async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText(/Contraseña/);

    await user.type(password, "Una-clave-segura-2026");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("Una-clave-segura-2026");

    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("autentica una sola vez, guarda CSRF y entrega el usuario", async () => {
    const user = userEvent.setup();
    const authenticated = vi.fn();
    api.mockResolvedValueOnce({ csrfToken: "csrf-1", user: { id: "user-1", role: "ADMIN" } });
    renderLogin(authenticated);

    await user.type(screen.getByRole("textbox", { name: /Correo corporativo/ }), " admin@aguarenew.local ");
    await user.type(screen.getByLabelText(/Contraseña/), "Una-clave-segura-2026");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/crm/v1/auth/login", {
      method: "POST",
      body: { email: "admin@aguarenew.local", password: "Una-clave-segura-2026" },
    }));
    expect(setCsrfToken).toHaveBeenCalledWith("csrf-1");
    expect(authenticated).toHaveBeenCalledWith({ id: "user-1", role: "ADMIN" });
  });

  it("bloquea los controles mientras verifica y evita un segundo envío", async () => {
    const user = userEvent.setup();
    let resolveLogin;
    api.mockReturnValueOnce(new Promise((resolve) => { resolveLogin = resolve; }));
    renderLogin();

    await user.type(screen.getByRole("textbox", { name: /Correo corporativo/ }), "admin@aguarenew.local");
    await user.type(screen.getByLabelText(/Contraseña/), "Una-clave-segura-2026");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Correo corporativo/ })).toBeDisabled();
    expect(api).toHaveBeenCalledTimes(1);

    resolveLogin({ csrfToken: "csrf-2", user: { id: "user-2", role: "ADVISOR" } });
    await waitFor(() => expect(setCsrfToken).toHaveBeenCalledWith("csrf-2"));
  });

  it("presenta el error del servidor y conserva los datos para reintentar", async () => {
    const user = userEvent.setup();
    api.mockRejectedValueOnce(new Error("Correo o contraseña incorrectos"));
    renderLogin();

    const email = screen.getByRole("textbox", { name: /Correo corporativo/ });
    await user.type(email, "asesor@aguarenew.local");
    await user.type(screen.getByLabelText(/Contraseña/), "Una-clave-segura-2026");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
    expect(email).toHaveValue("asesor@aguarenew.local");
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled();
  });

  it("cambia y persiste el tema desde el acceso", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Usar tema oscuro" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("agua-renew-crm-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Usar tema claro" })).toBeVisible();
  });
});
