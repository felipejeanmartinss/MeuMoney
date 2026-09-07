import "server-only";

import {
  buildMonthlyCategoryMatrix,
  buildPeriodComparison,
  fillIncomeExpenseReportYear,
  type CategoryMonthlyReportEntry,
} from "@/domain/financial-reports";
import { summarizeInvestmentPerformance } from "@/domain/investments";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import type {
  Category,
  FinancialContext,
  FinancialReportBasis,
  FinancialReportCategoryMonthly,
  InvestmentPositionPerformanceSummary,
  SupportedCurrency,
} from "@/types/database";

type ReportContext = FinancialContext | "all";
type CategoryDimension = Pick<
  Category,
  | "id"
  | "group_id"
  | "parent_id"
  | "name"
  | "kind"
  | "context"
  | "is_fixed_expense"
>;

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

async function loadCategoryMonthlyEntries(input: {
  startMonth: string;
  endMonth: string;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: ReportContext;
}) {
  const { supabase, user } = await requireUser();
  let query = supabase
    .from("financial_report_category_monthly")
    .select(
      "basis, user_id, reference_month, currency, section, row_id, category_id, group_name, row_name, context, amount_minor",
    )
    .eq("user_id", user.id)
    .eq("basis", input.basis)
    .eq("currency", input.currency)
    .gte("reference_month", monthStart(input.startMonth))
    .lte("reference_month", monthStart(input.endMonth));

  if (input.context !== "all") {
    query = query.eq("context", input.context);
  }

  const [result, categoriesResult] = await Promise.all([
    query.order("reference_month"),
    supabase
      .from("categories")
      .select(
        "id, group_id, parent_id, name, kind, context, is_fixed_expense",
      )
      .eq("user_id", user.id),
  ]);
  const categories = new Map(
    ((categoriesResult.data ?? []) as CategoryDimension[]).map((category) => [
      category.id,
      category,
    ]),
  );
  const entries = (
    (result.data ?? []) as FinancialReportCategoryMonthly[]
  ).map((row): CategoryMonthlyReportEntry => {
    const category = row.category_id
      ? categories.get(row.category_id)
      : undefined;
    const parent = category?.parent_id
      ? categories.get(category.parent_id)
      : undefined;
    return {
      rowId: row.row_id,
      section: row.section,
      groupLabel: row.group_name,
      label: row.row_name,
      categoryKey: parent?.id ?? category?.id ?? row.row_id,
      categoryLabel: parent?.name ?? category?.name ?? row.row_name,
      subcategoryKey: parent ? category?.id ?? null : null,
      subcategoryLabel: parent ? category?.name ?? null : null,
      isFixedExpense: category?.is_fixed_expense ?? false,
      referenceMonth: row.reference_month,
      amountMinor: coerceMinorUnits(row.amount_minor),
    };
  });

  return {
    entries,
    hasError: Boolean(result.error || categoriesResult.error),
  };
}

function monthlySummary(
  year: number,
  entries: readonly CategoryMonthlyReportEntry[],
) {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    referenceMonth: `${year}-${String(index + 1).padStart(2, "0")}-01`,
    incomeAmountMinor: 0,
    expenseAmountMinor: 0,
    resultAmountMinor: 0,
  }));
  for (const entry of entries) {
    if (!entry.referenceMonth.startsWith(String(year))) continue;
    const index = Number(entry.referenceMonth.slice(5, 7)) - 1;
    if (index < 0 || index > 11) continue;
    const field =
      entry.section === "income"
        ? "incomeAmountMinor"
        : "expenseAmountMinor";
    rows[index][field] = coerceMinorUnits(
      rows[index][field] + entry.amountMinor,
    );
    rows[index].resultAmountMinor = coerceMinorUnits(
      rows[index].incomeAmountMinor - rows[index].expenseAmountMinor,
    );
  }
  return fillIncomeExpenseReportYear(year, rows);
}

export async function getCurrentUserIncomeExpenseMatrix(input: {
  year: number;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: ReportContext;
}) {
  const source = await loadCategoryMonthlyEntries({
    ...input,
    startMonth: `${input.year}-01`,
    endMonth: `${input.year}-12`,
  });
  return {
    rows: monthlySummary(input.year, source.entries),
    matrix: buildMonthlyCategoryMatrix(input.year, source.entries),
    hasError: source.hasError,
  };
}

export async function getCurrentUserPeriodComparisonReport(input: {
  firstStart: string;
  firstEnd: string;
  secondStart: string;
  secondEnd: string;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: ReportContext;
}) {
  const startMonth = [input.firstStart, input.secondStart].sort()[0];
  const endMonth = [input.firstEnd, input.secondEnd].sort().at(-1)!;
  const source = await loadCategoryMonthlyEntries({
    startMonth,
    endMonth,
    currency: input.currency,
    basis: input.basis,
    context: input.context,
  });
  return {
    rows: buildPeriodComparison(source.entries, input),
    hasError: source.hasError,
  };
}

export async function getCurrentUserFixedExpenseReport(input: {
  year: number;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: ReportContext;
}) {
  const source = await loadCategoryMonthlyEntries({
    ...input,
    startMonth: `${input.year}-01`,
    endMonth: `${input.year}-12`,
  });
  const fixedExpenses = source.entries.filter(
    (entry) => entry.section === "expense" && entry.isFixedExpense,
  );

  return {
    matrix: buildMonthlyCategoryMatrix(input.year, fixedExpenses),
    hasError: source.hasError,
  };
}

export async function getCurrentUserAssetPerformanceReport(input: {
  currency: SupportedCurrency;
  context: ReportContext;
  state: "active" | "all";
}) {
  const result = await listCurrentUserInvestmentPositions();
  const positions = result.positions.filter(
    (position) =>
      position.currency === input.currency &&
      (input.context === "all" || position.context === input.context) &&
      (input.state === "all" || position.is_active),
  ) as InvestmentPositionPerformanceSummary[];
  const positionIds = new Set(positions.map((position) => position.id));
  const performanceByClass = [
    ...new Set(positions.map((position) => position.investment_class)),
  ].map((investmentClass) => {
    const inputs = positions.flatMap((position) => {
      if (position.investment_class !== investmentClass) return [];
      const performanceInput = result.performanceInputs.get(position.id);
      return performanceInput ? [performanceInput] : [];
    });
    return {
      investmentClass,
      ...summarizeInvestmentPerformance(
        inputs,
        result.cashFlows.filter((cashFlow) =>
          positionIds.has(cashFlow.positionId),
        ),
      ),
    };
  });
  return { positions, performanceByClass, hasError: result.hasError };
}
