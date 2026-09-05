import { describe, expect, it } from "vitest";
import {
  isNavigationItemActive,
  MAIN_NAVIGATION,
  resolveNavigationSection,
  secondaryNavigationFor,
} from "../src/components/layout/navigation-model";

describe("navigation model", () => {
  it.each([
    ["/dashboard", "home"],
    ["/accounts/abc", "accounts"],
    ["/transactions/new", "accounts"],
    ["/credit-cards/abc", "accounts"],
    ["/investments/abc/history", "investments"],
    ["/net-worth", "net-worth"],
    ["/imports/new", "profile"],
    ["/settings/security", "profile"],
  ] as const)("maps %s to %s", (pathname, section) => {
    expect(resolveNavigationSection(pathname)).toBe(section);
  });

  it("keeps only five primary destinations", () => {
    expect(MAIN_NAVIGATION.map((item) => item.label)).toEqual([
      "Início",
      "Contas",
      "Investimentos",
      "Patrimônio",
      "Perfil",
    ]);
  });

  it("keeps account operations contextual while preserving module links", () => {
    expect(
      secondaryNavigationFor("/transactions").map((item) => item.label),
    ).not.toContain("Movimentações");
    expect(
      secondaryNavigationFor("/credit-cards").map((item) => item.label),
    ).toContain("Cartões");
    expect(
      secondaryNavigationFor("/reports").map((item) => item.label),
    ).toContain("Relatórios");
    expect(
      secondaryNavigationFor("/recurring-transactions").map(
        (item) => item.label,
      ),
    ).toContain("Contas a Pagar");
  });

  it("distinguishes investment tabs by query string", () => {
    const financing = secondaryNavigationFor("/investments").find(
      (item) => item.label === "Financiamentos",
    );
    expect(financing).toBeDefined();
    expect(
      isNavigationItemActive("/investments", financing!, "tab=financing"),
    ).toBe(true);
    expect(isNavigationItemActive("/investments", financing!, "")).toBe(
      false,
    );
  });
});
