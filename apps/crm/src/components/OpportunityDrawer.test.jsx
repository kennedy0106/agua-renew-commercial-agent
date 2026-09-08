import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./Drawer.jsx", () => ({
  Drawer: ({ label, children }) => <aside aria-label={label}>{children}</aside>,
}));

import { OpportunityDrawer } from "./OpportunityDrawer.jsx";

afterEach(cleanup);

const detail = {
  opportunity: {
    id: "op-1",
    contactName: "María López",
    title: "Oportunidad · María López",
    stageKey: "NEW",
    stageName: "Nuevo",
    stageColor: "#1497ff",
    ownerId: null,
    nextAction: "",
    nextActionAt: null,
    estimatedValue: null,
  },
  messages: [
    {
      id: "message-1",
      direction: "inbound",
      content: "Quiero una cotización",
      sourceCreatedAt: "2026-09-02T15:00:00Z",
    },
  ],
  tasks: [],
  notes: [],
  quotes: [],
};

const props = {
  detail,
  stages: [{ id: "stage-1", key: "NEW", name: "Nuevo" }],
  users: [{ id: "user-1", displayName: "Ana Torres" }],
  onClose: vi.fn(),
  onMoveStage: vi.fn(),
  onSave: vi.fn(),
  onCreateTask: vi.fn(),
  onCompleteTask: vi.fn(),
  onAddNote: vi.fn(),
  onCreateQuote: vi.fn(),
  busy: false,
};

describe("Detalle de oportunidad", () => {
  it("expone conversación, gestión y cotizaciones como tabs accesibles", async () => {
    const user = userEvent.setup();
    const { container } = render(<OpportunityDrawer {...props} />);

    expect(screen.getByRole("complementary", { name: "Oportunidad de María López" })).toBeVisible();
    expect(screen.getByText("Quiero una cotización")).toBeVisible();
    expect(screen.getByText("Prospecto")).toBeVisible();
    expect(container.querySelector("select")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Gestión" }));
    expect(screen.getByRole("heading", { name: "Ficha comercial" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Responsable" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Elegir fecha de seguimiento" }));
    expect(screen.getByRole("grid", { name: /Calendario de/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mes anterior" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Listo" }));
    await user.click(screen.getByRole("tab", { name: "Cotizaciones" }));
    expect(screen.getByRole("heading", { name: "Nueva cotización" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Producto 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Añadir producto" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Elegir válida hasta" }));
    expect(screen.getByRole("grid", { name: /Calendario de/i })).toBeVisible();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it("separa eventos y medios de las burbujas conversacionales", () => {
    render(<OpportunityDrawer {...props} detail={{
      ...detail,
      messages: [
        { id: "event", direction: "outbound", messageKind: "event", eventKind: "comment_context", eventTitle: "Conversación iniciada desde un comentario", eventLink: "https://facebook.com/post/123", sourceCreatedAt: "2026-09-02T14:00:00Z" },
        { id: "media", direction: "inbound", messageKind: "media", displayContent: "Imagen adjunta", actorLabel: "Prospecto", sourceCreatedAt: "2026-09-02T15:00:00Z" },
      ],
    }} />);
    expect(screen.getByRole("note")).toHaveTextContent("Conversación iniciada desde un comentario");
    expect(screen.getByRole("link", { name: "Abrir publicación de Meta" })).toHaveAttribute("href", "https://facebook.com/post/123");
    expect(screen.getByText("Imagen adjunta")).toBeVisible();
  });
});
