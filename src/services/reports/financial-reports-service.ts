import "server-only";

import {
  buildMonthlyCategoryMatrix,
  buildPeriodComparison,
  fillIncomeExpenseReportYear,
  projectFixedExpenseMatrix,
  type CategoryMonthlyReportEntry,
  type FixedExpenseRule,
} from "@/domain/financial-reports";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import type {
  Category,
  CategoryGroup,
  FinancialContext,
  FinancialReportBasis,
  FinancialReportCategoryMonthly,
  InvestmentPositionSummary,
  SupportedCurrency,
} from "@/types/database";

type ReportContext = FinancialContext | "all";
type CategoryDimension = Pick<
  Category,
  "id" | "group_id" | "parent_id" | "name" | "kind" | "context"
>;
type GroupDimension = Pick<CategoryGroup, "id" | "name">;

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function categoryPath(
  categoryId: string,
  categories: ReadonlyMap<string, CategoryDimension>,
  groups: ReadonlyMap<string, GroupDimension>,
  fallbackGroup: string,
) {
  const category = categories.get(categoryId);
  if (!category) {
    return { groupLabel: fallbackGroup, label: "Categoria removida" };
  }
  const parent = category.parent_id
    ? categories.get(category.parent_id)
    : undefined;
  return {
    groupLabel: groups.get(category.group_id)?.name ?? fallbackGroup,
    label: parent ? `${parent.name} › ${category.name}` : category.name,
  };
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

  const result = await query.order("reference_month");
  const entries = (
    (result.data ?? []) as FinancialReportCategoryMonthly[]
  ).map((row): CategoryMonthlyReportEntry => ({
      rowId: row.row_id,
      section: row.section,
      groupLabel: row.group_name,
      label: row.row_name,
      referenceMonth: row.reference_month,
      amountMinor: coerceMinorUnits(row.amount_minor),
    }));

  return {
    entries,
    hasError: Boolean(result.error),
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
  context: ReportContext;
  state: "active" | "all";
}) {
  const { supabase, user } = await requireUser();
  let recurringQuery = supabase
    .from("recurring_transactions")
    .select(
      "id, account_id, category_id, description, amount_minor, frequency, start_date, end_date, is_active, ended_at",
    )
    .eq("user_id", user.id)
    .eq("transaction_type", "expense")
    .lte("start_date", `${input.year}-12-31`)
    .or(`end_date.is.null,end_date.gte.${input.year}-01-01`);
  if (input.state === "active") {
    recurringQuery = recurringQuery.eq("is_active", true).is("ended_at", null);
  }

  const [recurringResult, accountsResult, categoriesResult, groupsResult] =
    await Promise.all([
      recurringQuery,
      supabase
        .from("accounts")
        .select("id, currency, context")
        .eq("user_id", user.id),
      supabase
        .from("categories")
        .select("id, group_id, parent_id, name, kind, context")
        .eq("user_id", user.id),
      supabase
        .from("category_groups")
        .select("id, name")
        .eq("user_id", user.id),
    ]);

  const accounts = new Map(
    (accountsResult.data ?? []).map((account) => [account.id, account]),
  );
  const categories = new Map(
    ((categoriesResult.data ?? []) as CategoryDimension[]).map((category) => [
      category.id,
      category,
    ]),
  );
  const groups = new Map(
    ((groupsResult.data ?? []) as GroupDimension[]).map((group) => [
      group.id,
      group,
    ]),
  );
  const rules: FixedExpenseRule[] = [];

  for (const recurrence of recurringResult.data ?? []) {
    const account = accounts.get(recurrence.account_id);
    if (
      !account ||
      account.currency !== input.currency ||
      (input.context !== "all" && account.context !== input.context)
    ) {
      continue;
    }
    const path = categoryPath(
      recurrence.category_id,
      categories,
      groups,
      "Outras despesas",
    );
    rules.push({
      rowId: recurrence.id,
      ...path,
      label: `${path.label} · ${recurrence.description}`,
      amountMinor: coerceMinorUnits(recurrence.amount_minor),
      frequency: recurrence.frequency,
      startDate: recurrence.start_date,
      endDate: recurrence.end_date,
    });
  }

  return {
    matrix: projectFixedExpenseMatrix(input.year, rules),
    hasError: Boolean(
      recurringResult.error ||
        accountsResult.error ||
        categoriesResult.error ||
        groupsResult.error,
    ),
  };
}

export async function getCurrentUserAssetPerformanceReport(input: {
  currency: SupportedCurrency;
  context: ReportContext;
  state: "active" | "all";
}) {
  const result = await listCurrentUserInvestmentPositions();
  const positions = (result.positions as InvestmentPositionSummary[])
    .filter(
      (position) =>
        position.currency === input.currency &&
        (input.context === "all" || position.context === input.context) &&
        (input.state === "all" || position.is_active),
    )
    .map((position) => ({
      ...position,
      accumulated_cost_minor: coerceMinorUnits(
        position.accumulated_cost_minor,
      ),
      current_value_minor: coerceMinorUnits(position.current_value_minor),
      contributions_minor: coerceMinorUnits(position.contributions_minor),
      redemptions_minor: coerceMinorUnits(position.redemptions_minor),
      income_minor: coerceMinorUnits(position.income_minor),
      unrealized_appreciation_minor: coerceMinorUnits(
        position.unrealized_appreciation_minor,
      ),
      total_result_minor:
        position.total_result_minor === null
          ? null
          : coerceMinorUnits(position.total_result_minor),
    }));
  return { positions, hasError: result.hasError };
}
