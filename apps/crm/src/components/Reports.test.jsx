import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("./Shell.jsx", () => ({
  PageHeader: ({ title, description, actions }) => (
    <header><h1>{title}</h1><p>{description}</p>{actions}</header>
  ),
}));

import { Reports } from "./Reports.jsx";

const report = {
  revenue: { ordered: 12500, collected: 9000 },
  quotes: { total: 10, accepted: 4, quoted: 18000 },
  cycle: { avgDays: 3.2 },
  byStage: [{ stage_key: "new", name: "Nuevo", total: 20, value: 4500 }],
  byOwner: [{ owner: "Ana Torres", total: 8, won: 3, value: 5200 }],
  byChannel: [{ channel: "facebook_messenger", total: 12 }],
  lossReasons: [],
  sla: { overdue: 2, completed: 7, total: 9 },
};

afterEach(cleanup);

describe("Reportes comerciales", () => {
  it("presenta indicadores y equivalentes tabulares con datos reales", () => {
    render(<Reports data={report} loading={false} range={{ from: "", to: "" }} onRangeChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Reportes comerciales" })).toBeVisible();
    expect(screen.getByText(/12,500/)).toBeVisible();
    expect(screen.getByText("40%")).toBeVisible();
    expect(screen.getByRole("table", { name: "Distribución por etapa" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Actividad por responsable" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Ana Torres" })).toBeInTheDocument();
  });

  it("usa un calendario diseñado y comunica rangos inválidos", async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const { rerender, container } = render(
      <Reports data={report} loading={false} range={{ from: "", to: "" }} onRangeChange={onRangeChange} />,
    );

    expect(container.querySelector('input[type="date"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Elegir desde" }));
    expect(screen.getByRole("grid", { name: /Calendario de/ })).toBeVisible();
    await waitFor(() => expect(document.activeElement).toHaveAttribute("role", "gridcell"));
    const focusedDay = document.activeElement.getAttribute("aria-label");
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.activeElement.getAttribute("aria-label")).not.toBe(focusedDay));

    rerender(<Reports data={report} loading={false} range={{ from: "2026-09-03", to: "2026-09-01" }} onRangeChange={onRangeChange} />);
    expect(screen.getByRole("alert")).toHaveTextContent("La fecha final debe ser igual o posterior");
    expect(screen.queryByText("Ingresos confirmados")).not.toBeInTheDocument();
  });

  it("no presenta una conversión vacía como éxito", () => {
    render(<Reports data={{ ...report, quotes: { total: 0, accepted: 0, quoted: 0 } }} loading={false} range={{ from: "", to: "" }} onRangeChange={vi.fn()} />);
    expect(screen.getByText("Sin base")).toBeVisible();
  });

  it("ofrece recuperación cuando falla la carga inicial", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Reports data={null} loading={false} error="La red no respondió" onRetry={onRetry} range={{ from: "", to: "" }} onRangeChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("La red no respondió");
    expect(screen.queryByLabelText("Cargando reportes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
