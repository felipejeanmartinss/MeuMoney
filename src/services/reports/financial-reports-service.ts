import "server-only";

import {
  buildMonthlyCategoryMatrix,
  buildMonthlyCategoryMatrixForMonths,
  buildPeriodComparison,
  type CategoryMonthlyReportEntry,
  type NetWorthEvolutionReportRow,
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
  sourceCurrencies: SupportedCurrency[];
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
    if (!input.sourceCurrencies.includes(row.currency)) return [];
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

function reportMonths(startMonth: string, endMonth: string) {
  const months: string[] = [];
  const [startYear, start] = startMonth.split("-").map(Number);
  const [endYear, end] = endMonth.split("-").map(Number);
  const cursor = new Date(Date.UTC(startYear, start - 1, 1));
  const limit = new Date(Date.UTC(endYear, end - 1, 1));
  while (cursor <= limit && months.length < 600) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function monthlySummary(
  months: readonly string[],
  entries: readonly CategoryMonthlyReportEntry[],
) {
  const rows = months.map((month) => ({
    referenceMonth: `${month}-01`,
    incomeAmountMinor: 0,
    expenseAmountMinor: 0,
    resultAmountMinor: 0,
  }));
  for (const entry of entries) {
    const index = months.indexOf(entry.referenceMonth.slice(0, 7));
    if (index < 0) continue;
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
  return rows;
}

export async function getCurrentUserIncomeExpenseMatrix(input: {
  startMonth: string;
  endMonth: string;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: ReportContext;
  sourceCurrencies: SupportedCurrency[];
  allDates?: boolean;
}) {
  const source = await loadCategoryMonthlyEntries({
    ...input,
  });
  const populatedMonths = [...new Set(source.entries.map((entry) => entry.referenceMonth.slice(0, 7)))].sort();
  const months = input.allDates && populatedMonths.length
    ? reportMonths(populatedMonths[0], populatedMonths.at(-1)!)
    : reportMonths(input.startMonth, input.endMonth);
  return {
    rows: monthlySummary(months, source.entries),
    matrix: buildMonthlyCategoryMatrixForMonths(months, source.entries),
    months,
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
  sourceCurrencies: SupportedCurrency[];
}) {
  const startMonth = [input.firstStart, input.secondStart].sort()[0];
  const endMonth = [input.firstEnd, input.secondEnd].sort().at(-1)!;
  const source = await loadCategoryMonthlyEntries({
    startMonth,
    endMonth,
    currency: input.currency,
    basis: input.basis,
    context: input.context,
    sourceCurrencies: input.sourceCurrencies,
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
  sourceCurrencies: SupportedCurrency[];
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
  sourceCurrencies: SupportedCurrency[];
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
      (input.state !== "all" && !position.is_active) ||
      !input.sourceCurrencies.includes(position.currency)
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
    const convertedFlowTotal = (
      type: InvestmentPerformanceCashFlow["type"],
    ) =>
      positionCashFlows.reduce(
        (total, cashFlow) =>
          cashFlow.type === type
            ? coerceMinorUnits(total + cashFlow.amountMinor)
            : total,
        0,
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
      contributions_minor: convertedFlowTotal("contribution"),
      redemptions_minor: convertedFlowTotal("redemption"),
      income_minor: convertedFlowTotal("income"),
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

export async function getCurrentUserNetWorthEvolutionReport(input: {
  startMonth: string;
  endMonth: string;
  currency: SupportedCurrency;
  context: ReportContext;
  sourceCurrencies: SupportedCurrency[];
  allDates?: boolean;
}) {
  const { supabase, user } = await requireUser();
  const [
    accountsResult,
    transactionsResult,
    transfersResult,
    itemsResult,
    valuationsResult,
    positionsResult,
    snapshotsResult,
    cardsResult,
    invoicesResult,
    conversionResult,
  ] = await Promise.all([
    supabase.from("accounts").select("id, currency, context, opening_balance_minor, opening_balance_date, archived_at").eq("user_id", user.id),
    supabase.from("transactions").select("account_id, transaction_type, amount_minor, transaction_date, status, is_active").eq("user_id", user.id).eq("is_active", true),
    supabase.from("transfer_entries").select("account_id, direction, amount_minor, transaction_date, status, is_active").eq("user_id", user.id).eq("is_active", true),
    supabase.from("net_worth_items").select("id, kind, currency, context, archived_at").eq("user_id", user.id),
    supabase.from("net_worth_valuations").select("item_id, value_minor, valuation_date").eq("user_id", user.id).order("valuation_date"),
    supabase.from("investment_positions").select("id, currency, context, archived_at").eq("user_id", user.id),
    supabase.from("investment_position_snapshots").select("position_id, current_value_minor, position_date").eq("user_id", user.id).order("position_date"),
    supabase.from("credit_cards").select("id, currency, linked_account_id").eq("user_id", user.id).eq("is_active", true),
    supabase.from("credit_card_invoices").select("credit_card_id, reference_month, total_amount, paid_at").eq("user_id", user.id).order("reference_month"),
    loadCurrencyConversionSamples(supabase, user.id),
  ]);
  const accounts = (accountsResult.data ?? []).filter(
    (row) => input.sourceCurrencies.includes(row.currency) && (input.context === "all" || row.context === input.context),
  );
  const items = (itemsResult.data ?? []).filter(
    (row) => input.sourceCurrencies.includes(row.currency) && (input.context === "all" || row.context === input.context),
  );
  const positions = (positionsResult.data ?? []).filter(
    (row) => input.sourceCurrencies.includes(row.currency) && (input.context === "all" || row.context === input.context),
  );
  const accountContext = new Map(
    (accountsResult.data ?? []).map((row) => [row.id, row.context]),
  );
  const cards = (cardsResult.data ?? []).filter(
    (row) =>
      input.sourceCurrencies.includes(row.currency) &&
      (input.context === "all" ||
        (row.linked_account_id
          ? accountContext.get(row.linked_account_id) === input.context
          : input.context === "personal")),
  );
  const itemCurrency = new Map(items.map((row) => [row.id, row.currency]));
  const positionCurrency = new Map(positions.map((row) => [row.id, row.currency]));
  const accountIds = new Set(accounts.map((row) => row.id));
  const itemIds = new Set(items.map((row) => row.id));
  const positionIds = new Set(positions.map((row) => row.id));
  const cardIds = new Set(cards.map((row) => row.id));
  const missingCurrencies = new Set<SupportedCurrency>();
  const today = currentIsoDate();
  const convert = (amount: number, sourceCurrency: SupportedCurrency, date: string) => {
    const value = convertMinorUnits(amount, sourceCurrency, input.currency, date, conversionResult.samples);
    if (value === null) missingCurrencies.add(sourceCurrency);
    return value ?? 0;
  };
  const datedMonths = [
    ...accounts.map((row) => row.opening_balance_date.slice(0, 7)),
    ...(transactionsResult.data ?? []).flatMap((row) =>
      accountIds.has(row.account_id) ? [row.transaction_date.slice(0, 7)] : [],
    ),
    ...(transfersResult.data ?? []).flatMap((row) =>
      accountIds.has(row.account_id) ? [row.transaction_date.slice(0, 7)] : [],
    ),
    ...(valuationsResult.data ?? []).flatMap((row) =>
      itemIds.has(row.item_id) ? [row.valuation_date.slice(0, 7)] : [],
    ),
    ...(snapshotsResult.data ?? []).flatMap((row) =>
      positionIds.has(row.position_id) ? [row.position_date.slice(0, 7)] : [],
    ),
    ...(invoicesResult.data ?? []).flatMap((row) =>
      cardIds.has(row.credit_card_id) ? [row.reference_month.slice(0, 7)] : [],
    ),
  ].sort();
  const months = input.allDates && datedMonths.length
    ? reportMonths(datedMonths[0], datedMonths.at(-1)!)
    : reportMonths(input.startMonth, input.endMonth);
  const rows = months.map((month): NetWorthEvolutionReportRow => {
    const endDate = `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
    let assetsMinor = 0;
    let liabilitiesMinor = 0;
    for (const account of accounts) {
      if (account.opening_balance_date > endDate || (account.archived_at && account.archived_at.slice(0, 10) <= endDate)) continue;
      let balance = coerceMinorUnits(account.opening_balance_minor);
      for (const transaction of transactionsResult.data ?? []) {
        if (
          transaction.account_id !== account.id ||
          transaction.transaction_date > endDate ||
          (transaction.transaction_date < today &&
            transaction.status !== "completed")
        ) continue;
        const amount = coerceMinorUnits(transaction.amount_minor);
        balance = coerceMinorUnits(balance + (transaction.transaction_type === "income" ? amount : -amount));
      }
      for (const transfer of transfersResult.data ?? []) {
        if (
          transfer.account_id !== account.id ||
          transfer.transaction_date > endDate ||
          (transfer.transaction_date < today && transfer.status !== "completed")
        ) continue;
        const amount = coerceMinorUnits(transfer.amount_minor);
        balance = coerceMinorUnits(balance + (transfer.direction === "inflow" ? amount : -amount));
      }
      assetsMinor = coerceMinorUnits(assetsMinor + convert(balance, account.currency, endDate));
    }
    for (const item of items) {
      if (item.archived_at && item.archived_at.slice(0, 10) <= endDate) continue;
      const valuation = (valuationsResult.data ?? []).filter((row) => row.item_id === item.id && row.valuation_date <= endDate).at(-1);
      if (!valuation) continue;
      const amount = convert(coerceMinorUnits(valuation.value_minor), itemCurrency.get(item.id)!, endDate);
      if (item.kind === "asset") assetsMinor = coerceMinorUnits(assetsMinor + amount);
      else liabilitiesMinor = coerceMinorUnits(liabilitiesMinor + amount);
    }
    for (const position of positions) {
      if (position.archived_at && position.archived_at.slice(0, 10) <= endDate) continue;
      const snapshot = (snapshotsResult.data ?? []).filter((row) => row.position_id === position.id && row.position_date <= endDate).at(-1);
      if (!snapshot) continue;
      assetsMinor = coerceMinorUnits(assetsMinor + convert(coerceMinorUnits(snapshot.current_value_minor), positionCurrency.get(position.id)!, endDate));
    }
    for (const card of cards) {
      const outstanding = (invoicesResult.data ?? []).reduce((total, invoice) => {
        if (
          invoice.credit_card_id !== card.id ||
          invoice.reference_month > endDate ||
          (invoice.paid_at && invoice.paid_at.slice(0, 10) <= endDate)
        ) {
          return total;
        }
        return coerceMinorUnits(total + coerceMinorUnits(invoice.total_amount));
      }, 0);
      liabilitiesMinor = coerceMinorUnits(
        liabilitiesMinor + convert(outstanding, card.currency, endDate),
      );
    }
    return {
      referenceMonth: month,
      assetsMinor,
      liabilitiesMinor,
      netWorthMinor: coerceMinorUnits(assetsMinor - liabilitiesMinor),
    };
  });
  return {
    rows,
    missingCurrencies: [...missingCurrencies],
    hasError: Boolean(
      accountsResult.error || transactionsResult.error || transfersResult.error ||
      itemsResult.error || valuationsResult.error || positionsResult.error ||
      snapshotsResult.error || cardsResult.error || invoicesResult.error ||
      conversionResult.hasError,
    ),
  };
}
