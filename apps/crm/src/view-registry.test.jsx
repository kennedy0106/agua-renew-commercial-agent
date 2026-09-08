import { describe, expect, it } from "vitest";
import { canAccessView, isKnownView, VIEW_REGISTRY, viewFromLocation, viewsForRole } from "./view-registry.js";

describe("registro de vistas y RBAC visual", () => {
  it("mantiene las doce rutas funcionales y resuelve hash routing", () => {
    expect(VIEW_REGISTRY).toHaveLength(12);
    expect(viewFromLocation("#/intervention")).toBe("intervention");
    expect(viewFromLocation("#/desconocida")).toBe("dashboard");
    expect(isKnownView("reports")).toBe(true);
  });

  it("filtra destinos sin ampliar las capacidades del rol", () => {
    expect(canAccessView("ADMIN", "users")).toBe(true);
    expect(canAccessView("SUPERVISOR", "users")).toBe(false);
    expect(canAccessView("SUPERVISOR", "automations")).toBe(true);
    expect(canAccessView("ADVISOR", "automations")).toBe(false);
    expect(viewsForRole("ADVISOR").map((view) => view.id)).not.toContain("users");
  });
});
