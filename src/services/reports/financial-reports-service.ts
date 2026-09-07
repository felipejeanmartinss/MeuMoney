import "server-only";

import {
  buildMonthlyCategoryMatrix,
  buildPeriodComparison,
  fillIncomeExpenseReportYear,
  type CategoryMonthlyReportEntry,
} from "@/domain/financial-reports";
import {
  convertMinorUnits,
  type CurrencyConversionSample,
} from "@/domain/currency-conversion";
import {
  calculateInvestmentPerformance,
  summarizeInvestmentPerformance,
  type InvestmentPerformanceCashFlow,
  type InvestmentPerformancePosition,
} from "@/domain/investments";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import { currentIsoDate } from "@/utils/dates";
import type {
  Category,
  FinancialContext,
  FinancialReportBasis,
  FinancialReportCategoryMonthly,
  InvestmentPositionPerformanceSummary,
  SupportedCurrency,
} from "@/types/database";

type ReportContext = FinancialContext | "all";
type ReportSupabaseClient = Awaited<
  ReturnType<typeof requireUser>
>["supabase"];
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

async function loadCurrencyConversionSamples(
  supabase: ReportSupabaseClient,
  userId: string,
) {
  const result = await supabase
    .from("transfers")
    .select(
      "currency, destination_currency, amount_minor, destination_amount_minor, transaction_date",
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .eq("is_active", true)
    .not("destination_account_id", "is", null)
    .not("destination_currency", "is", null)
    .not("destination_amount_minor", "is", null)
    .order("transaction_date", { ascending: false });
  const samples: CurrencyConversionSample[] = (result.data ?? []).flatMap(
    (row) =>
      row.destination_currency && row.destination_amount_minor
        ? [
            {
              sourceCurrency: row.currency,
              destinationCurrency: row.destination_currency,
              sourceAmountMinor: coerceMinorUnits(row.amount_minor),
              destinationAmountMinor: coerceMinorUnits(
                row.destination_amount_minor,
              ),
              transactionDate: row.transaction_date,
            },
          ]
        : [],
  );
  return { samples, hasError: Boolean(result.error) };
}

async function loadCategoryMonthlyEntries(input: {
  startMonth: string;
  endMonth: string;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: ReportContext;
}) {
  const { supabase, user } = await requireUser();
  const loadAllReportRows = async () => {
    const rows: FinancialReportCategoryMonthly[] = [];
    const pageSize = 1_000;
    for (let start = 0; ; start += pageSize) {
      let query = supabase
        .from("financial_report_category_monthly")
        .select(
          "basis, user_id, reference_month, currency, section, row_id, category_id, group_name, row_name, context, amount_minor",
        )
        .eq("user_id", user.id)
        .eq("basis", input.basis)
        .gte("reference_month", monthStart(input.startMonth))
        .lte("reference_month", monthStart(input.endMonth));
      if (input.context !== "all") {
        query = query.eq("context", input.context);
      }
      const page = await query
        .order("reference_month")
        .range(start, start + pageSize - 1);
      if (page.error) return { data: rows, error: page.error };
      rows.push(...((page.data ?? []) as FinancialReportCategoryMonthly[]));
      if ((page.data?.length ?? 0) < pageSize) {
        return { data: rows, error: null };
      }
    }
  };

  const [result, categoriesResult, conversionResult] = await Promise.all([
    loadAllReportRows(),
    supabase
      .from("categories")
      .select(
        "id, group_id, parent_id, name, kind, context, is_fixed_expense",
      )
      .eq("user_id", user.id),
    loadCurrencyConversionSamples(supabase, user.id),
  ]);
  const categories = new Map(
    ((categoriesResult.data ?? []) as CategoryDimension[]).map((category) => [
      category.id,
      category,
    ]),
  );
  const missingCurrencies = new Set<SupportedCurrency>();
  const entries = result.data.flatMap((row): CategoryMonthlyReportEntry[] => {
    const convertedAmount = convertMinorUnits(
      coerceMinorUnits(row.amount_minor),
      row.currency,
      input.currency,
      `${row.reference_month.slice(0, 7)}-31`,
      conversionResult.samples,
    );
    if (convertedAmount === null) {
      missingCurrencies.add(row.currency);
      return [];
    }
    const category = row.category_id
      ? categories.get(row.category_id)
      : undefined;
    const parent = category?.parent_id
      ? categories.get(category.parent_id)
      : undefined;
    return [{
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
      amountMinor: convertedAmount,
    }];
  });

  return {
    entries,
    missingCurrencies: [...missingCurrencies],
    hasError: Boolean(
      result.error || categoriesResult.error || conversionResult.hasError,
    ),
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
    missingCurrencies: source.missingCurrencies,
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
    missingCurrencies: source.missingCurrencies,
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
    missingCurrencies: source.missingCurrencies,
    hasError: source.hasError,
  };
}

export async function getCurrentUserAssetPerformanceReport(input: {
  currency: SupportedCurrency;
  context: ReportContext;
  state: "active" | "all";
}) {
  const [{ supabase, user }, result] = await Promise.all([
    requireUser(),
    listCurrentUserInvestmentPositions(),
  ]);
  const conversionResult = await loadCurrencyConversionSamples(
    supabase,
    user.id,
  );
  const referenceDate = currentIsoDate();
  const missingCurrencies = new Set<SupportedCurrency>();
  const convertedPerformanceInputs = new Map<
    string,
    InvestmentPerformancePosition
  >();
  const convertedCashFlows: InvestmentPerformanceCashFlow[] = [];
  const positions = result.positions.flatMap((position) => {
    if (
      (input.context !== "all" && position.context !== input.context) ||
      (input.state !== "all" && !position.is_active)
    ) {
      return [];
    }
    const currentValueMinor = convertMinorUnits(
      position.current_value_minor,
      position.currency,
      input.currency,
      referenceDate,
      conversionResult.samples,
    );
    const accumulatedCostMinor = convertMinorUnits(
      position.accumulated_cost_minor,
      position.currency,
      input.currency,
      referenceDate,
      conversionResult.samples,
    );
    const sourceInput = result.performanceInputs.get(position.id);
    if (
      currentValueMinor === null ||
      accumulatedCostMinor === null ||
      !sourceInput
    ) {
      missingCurrencies.add(position.currency);
      return [];
    }
    const performanceInput: InvestmentPerformancePosition = {
      ...sourceInput,
      currency: input.currency,
      currentValueMinor,
      accumulatedCostMinor,
    };
    convertedPerformanceInputs.set(position.id, performanceInput);
    const positionCashFlows = result.cashFlows.flatMap((cashFlow) => {
      if (cashFlow.positionId !== position.id) return [];
      const amountMinor = convertMinorUnits(
        cashFlow.amountMinor,
        position.currency,
        input.currency,
        cashFlow.cashFlowDate,
        conversionResult.samples,
      );
      if (amountMinor === null) {
        missingCurrencies.add(position.currency);
        return [];
      }
      return [{ ...cashFlow, amountMinor }];
    });
    convertedCashFlows.push(...positionCashFlows);
    const performance = calculateInvestmentPerformance(
      performanceInput,
      positionCashFlows,
    );
    const convertCurrent = (value: number) =>
      convertMinorUnits(
        value,
        position.currency,
        input.currency,
        referenceDate,
        conversionResult.samples,
      ) ?? 0;
    return [{
      ...position,
      currency: input.currency,
      current_value_minor: currentValueMinor,
      accumulated_cost_minor: accumulatedCostMinor,
      contributions_minor: convertCurrent(position.contributions_minor),
      redemptions_minor: convertCurrent(position.redemptions_minor),
      income_minor: convertCurrent(position.income_minor),
      unrealized_appreciation_minor: convertCurrent(
        position.unrealized_appreciation_minor,
      ),
      total_result_minor:
        position.total_result_minor === null
          ? null
          : convertCurrent(position.total_result_minor),
      performance_result_minor: performance.resultMinor,
      performance_result_is_estimated: performance.resultIsEstimated,
      realized_gain_loss_minor: performance.realizedGainLossMinor,
      performance_return_basis_minor: performance.returnBasisMinor,
      total_return_basis_points: performance.totalReturnBasisPoints,
      monthly_return_basis_points: performance.monthlyReturnBasisPoints,
      annualized_return_basis_points: performance.annualizedReturnBasisPoints,
      previous_month_result_minor:
        position.previous_month_result_minor === null
          ? null
          : convertCurrent(position.previous_month_result_minor),
      previous_month_return_basis_minor:
        position.previous_month_return_basis_minor === null
          ? null
          : convertCurrent(position.previous_month_return_basis_minor),
    } satisfies InvestmentPositionPerformanceSummary];
  });
  const performanceByClass = [
    ...new Set(positions.map((position) => position.investment_class)),
  ].map((investmentClass) => {
    const classPositions = positions.filter(
      (position) => position.investment_class === investmentClass,
    );
    const classPositionIds = new Set(
      classPositions.map((position) => position.id),
    );
    const inputs = classPositions.flatMap((position) => {
      const performanceInput = convertedPerformanceInputs.get(position.id);
      return performanceInput ? [performanceInput] : [];
    });
    return {
      investmentClass,
      ...summarizeInvestmentPerformance(
        inputs,
        convertedCashFlows.filter((cashFlow) =>
          classPositionIds.has(cashFlow.positionId),
        ),
      ),
    };
  });
  return {
    positions,
    performanceByClass,
    missingCurrencies: [...missingCurrencies],
    hasError: result.hasError || conversionResult.hasError,
  };
}
