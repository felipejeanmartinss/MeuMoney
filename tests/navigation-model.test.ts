import { describe, expect, it } from "vitest";
import {
  isNavigationItemActive,
  MAIN_NAVIGATION,
  MOBILE_NAVIGATION,
  resolveNavigationSection,
  secondaryNavigationFor,
} from "../src/components/layout/navigation-model";

describe("navigation model", () => {
  it.each([
    ["/dashboard", "home"],
    ["/check-in", "home"],
    ["/goals/abc", "home"],
    ["/data-quality", "profile"],
    ["/accounts/abc", "accounts"],
    ["/transactions/new", "accounts"],
    ["/credit-cards/abc", "accounts"],
    ["/investments/abc/history", "investments"],
    ["/net-worth", "net-worth"],
    ["/reports", "reports"],
    ["/imports/new", "profile"],
    ["/settings/security", "profile"],
  ] as const)("maps %s to %s", (pathname, section) => {
    expect(resolveNavigationSection(pathname)).toBe(section);
  });

  it("keeps reports as an independent primary destination", () => {
    expect(MAIN_NAVIGATION.map((item) => item.label)).toEqual([
      "Início",
      "Check-in",
      "Metas",
      "Contas",
      "Investimentos",
      "Patrimônio",
      "Relatórios",
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
    expect(secondaryNavigationFor("/reports").map((item) => item.label)).toEqual([
      "Favoritos", "Receitas x despesas", "Despesas fixas", "Comparativo entre períodos",
      "Performance (ativos)", "Performance (geral)", "Evolução patrimonial", "Projeção de fluxo de caixa",
    ]);
    expect(
      secondaryNavigationFor("/recurring-transactions").map(
        (item) => item.label,
      ),
    ).toContain("Recorrências");
  });

  it.each(["/dashboard", "/check-in", "/goals/abc", "/accounts/abc", "/investments/prices"])(
    "highlights exactly one mobile destination on %s",
    (pathname) => {
      expect(MOBILE_NAVIGATION).toHaveLength(5);
      expect(MOBILE_NAVIGATION.filter((item) => isNavigationItemActive(pathname, item))).toHaveLength(1);
    },
  );

  it.each([
    ["/investments/prices", "", "Cotações"],
    ["/investments/benchmarks", "", "Benchmarks"],
    ["/investments/financings/new", "", "Financiamentos"],
    ["/investments/financing-imports/new", "", "Financiamentos"],
    ["/investments", "message=saved&tab=financing", "Financiamentos"],
    ["/investments/abc", "", "Posições"],
  ])("highlights only the matching investment option on %s", (pathname, query, label) => {
    expect(secondaryNavigationFor(pathname).filter((item) =>
      isNavigationItemActive(pathname, item, query)).map((item) => item.label)).toEqual([label]);
    expect(isNavigationItemActive(pathname, MAIN_NAVIGATION.find((item) => item.href === "/investments")!, query)).toBe(true);
  });

  it("keeps data quality in the profile navigation", () => {
    expect(secondaryNavigationFor("/data-quality").some((item) => item.href === "/data-quality")).toBe(true);
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

  it("highlights one report in the sidebar, including favorites", () => {
    const items = secondaryNavigationFor("/reports");
    expect(items.filter((item) => isNavigationItemActive("/reports", item, "report=income-expense")).map((item) => item.label)).toEqual(["Receitas x despesas"]);
    expect(items.filter((item) => isNavigationItemActive("/reports", item, "area=favorites")).map((item) => item.label)).toEqual(["Favoritos"]);
  });
});
