import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

vi.mock("../api.js", () => ({ api: vi.fn(), queryString: vi.fn(() => "page=1&pageSize=25") }));
vi.mock("./Shell.jsx", () => ({
  PageHeader: ({ title, description }) => <header><h1>{title}</h1><p>{description}</p></header>,
}));

import { api } from "../api.js";
import { Revenue } from "./Revenue.jsx";

const props = {
  user: { role: "ADMIN" },
  notify: vi.fn(),
  onError: vi.fn(),
};

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((path) => {
    if (path.includes("/orders")) {
      return Promise.resolve({
        total: 1,
        items: [{
          id: "order-1",
          order_number: "PED-001",
          contact_name: "Lucía Cárdenas",
          owner_name: "Ana Torres",
          created_at: "2026-09-03T15:00:00.000Z",
          status: "CONFIRMED",
          payment_status: "PENDING",
          paid: 0,
          total: 420,
          version: 1,
        }],
      });
    }
    if (path.includes("/products")) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [], total: 0 });
  });
});
afterEach(cleanup);

describe("Ingresos", () => {
  it("expone sus secciones y un estado vacío descriptivo", async () => {
    render(<Revenue {...props} />);
    expect(await screen.findByText("Aún no hay cotizaciones")).toBeVisible();
    expect(screen.getByRole("tab", { name: /Cotizaciones/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Pedidos/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Catálogo/ })).toBeVisible();
  });

  it("usa un selector accesible para actualizar la preparación de un pedido", async () => {
    const user = userEvent.setup();
    render(<Revenue {...props} />);
    await screen.findByText("Aún no hay cotizaciones");
    await user.click(screen.getByRole("tab", { name: /Pedidos/ }));

    expect(await screen.findByText("PED-001")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Preparación de PED-001" })).toBeVisible();
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/crm/v1/orders?page=1&pageSize=25"));
  });
});
