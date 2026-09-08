import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataState, PermissionState, ViewLoadingState } from "./patterns.jsx";

describe("estados operativos compartidos", () => {
  it("reserva la estructura de una vista mientras se carga", () => {
    render(<ViewLoadingState title="Cargando contactos" />);
    expect(screen.getByRole("status", { name: "Cargando contactos" })).toHaveAttribute("aria-busy", "true");
  });

  it("ofrece recuperación en error y retorno cuando no hay permiso", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const goBack = vi.fn();
    const { rerender } = render(<DataState kind="error" description="La conexión falló." onAction={retry} />);
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<PermissionState onReturn={goBack} />);
    expect(screen.getByText("No tiene permiso para ver esta sección")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Volver al Resumen" }));
    expect(goBack).toHaveBeenCalledOnce();
  });
});
