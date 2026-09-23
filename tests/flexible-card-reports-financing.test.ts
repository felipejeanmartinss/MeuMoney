import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8");

describe("flexible card entries", () => {
  const publicMigration = source(
    "supabase",
    "migrations",
    "20260913235156_flexible_card_dates_and_saved_reports.sql",
  );
  const privateMigration = source(
    "supabase",
    "migrations",
    "20260914001759_fix_card_purchase_update_uuid_selection.sql",
  );

  it("keeps paid invoices protected while allowing corrections in unpaid closed invoices", () => {
    expect(publicMigration).toContain("invoices.status = 'paid'");
    expect(publicMigration).toContain("set status = 'open'");
    expect(publicMigration).toContain("set status = 'invoiced'");
  });

  it("selects invoice UUIDs without the unsupported min(uuid) aggregate", () => {
    expect(privateMigration).toContain("order by installments.installment_number");
    expect(privateMigration).toContain("limit 1");
    expect(privateMigration).not.toContain("min(installments.invoice_id)");
  });
});

describe("custom reports", () => {
  const migration = source(
    "supabase",
    "migrations",
    "20260913235156_flexible_card_dates_and_saved_reports.sql",
  );
  const reportPage = source("src", "app", "reports", "page.tsx");
  const matrices = source(
    "src",
    "components",
    "reports",
    "financial-report-matrices.tsx",
  );

  it("stores user-owned report presets and exposes account-aware entries", () => {
    expect(migration).toContain("create table public.saved_financial_reports");
    expect(migration).toContain("saved_financial_reports_delete_own");
    expect(migration).toContain("create view public.financial_report_entries_by_source");
    expect(migration).toContain("with (security_invoker = true)");
  });

  it("supports collapsible filters, source/category filters and saved presets", () => {
    expect(reportPage).toContain("Contas e cartões");
    expect(reportPage).toContain("Subcategorias");
    expect(reportPage).toContain("Salvar visualização atual");
    expect(reportPage).toContain("deleteSavedFinancialReport");
    expect(reportPage).toContain('<details className="group border-t');
    expect(reportPage).not.toContain('<details open className="group border-t');
  });

  it("groups report columns by month, quarter or year", () => {
    expect(matrices).toContain('ReportTimeGrouping = "month" | "quarter" | "year"');
    expect(matrices).toContain("aggregateMonthlyColumns");
    expect(matrices).toContain("showSubcategories");
  });
});

describe("financing and account management", () => {
  it("extracts text without requiring native canvas in the server runtime", () => {
    const extractor = source("src", "services", "finance", "pdf-text-extractor.ts");
    expect(extractor).toContain("stopAtErrors: false");
    expect(extractor).not.toContain('import("@napi-rs/canvas")');
  });

  it("projects an editable SAC or PRICE schedule from the manual form", () => {
    const form = source("src", "components", "forms", "manual-financing-form.tsx");
    expect(form).toContain("projectFinancingSchedule");
    expect(form).toContain("Projetar parcelas");
    expect(form).toContain("monthlyDate");
  });

  it("allows deleting manual and system account transactions", () => {
    const service = source("src", "services", "finance", "transactions-service.ts");
    const migration = source(
      "supabase",
      "migrations",
      "20260914115118_allow_system_transaction_management.sql",
    );
    expect(service).toContain('.in("origin_type", ["manual", "system"])');
    expect(migration).toContain("origin_type::text in ('manual', 'system')");
    expect(migration).not.toContain("credit_card_invoice_payment");
  });
});

describe("table ordering", () => {
  it("adds ascending and descending ordering to conventional app tables", () => {
    const controller = source(
      "src",
      "components",
      "tables",
      "table-sort-controller.tsx",
    );
    const layout = source("src", "app", "layout.tsx");
    expect(controller).toContain('"ascending" | "descending"');
    expect(controller).toContain("localeCompare");
    expect(controller).toContain("comparableValue");
    expect(layout).toContain("<TableSortController />");
  });
});
