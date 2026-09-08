import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api.js";
import { ThemeProvider } from "./ThemeProvider.jsx";
import { PageHeader, Shell } from "./Shell.jsx";

vi.mock("../api.js", () => ({ api: vi.fn(), queryString: vi.fn(() => "") }));

describe("AppShell accesible", () => {
  it("filtra navegación por rol y permite saltar al contenido", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Shell
          user={{ id: "advisor-1", role: "ADVISOR", displayName: "Asesor ReNew" }}
          activeView="dashboard"
          notifications={0}
          onNavigate={vi.fn()}
          onLogout={vi.fn()}
          onOpenSearchResult={vi.fn()}
        >
          <h1>Contenido operativo</h1>
        </Shell>
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Resumen" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Automatizaciones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equipo" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Saltar al contenido" }));
    expect(document.activeElement).toHaveAttribute("id", "crm-main");
  });

  it("habilita el shell V2 con un único control de navegación", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ThemeProvider>
        <Shell
          user={{ id: "advisor-1", role: "ADVISOR", displayName: "Asesor ReNew" }}
          activeView="dashboard"
          notifications={2}
          onNavigate={vi.fn()}
          onLogout={vi.fn()}
          onOpenSearchResult={vi.fn()}
        >
          <h1>Resumen V2</h1>
        </Shell>
      </ThemeProvider>,
    );

    const view = within(container);
    expect(container.querySelector(".renew-shell-v2")).toBeInTheDocument();
    expect(container.querySelector(".renew-sidebar-v2")).toBeInTheDocument();
    expect(view.getByRole("button", { name: /^Resumen/ })).toHaveAttribute("aria-current", "page");
    expect(view.queryByRole("button", { name: "Equipo" })).not.toBeInTheDocument();
    const toggle = view.getByRole("button", { name: /navegación/ });
    expect(toggle).toHaveAttribute("aria-expanded");
    expect(view.queryByRole("button", { name: "Toggle Sidebar" })).not.toBeInTheDocument();
    const initialState = toggle.getAttribute("aria-expanded");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", initialState === "true" ? "false" : "true");
  });

  it("permite buscar directamente desde el encabezado sin abrir un diálogo", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ items: [] });
    render(
      <ThemeProvider>
        <Shell
          user={{ id: "admin-1", role: "ADMIN", displayName: "Administrador Agua ReNew" }}
          activeView="dashboard"
          notifications={0}
          onNavigate={vi.fn()}
          onLogout={vi.fn()}
          onOpenSearchResult={vi.fn()}
        >
          <PageHeader title="Resumen" description="Actividad comercial" />
        </Shell>
      </ThemeProvider>,
    );

    const search = screen.getByRole("combobox", { name: "Buscar clientes, oportunidades y empresas" });
    expect(search).toHaveAttribute("placeholder", "Buscar clientes, oportunidades…");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.type(search, "Lu");
    expect(search).toHaveValue("Lu");
    expect(search).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(search).toHaveValue("");
    search.blur();
    await user.keyboard("/");
    expect(search).toHaveFocus();
  });
});
