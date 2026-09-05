import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fillIncomeExpenseReportYear,
  reportBasisDescription,
  summarizeIncomeExpenseReport,
} from "../src/domain/financial-reports";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260905090000_investment_transactions_reports.sql",
  ),
  "utf8",
);

describe("financial operations and reports", () => {
  it("fills missing months and sums only integer minor units", () => {
    const rows = fillIncomeExpenseReportYear(2026, [
      {
        referenceMonth: "2026-02-01",
        incomeAmountMinor: 500_00,
        expenseAmountMinor: 125_00,
        resultAmountMinor: 375_00,
      },
    ]);
    const summary = summarizeIncomeExpenseReport(rows);

    expect(rows).toHaveLength(12);
    expect(rows[0].incomeAmountMinor).toBe(0);
    expect(rows[1].resultAmountMinor).toBe(375_00);
    expect(summary).toEqual({
      incomeAmountMinor: 500_00,
      expenseAmountMinor: 125_00,
      resultAmountMinor: 375_00,
    });
  });

  it("documents distinct competence and cash recognition", () => {
    expect(reportBasisDescription("competence")).toContain("parcelas");
    expect(reportBasisDescription("cash")).toContain("pagamentos de cartão");
  });

  it("links account movements and investment history atomically", () => {
    const privateFunction = migration.slice(
      migration.indexOf(
        "create or replace function private.create_investment_account_entry",
      ),
      migration.indexOf(
        "create or replace function public.create_investment_account_entry",
      ),
    );

    expect(privateFunction).toContain("insert into public.transactions");
    expect(privateFunction).toContain("insert into public.investment_cash_flows");
    expect(privateFunction).toContain("insert into public.investment_positions");
    expect(privateFunction).toContain("position_record.currency <> account_record.currency");
    expect(privateFunction).toContain("position_record.context <> account_record.context");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("security invoker");
  });

  it("keeps investment capital out of economic income and cash expenses", () => {
    const dashboardView = migration.slice(
      migration.indexOf(
        "create or replace view public.financial_dashboard_monthly_basis",
      ),
      migration.indexOf(
        "create or replace view public.financial_dashboard_expense_categories_basis",
      ),
    );

    expect(dashboardView).toContain("flow.cash_flow_type = 'income'");
    expect(dashboardView).toContain("transactions.origin_type::text <> 'investment'");
    expect(dashboardView).toContain("transfers.destination_credit_card_id is not null");
  });

  it("aggregates income and expense budgets with owner-isolated invoker views", () => {
    expect(migration).toContain("create or replace view public.monthly_budget_actuals");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("categories.kind as category_kind");
    expect(migration).toContain("categories.kind = 'income'");
    expect(migration).toContain("categories.kind = 'expense'");
  });
});
