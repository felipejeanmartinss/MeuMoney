import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthlyFinancialMatrix } from "../src/components/reports/financial-report-matrices";

const categoryId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";

describe("report drilldown", () => {
  it("links consolidated category and period totals to the matching source entries", () => {
    const html = renderToStaticMarkup(createElement(MonthlyFinancialMatrix, {
      rows: [{
        rowId: `expense:${categoryId}`, section: "expense", groupLabel: "Vida pessoal",
        label: "Moradia", categoryKey: categoryId, categoryLabel: "Moradia",
        subcategoryKey: null, subcategoryLabel: null,
        monthAmountsMinor: [100_00, 200_00], totalAmountMinor: 300_00,
      }],
      currency: "BRL", caption: "Teste", emptyMessage: "Vazio",
      months: ["2026-10", "2026-11"], timeGrouping: "quarter",
      basis: "cash", sourceKeys: [`account:${accountId}`], reportContext: "personal",
      sourceCurrencies: ["BRL"],
    }));
    expect(html).toContain("/reports/entries?");
    expect(html).toContain("from=2026-10&amp;to=2026-11&amp;basis=cash");
    expect(html).toContain(`rows=${categoryId}`);
    expect(html).toContain(`sources=account%3A${accountId}`);
  });

  it("keeps the detailed SQL view at the same four source grains as the report", () => {
    const sql = readFileSync("supabase/migrations/20261016004500_report_entry_drilldown.sql", "utf8");
    expect(sql).toContain("security_invoker = true");
    for (const source of ["public.transactions", "public.investment_cash_flows", "public.credit_card_installments", "public.transfers"]) {
      expect(sql).toContain(source);
    }
  });
});
