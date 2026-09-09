import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(...segments), "utf8");

describe("accounts, investments and reporting UX", () => {
  it("exposes current and projected balances in the secured account view", () => {
    const migration = readSource(
      "supabase",
      "migrations",
      "20260907173000_account_projection_and_report_rates.sql",
    );
    const accountsPage = readSource("src", "app", "accounts", "page.tsx");

    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("projected_balance_minor");
    expect(migration).toContain("America/Sao_Paulo");
    expect(migration).toContain(
      "grant select on table public.account_balances to authenticated",
    );
    expect(accountsPage).toContain("Saldo atual");
    expect(accountsPage).toContain("Projetado");
    expect(accountsPage).toContain("<details");
  });

  it("uses one collapsible investment matrix with a sticky header and no UI pagination", () => {
    const page = readSource("src", "app", "investments", "page.tsx");

    expect(page).toContain("INVESTMENT_MATRIX_GRID");
    expect(page).toContain("sticky top-0");
    expect(page).toContain("InvestmentCompositionChart");
    expect(page).toContain("Composição da carteira");
    expect(page).toContain("Custo unitário");
    expect(page).toContain("Valor unitário");
    expect(page).toContain('position.investment_type === "stock"');
    expect(page).toContain('position.investment_type === "fii"');
    expect(page).not.toContain("requestedPage");
    expect(page).not.toContain("pageCount");
  });

  it("defaults reports to the preferred profile currency and warns about missing rates", () => {
    const page = readSource("src", "app", "reports", "page.tsx");
    const service = readSource(
      "src",
      "services",
      "reports",
      "financial-reports-service.ts",
    );

    expect(page).toContain("getCurrentProfile");
    expect(page).toContain("preferred_currency");
    expect(page).toContain("Moeda de referência");
    expect(page).toContain("missingCurrencies");
    expect(service).toContain("convertMinorUnits");
    expect(service).not.toContain('.eq("currency", input.currency)');
  });
});
