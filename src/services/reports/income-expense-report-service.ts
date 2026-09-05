import "server-only";
import { fillIncomeExpenseReportYear } from "@/domain/financial-reports";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import type {
  FinancialDashboardMonthlyBasisSummary,
  FinancialReportBasis,
  SupportedCurrency,
} from "@/types/database";

export async function getCurrentUserIncomeExpenseReport(input: {
  year: number;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
}) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("financial_dashboard_monthly_basis")
    .select(
      "basis, user_id, reference_month, currency, income_amount_minor, expense_amount_minor, result_amount_minor, planned_amount_minor, budget_percentage_consumed",
    )
    .eq("user_id", user.id)
    .eq("currency", input.currency)
    .eq("basis", input.basis)
    .gte("reference_month", `${input.year}-01-01`)
    .lte("reference_month", `${input.year}-12-01`)
    .order("reference_month");

  const rows = ((data ?? []) as FinancialDashboardMonthlyBasisSummary[]).map(
    (row) => ({
      referenceMonth: row.reference_month,
      incomeAmountMinor: coerceMinorUnits(row.income_amount_minor),
      expenseAmountMinor: coerceMinorUnits(row.expense_amount_minor),
      resultAmountMinor: coerceMinorUnits(row.result_amount_minor),
    }),
  );

  return {
    rows: fillIncomeExpenseReportYear(input.year, rows),
    hasError: Boolean(error),
  };
}
