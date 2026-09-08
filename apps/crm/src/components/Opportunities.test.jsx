import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./Shell.jsx", () => ({
  PageHeader: ({ title, description, actions }) => (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </header>
  ),
}));
vi.mock("./PipelineBoard.jsx", () => ({
  default: () => <section aria-label="Pipeline cargado">Pipeline cargado</section>,
}));

import { Opportunities } from "./Opportunities.jsx";

afterEach(cleanup);

const stages = [
  { id: "stage-1", key: "NEW", name: "Nuevo", color: "#1497ff" },
  { id: "stage-2", key: "READY", name: "Listo para WhatsApp", color: "#12b886" },
];
const data = {
  items: [
    {
      id: "op-1",
      contactName: "María López",
      phoneE164: "+51987654321",
      sourceChannel: "instagram",
      stageName: "Nuevo",
      stageColor: "#1497ff",
      product: "20l",
      modality: "maquila",
      ownerName: "Ana Torres",
      nextAction: "Llamar",
      nextActionAt: "2026-09-04T15:00:00Z",
    },
  ],
  total: 26,
  page: 1,
  pageSize: 25,
};

function renderOpportunities(overrides = {}) {
  const props = {
    data,
    stages,
    users: [{ id: "user-1", displayName: "Ana Torres" }],
    filters: { q: "", stage: "", ownerId: "", lifecycle: "OPEN", page: 1 },
    onFiltersChange: vi.fn(),
    onSelect: vi.fn(),
    loading: false,
    onMoved: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  render(<Opportunities {...props} />);
  return props;
}

describe("Oportunidades", () => {
  it("muestra una carga perceptible antes de recibir la primera página", () => {
    renderOpportunities({ data: null, loading: true });
    expect(screen.getByRole("status", { name: "Cargando oportunidades" })).toBeVisible();
  });

  it("mantiene una tabla semántica y acciones conectadas", async () => {
    const user = userEvent.setup();
    const props = renderOpportunities();

    expect(screen.getByRole("heading", { name: "Oportunidades" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Contacto" })).toBeVisible();
    expect(screen.getByRole("cell", { name: /María López/ })).toBeVisible();
    expect(screen.getByText("Página 1 de 2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Abrir María López" }));
    expect(props.onSelect).toHaveBeenCalledWith("op-1");

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(props.onFiltersChange).toHaveBeenCalledWith({ page: 2 });
  });

  it("cambia entre lista y pipeline con tabs accesibles", async () => {
    const user = userEvent.setup();
    renderOpportunities();

    const list = screen.getByRole("tab", { name: "Lista" });
    const pipeline = screen.getByRole("tab", { name: "Pipeline" });
    expect(list).toHaveAttribute("aria-selected", "true");

    await user.click(pipeline);
    expect(pipeline).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("region", { name: "Pipeline cargado" })).toBeVisible();
  });
});
