import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.fn();
vi.mock("../api.js", () => ({
  api: (...args) => apiMock(...args),
  queryString: (values) => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== "")).toString(),
}));
vi.mock("./Shell.jsx", () => ({
  PageHeader: ({ title, description, actions }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

import { InterventionInbox } from "./InterventionInbox.jsx";

const item = {
  id: "op-1", contactName: "María López", sourceChannel: "instagram",
  lastMetaMessageAt: "2026-09-02T15:00:00Z", lastMessage: "Necesito agua para mi empresa",
  automationSummary: "Consulta por distribución.", product: "20l", modality: "distribution_agua_renew",
  missingFields: [], priority: "HIGH", ownerId: "owner-2", ownerName: "Supervisor",
  qualificationStatus: "READY", intentLevel: "QUALIFIED", dataQuality: "COMPLETE",
  priorityScore: 80, phoneE164: "+51999999999", version: 3, consentStatus: "UNKNOWN",
  sourceOrigin: "ad_automation", sourceAdId: "2385123456789",
  sourceContext: { adTitle: "Bidones para empresas", ref: "campana-verano" },
  suggestedWhatsappMessage: "Hola, María. Revisé su consulta por bidones para distribución. ¿Coordinamos la cantidad?",
  analysisSource: "ai",
};
const list = {
  items: [item], total: 1, page: 1, pageSize: 20,
  counts: { actionable: 1, ready: 1, needs_data: 0, unassigned: 0, mine: 0, handed_off: 0 },
};
const detail = {
  opportunity: { ...item, title: "Distribución", version: 3 },
  messages: [{ id: "m-1", direction: "inbound", content: "Necesito agua para mi empresa", sourceCreatedAt: "2026-09-02T15:00:00Z" }],
};

describe("Bandeja Meta", () => {
  beforeEach(() => {
    apiMock.mockReset();
    Element.prototype.scrollIntoView ??= vi.fn();
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
  });
  afterEach(cleanup);

  it("carga la cola y abre el enlace directo cuando los datos están completos", async () => {
    apiMock.mockImplementation((url = "") => Promise.resolve(url.includes("intervention-inbox") ? list : detail));
    const user = userEvent.setup();
    render(<InterventionInbox user={{ id: "advisor-1", role: "ADVISOR" }} notify={vi.fn()} onError={vi.fn()} />);

    const lead = await screen.findByRole("button", { name: /María López/ });
    expect(screen.getByRole("list", { name: "Prospectos en Por revisar" })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await user.click(lead);

    expect(await screen.findByRole("heading", { name: "María López" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Diagnóstico comercial" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Origen del contacto" })).toBeVisible();
    expect(screen.getByText("Bidones para empresas")).toBeVisible();
    expect(screen.getByText("2385123456789")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cerrar revisión" })).toBeVisible();
    expect(await screen.findByRole("link", { name: "Abrir WhatsApp" })).toHaveAttribute("href", expect.stringContaining("wa.me/51999999999"));
    expect(apiMock).toHaveBeenCalledWith("/api/crm/v1/opportunities/op-1");
  });

  it("usa el borrador de IA y no exige asignar la oportunidad", async () => {
    const assigned = { ...item, ownerId: null, ownerName: null };
    apiMock.mockImplementation((url = "") => Promise.resolve(url.includes("intervention-inbox")
      ? { ...list, items: [assigned] }
      : { ...detail, opportunity: { ...detail.opportunity, ...assigned } }));
    const user = userEvent.setup();
    render(<InterventionInbox user={{ id: "admin-1", role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /María López/ }));
    expect(await screen.findByDisplayValue(/Coordinamos la cantidad/)).toBeVisible();
    expect(screen.getByText("Borrador de IA")).toBeVisible();
    expect(screen.getByRole("link", { name: "Abrir WhatsApp" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Asumir oportunidad/ })).not.toBeInTheDocument();
  });

  it("mantiene disponible el enlace después de registrar el handoff", async () => {
    const handedOff = { ...item, ownerId: "admin-1", ownerName: "Administrador", qualificationStatus: "HANDED_OFF", consentStatus: "GRANTED", whatsappHandoffAt: "2026-09-07T17:00:00Z", whatsappMessage: "Hola María, continuemos con su cotización." };
    apiMock.mockImplementation((url = "") => Promise.resolve(url.includes("intervention-inbox")
      ? { ...list, items: [handedOff] }
      : { ...detail, opportunity: { ...detail.opportunity, ...handedOff } }));
    const user = userEvent.setup();
    render(<InterventionInbox user={{ id: "admin-1", role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /María López/ }));
    const link = await screen.findByRole("link", { name: "Abrir WhatsApp" });
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/51999999999?text="));
    expect(screen.getByText(/El enlace se crea automáticamente/)).toBeVisible();
  });

  it("bloquea la paginación mientras carga y reemplaza la página anterior", async () => {
    let resolveSecondPage;
    const secondPage = new Promise((resolve) => { resolveSecondPage = resolve; });
    const nextItem = { ...item, id: "op-2", contactName: "Lucía Torres" };
    apiMock.mockImplementation((url = "") => {
      if (url.includes("intervention-inbox") && url.includes("page=2")) return secondPage;
      return Promise.resolve({ ...list, total: 41 });
    });
    const user = userEvent.setup();
    render(<InterventionInbox user={{ id: "admin-1", role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);

    await screen.findByRole("button", { name: /María López/ });
    const next = screen.getByRole("button", { name: "Siguiente" });
    await user.click(next);

    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent("Cargando página 2");
    expect(next).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

    resolveSecondPage({ ...list, items: [nextItem], total: 41, page: 2 });
    expect(await screen.findByRole("button", { name: /Lucía Torres/ })).toBeVisible();
    expect(screen.getByText("Página 2 de 3")).toBeVisible();
    expect(next).toBeEnabled();
  });

  it("ordena por mensajes recientes y permite limitar la actividad por días", async () => {
    apiMock.mockResolvedValue(list);
    const user = userEvent.setup();
    render(<InterventionInbox user={{ id: "admin-1", role: "ADMIN" }} notify={vi.fn()} onError={vi.fn()} />);

    await screen.findByRole("button", { name: /María López/ });
    expect(apiMock.mock.calls[0][0]).toContain("sort=RECENT");

    await user.click(screen.getByRole("combobox", { name: "Filtrar mensajes por días" }));
    await user.click(screen.getByRole("option", { name: "Últimos 7 días" }));

    expect(await vi.waitFor(() => apiMock.mock.calls.some(([url]) => url.includes("days=7")))).toBe(true);
  });
});
