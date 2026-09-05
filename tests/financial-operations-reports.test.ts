import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMonthlyCategoryMatrix,
  buildPeriodComparison,
  calculateInvestmentReturnBasisPoints,
  fillIncomeExpenseReportYear,
  projectFixedExpenseMatrix,
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
const matrixMigration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260905143000_financial_report_matrices.sql",
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

  it("builds a dense annual category matrix in integer minor units", () => {
    const matrix = buildMonthlyCategoryMatrix(2026, [
      {
        rowId: "salary",
        section: "income",
        groupLabel: "Receitas pessoais",
        label: "Salário",
        referenceMonth: "2026-01-01",
        amountMinor: 10_000_00,
      },
      {
        rowId: "salary",
        section: "income",
        groupLabel: "Receitas pessoais",
        label: "Salário",
        referenceMonth: "2026-02-01",
        amountMinor: 11_000_00,
      },
    ]);

    expect(matrix).toHaveLength(1);
    expect(matrix[0].monthAmountsMinor.slice(0, 3)).toEqual([
      10_000_00,
      11_000_00,
      0,
    ]);
    expect(matrix[0].totalAmountMinor).toBe(21_000_00);
  });

  it("projects recurring fixed expenses without treating them as paid", () => {
    const matrix = projectFixedExpenseMatrix(2026, [
      {
        rowId: "rent",
        groupLabel: "Moradia",
        label: "Aluguel",
        amountMinor: 1_500_00,
        frequency: "monthly",
        startDate: "2025-01-31",
        endDate: null,
      },
    ]);

    expect(matrix[0].monthAmountsMinor).toHaveLength(12);
    expect(matrix[0].monthAmountsMinor.every((value) => value === 1_500_00)).toBe(true);
    expect(matrix[0].totalAmountMinor).toBe(18_000_00);
  });

  it("compares periods and leaves rates blank without a first-period base", () => {
    const compared = buildPeriodComparison(
      [
        {
          rowId: "food",
          section: "expense",
          groupLabel: "Alimentação",
          label: "Restaurantes",
          referenceMonth: "2026-08-01",
          amountMinor: 500_00,
        },
        {
          rowId: "food",
          section: "expense",
          groupLabel: "Alimentação",
          label: "Restaurantes",
          referenceMonth: "2026-09-01",
          amountMinor: 625_00,
        },
        {
          rowId: "new",
          section: "expense",
          groupLabel: "Outras",
          label: "Nova despesa",
          referenceMonth: "2026-09-01",
          amountMinor: 100_00,
        },
      ],
      {
        firstStart: "2026-08",
        firstEnd: "2026-08",
        secondStart: "2026-09",
        secondEnd: "2026-09",
      },
    );

    expect(compared.find((row) => row.label === "Restaurantes")).toMatchObject({
      differenceMinor: 125_00,
      variationBasisPoints: 2_500,
    });
    expect(compared.find((row) => row.label === "Nova despesa")?.variationBasisPoints).toBeNull();
  });

  it("does not invent investment return without a complete cash-flow base", () => {
    expect(calculateInvestmentReturnBasisPoints(null, 10_000_00)).toBeNull();
    expect(calculateInvestmentReturnBasisPoints(500_00, 0)).toBeNull();
    expect(calculateInvestmentReturnBasisPoints(500_00, 10_000_00)).toBe(500);
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

  it("serves report matrices through an owner-isolated aggregate view", () => {
    expect(matrixMigration).toContain(
      "create view public.financial_report_category_monthly",
    );
    expect(matrixMigration).toContain("with (security_invoker = true)");
    expect(matrixMigration).toContain("transactions.origin_type::text <> 'investment'");
    expect(matrixMigration).toContain("flow.cash_flow_type = 'income'");
    expect(matrixMigration).toContain(
      "public.financial_dashboard_expense_categories_basis",
    );
    expect(matrixMigration).toContain(
      "grant select on table public.financial_report_category_monthly to authenticated",
    );
  });
});
