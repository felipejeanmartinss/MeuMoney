import "server-only";

import {
  buildMonthlyCategoryMatrix,
  buildMonthlyCategoryMatrixForMonths,
  buildPeriodComparison,
  type CategoryMonthlyReportEntry,
  type NetWorthEvolutionReportRow,
} from "@/domain/financial-reports";
import {
  averageMonthlyExpenseMinor,
  buildCashFlowForecastTimeline,
  residualVariableExpenseMinor,
  type CashFlowForecastEventInput,
  type CashFlowForecastEventKind,
  type CashFlowForecastScenario,
} from "@/domain/cash-flow-forecast";
import {
  getInvoiceDueDate,
  getPurchaseReferenceMonth,
} from "@/domain/credit-cards";
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
import { collectDueRecurrenceDates } from "@/domain/recurring-transactions";
import { requireUser } from "@/services/auth/server-auth";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import { currentIsoDate } from "@/utils/dates";
import type {
  Category,
  FinancialContext,
  FinancialReportBasis,
  FinancialReportEntryBySource,
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
  sourceKeys?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
}) {
  const { supabase, user } = await requireUser();
  const loadAllReportRows = async () => {
    const rows: FinancialReportEntryBySource[] = [];
    const pageSize = 1_000;
    for (let start = 0; ; start += pageSize) {
      let query = supabase
        .from("financial_report_entries_by_source")
        .select(
          "basis, user_id, reference_month, currency, section, row_id, category_id, group_name, row_name, context, source_key, amount_minor",
        )
        .eq("user_id", user.id)
        .eq("basis", input.basis)
        .gte("reference_month", monthStart(input.startMonth))
        .lte("reference_month", monthStart(input.endMonth));
      if (input.context !== "all") {
        query = query.eq("context", input.context);
      }
      if (input.sourceKeys?.length) {
        query = query.in("source_key", input.sourceKeys);
      }
      const page = await query
        .order("reference_month")
        .range(start, start + pageSize - 1);
      if (page.error) return { data: rows, error: page.error };
      rows.push(...((page.data ?? []) as FinancialReportEntryBySource[]));
      if ((page.data?.length ?? 0) < pageSize) {
        return { data: rows, error: null };
      }
    }
  };

  const [
    result,
    categoriesResult,
    conversionResult,
  ] = await Promise.all([
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
    const categoryKey = parent?.id ?? category?.id ?? row.row_id;
    const subcategoryKey = parent ? category?.id ?? null : null;
    if (input.categoryIds?.length && !input.categoryIds.includes(categoryKey)) {
      return [];
    }
    if (
      input.subcategoryIds?.length &&
      (!subcategoryKey || !input.subcategoryIds.includes(subcategoryKey))
    ) {
      return [];
    }
    return [{
      rowId: row.row_id,
      section: row.section,
      groupLabel: row.group_name,
      label: row.row_name,
      categoryKey,
      categoryLabel: parent?.name ?? category?.name ?? row.row_name,
      subcategoryKey,
      subcategoryLabel: parent ? category?.name ?? null : null,
      isFixedExpense: Boolean(category?.is_fixed_expense || parent?.is_fixed_expense),
      referenceMonth: row.reference_month,
      amountMinor: convertedAmount,
    }];
  });
  return {
    entries,
    missingCurrencies: [...missingCurrencies],
    hasError: Boolean(
      result.error ||
        categoriesResult.error ||
        conversionResult.hasError,
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
  sourceKeys?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
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
  sourceKeys?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
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
    sourceKeys: input.sourceKeys,
    categoryIds: input.categoryIds,
    subcategoryIds: input.subcategoryIds,
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
  sourceKeys?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
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
  sourceKeys?: string[];
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
  sourceKeys?: string[];
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
    (row) => input.sourceCurrencies.includes(row.currency) &&
      (input.context === "all" || row.context === input.context) &&
      (!input.sourceKeys?.length || input.sourceKeys.includes(`account:${row.id}`)),
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
      (!input.sourceKeys?.length || input.sourceKeys.includes(`card:${row.id}`)) &&
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

export type CashFlowForecastReportAccount = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  openingBalanceMinor: number | null;
  closingBalanceMinor: number | null;
};

export type CashFlowForecastReportPoint = {
  date: string;
  totalBalanceMinor: number;
  balancesByAccount: Record<string, number | null>;
};

export type CashFlowForecastReportEvent = {
  id: string;
  date: string;
  accountId: string;
  accountName: string;
  description: string;
  categoryLabel: string | null;
  kind: CashFlowForecastEventKind;
  amountMinor: number | null;
  accountBalanceMinor: number | null;
  totalBalanceMinor: number;
  conservativeOnly: boolean;
};

function isoDateFromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthStartFromDate(value: string, offset = 0) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return isoDateFromUtc(new Date(Date.UTC(year, month - 1 + offset, 1)));
}

function monthEndFromMonth(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return isoDateFromUtc(new Date(Date.UTC(year, month, 0)));
}

function datesForReferenceMonths(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = monthStartFromDate(startDate, -1);
  const limit = monthStartFromDate(endDate);
  while (cursor <= limit && dates.length < 26) {
    dates.push(cursor);
    cursor = monthStartFromDate(cursor, 1);
  }
  return dates;
}

function monthsInRange(startDate: string, endDate: string) {
  const months: string[] = [];
  let cursor = monthStartFromDate(startDate);
  const limit = monthStartFromDate(endDate);
  while (cursor <= limit && months.length < 25) {
    months.push(cursor.slice(0, 7));
    cursor = monthStartFromDate(cursor, 1);
  }
  return months;
}

function forecastMonthProportion(
  month: string,
  startDate: string,
  endDate: string,
) {
  const monthStart = `${month}-01`;
  const monthEnd = monthEndFromMonth(month);
  const includedStart = startDate > monthStart ? startDate : monthStart;
  const includedEnd = endDate < monthEnd ? endDate : monthEnd;
  if (includedStart > includedEnd) return 0;
  const included =
    Math.round(
      (new Date(`${includedEnd}T00:00:00Z`).getTime() -
        new Date(`${includedStart}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  const total = Number(monthEnd.slice(8, 10));
  return included / total;
}

function sumConvertedBalances(
  balances: Record<string, number>,
  accountsById: ReadonlyMap<
    string,
    { currency: SupportedCurrency }
  >,
  currency: SupportedCurrency,
  date: string,
  samples: readonly CurrencyConversionSample[],
  missingCurrencies: Set<SupportedCurrency>,
) {
  return Object.entries(balances).reduce((sum, [accountId, amount]) => {
    const sourceCurrency = accountsById.get(accountId)?.currency;
    if (!sourceCurrency) return sum;
    const converted = convertMinorUnits(
      amount,
      sourceCurrency,
      currency,
      date,
      samples,
    );
    if (converted === null) {
      missingCurrencies.add(sourceCurrency);
      return sum;
    }
    return coerceMinorUnits(sum + converted);
  }, 0);
}

/**
 * Consolidated account cash-flow forecast. The base scenario uses the closed
 * balance, already scheduled movements, active recurrences and card invoices.
 * The conservative scenario adds only the uncovered portion of historical
 * variable spending averages.
 */
export async function getCurrentUserCashFlowForecast(input: {
  startDate: string;
  endDate: string;
  currency: SupportedCurrency;
  accountIds?: string[];
  scenario: CashFlowForecastScenario;
  averageMonths: 3 | 6 | 12;
}) {
  const { supabase, user } = await requireUser();
  const today = currentIsoDate();
  const startDate = input.startDate < today ? today : input.startDate;
  const previousMonth = monthStartFromDate(today, -1);
  const historyEnd = monthEndFromMonth(previousMonth);
  const historyStart = monthStartFromDate(previousMonth, -(input.averageMonths - 1));

  const [
    accountsResult,
    transactionsResult,
    transfersResult,
    recurrencesResult,
    cardsResult,
    invoicesResult,
    purchasesResult,
    installmentsResult,
    categoriesResult,
    conversionResult,
  ] = await Promise.all([
    supabase
      .from("account_balances")
      .select("id, name, currency, archived_at, current_balance_minor")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("transactions")
      .select("id, account_id, category_id, transaction_type, description, amount_minor, transaction_date, status, is_active, origin_type, credit_card_invoice_id, recurring_transaction_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gte("transaction_date", historyStart)
      .lte("transaction_date", input.endDate)
      .order("transaction_date")
      .limit(20_000),
    supabase
      .from("transfer_entries")
      .select("id, transfer_id, account_id, direction, amount_minor, transaction_date, status, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .gte("transaction_date", today)
      .lte("transaction_date", input.endDate)
      .order("transaction_date")
      .limit(10_000),
    supabase
      .from("recurring_transactions")
      .select("id, account_id, category_id, transaction_type, description, amount_minor, frequency, start_date, end_date, next_occurrence, is_active, ended_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .is("ended_at", null)
      .lte("next_occurrence", input.endDate),
    supabase
      .from("credit_cards")
      .select("id, name, currency, linked_account_id, closing_day, due_day, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true),
    supabase
      .from("credit_card_invoices")
      .select("id, credit_card_id, reference_month, due_date, status, total_amount, payment_transaction_id")
      .eq("user_id", user.id)
      .neq("status", "paid")
      .lte("due_date", input.endDate),
    supabase
      .from("credit_card_purchases")
      .select("id, credit_card_id, category_id, entry_kind, description, total_amount, purchase_date, is_recurring, status")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("credit_card_installments")
      .select("id, purchase_id, credit_card_id, invoice_id, amount, competence_date, status")
      .eq("user_id", user.id)
      .neq("status", "cancelled")
      .gte("competence_date", historyStart)
      .lte("competence_date", monthStartFromDate(input.endDate, 1))
      .limit(20_000),
    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", user.id),
    loadCurrencyConversionSamples(supabase, user.id),
  ]);

  const requestedAccountIds = new Set(input.accountIds ?? []);
  const accounts = (accountsResult.data ?? []).filter(
    (account) =>
      requestedAccountIds.size === 0 || requestedAccountIds.has(account.id),
  );
  const accountIds = new Set(accounts.map((account) => account.id));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const categoryNames = new Map(
    (categoriesResult.data ?? []).map((category) => [category.id, category.name]),
  );
  const missingCurrencies = new Set<SupportedCurrency>();
  const events: CashFlowForecastEventInput[] = [];
  const allTransactions = transactionsResult.data ?? [];
  const futureTransactions = allTransactions.filter(
    (transaction) =>
      accountIds.has(transaction.account_id) &&
      transaction.transaction_date >= today,
  );

  for (const transaction of futureTransactions) {
    events.push({
      id: `transaction:${transaction.id}`,
      accountId: transaction.account_id,
      date: transaction.transaction_date,
      description: transaction.description,
      amountMinor:
        transaction.transaction_type === "income"
          ? coerceMinorUnits(transaction.amount_minor)
          : -coerceMinorUnits(transaction.amount_minor),
      kind:
        transaction.origin_type === "credit_card_invoice_payment"
          ? "card-invoice"
          : transaction.recurring_transaction_id
            ? "recurrence"
            : "scheduled",
      categoryLabel: transaction.category_id
        ? categoryNames.get(transaction.category_id) ?? null
        : null,
    });
  }

  for (const transfer of transfersResult.data ?? []) {
    if (!accountIds.has(transfer.account_id)) continue;
    events.push({
      id: `transfer:${transfer.id}`,
      accountId: transfer.account_id,
      date: transfer.transaction_date,
      description: "Transferência entre contas",
      amountMinor:
        transfer.direction === "inflow"
          ? coerceMinorUnits(transfer.amount_minor)
          : -coerceMinorUnits(transfer.amount_minor),
      kind: "transfer",
      categoryLabel: null,
    });
  }

  const existingRecurrenceDates = new Map<string, Set<string>>();
  for (const transaction of allTransactions) {
    if (!transaction.recurring_transaction_id) continue;
    const dates =
      existingRecurrenceDates.get(transaction.recurring_transaction_id) ??
      new Set<string>();
    dates.add(transaction.transaction_date);
    existingRecurrenceDates.set(transaction.recurring_transaction_id, dates);
  }
  for (const recurrence of recurrencesResult.data ?? []) {
    if (!accountIds.has(recurrence.account_id)) continue;
    const projection = collectDueRecurrenceDates({
      startDate: recurrence.start_date,
      nextOccurrence: recurrence.next_occurrence,
      endDate: recurrence.end_date,
      frequency: recurrence.frequency,
      targetDate: input.endDate,
      existingDates: existingRecurrenceDates.get(recurrence.id),
    });
    for (const date of projection.dueDates) {
      if (date < today) continue;
      events.push({
        id: `recurrence:${recurrence.id}:${date}`,
        accountId: recurrence.account_id,
        date,
        description: recurrence.description,
        amountMinor:
          recurrence.transaction_type === "income"
            ? coerceMinorUnits(recurrence.amount_minor)
            : -coerceMinorUnits(recurrence.amount_minor),
        kind: "recurrence",
        categoryLabel: categoryNames.get(recurrence.category_id) ?? null,
      });
    }
  }

  const purchases = purchasesResult.data ?? [];
  const purchasesById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  const installments = installmentsResult.data ?? [];
  const installmentsByPurchaseAndMonth = new Set(
    installments.map(
      (installment) => `${installment.purchase_id}:${installment.competence_date}`,
    ),
  );
  const invoicesByCardAndMonth = new Map(
    (invoicesResult.data ?? []).map((invoice) => [
      `${invoice.credit_card_id}:${invoice.reference_month}`,
      invoice,
    ]),
  );
  const invoiceTransactions = new Set(
    futureTransactions.flatMap((transaction) =>
      transaction.credit_card_invoice_id
        ? [transaction.credit_card_invoice_id]
        : [],
    ),
  );
  const referenceMonths = datesForReferenceMonths(today, input.endDate);

  for (const card of cardsResult.data ?? []) {
    if (!card.linked_account_id || !accountIds.has(card.linked_account_id)) continue;
    const account = accountsById.get(card.linked_account_id)!;
    const subscriptions = purchases.filter(
      (purchase) =>
        purchase.credit_card_id === card.id &&
        purchase.is_recurring &&
        purchase.entry_kind === "purchase",
    );
    for (const referenceMonth of referenceMonths) {
      const dueDate = getInvoiceDueDate(
        referenceMonth,
        card.closing_day,
        card.due_day,
      );
      if (dueDate < today || dueDate > input.endDate) continue;
      const invoice = invoicesByCardAndMonth.get(`${card.id}:${referenceMonth}`);
      if (invoice && invoiceTransactions.has(invoice.id)) continue;
      let amountInCardCurrency = invoice
        ? coerceMinorUnits(invoice.total_amount)
        : 0;
      for (const subscription of subscriptions) {
        const firstReference = getPurchaseReferenceMonth(
          subscription.purchase_date,
          card.closing_day,
        );
        if (
          referenceMonth >= firstReference &&
          !installmentsByPurchaseAndMonth.has(
            `${subscription.id}:${referenceMonth}`,
          )
        ) {
          amountInCardCurrency = coerceMinorUnits(
            amountInCardCurrency + coerceMinorUnits(subscription.total_amount),
          );
        }
      }
      if (amountInCardCurrency <= 0) continue;
      const accountAmount = convertMinorUnits(
        amountInCardCurrency,
        card.currency,
        account.currency,
        dueDate,
        conversionResult.samples,
      );
      if (accountAmount === null) {
        missingCurrencies.add(card.currency);
        continue;
      }
      events.push({
        id: `invoice:${invoice?.id ?? `${card.id}:${referenceMonth}`}`,
        accountId: card.linked_account_id,
        date: dueDate,
        description: `Fatura ${card.name}`,
        amountMinor: -accountAmount,
        kind: "card-invoice",
        categoryLabel: "Cartão de crédito",
      });
    }
  }

  if (input.scenario === "conservative") {
    const directHistorical = new Map<string, Map<string, number>>();
    const directLineMeta = new Map<
      string,
      { accountId: string; categoryId: string | null; label: string }
    >();
    for (const transaction of allTransactions) {
      if (
        !accountIds.has(transaction.account_id) ||
        transaction.transaction_date < historyStart ||
        transaction.transaction_date > historyEnd ||
        transaction.status !== "completed" ||
        transaction.transaction_type !== "expense" ||
        transaction.recurring_transaction_id ||
        transaction.origin_type === "credit_card_invoice_payment" ||
        transaction.origin_type === "investment"
      ) continue;
      const lineKey = `${transaction.account_id}:${transaction.category_id ?? "uncategorized"}`;
      const month = transaction.transaction_date.slice(0, 7);
      const amounts = directHistorical.get(lineKey) ?? new Map<string, number>();
      amounts.set(
        month,
        coerceMinorUnits(
          (amounts.get(month) ?? 0) + coerceMinorUnits(transaction.amount_minor),
        ),
      );
      directHistorical.set(lineKey, amounts);
      directLineMeta.set(lineKey, {
        accountId: transaction.account_id,
        categoryId: transaction.category_id,
        label: transaction.category_id
          ? categoryNames.get(transaction.category_id) ?? "Sem categoria"
          : "Sem categoria",
      });
    }
    const directPlanned = new Map<string, number>();
    for (const transaction of futureTransactions) {
      if (
        transaction.transaction_type !== "expense" ||
        transaction.recurring_transaction_id ||
        transaction.origin_type === "credit_card_invoice_payment" ||
        transaction.origin_type === "investment"
      ) continue;
      const key = `${transaction.account_id}:${transaction.category_id ?? "uncategorized"}:${transaction.transaction_date.slice(0, 7)}`;
      directPlanned.set(
        key,
        coerceMinorUnits(
          (directPlanned.get(key) ?? 0) + coerceMinorUnits(transaction.amount_minor),
        ),
      );
    }
    for (const [lineKey, history] of directHistorical) {
      const meta = directLineMeta.get(lineKey)!;
      const average = averageMonthlyExpenseMinor(history, input.averageMonths);
      for (const month of monthsInRange(startDate, input.endDate)) {
        const residual = residualVariableExpenseMinor(
          average,
          directPlanned.get(`${lineKey}:${month}`) ?? 0,
          forecastMonthProportion(month, startDate, input.endDate),
        );
        if (residual <= 0) continue;
        const eventDate = [input.endDate, monthEndFromMonth(month)].sort()[0];
        events.push({
          id: `average:direct:${lineKey}:${month}`,
          accountId: meta.accountId,
          date: eventDate < startDate ? startDate : eventDate,
          description: `Média variável · ${meta.label}`,
          amountMinor: -residual,
          kind: "variable-average",
          categoryLabel: meta.label,
          conservativeOnly: true,
        });
      }
    }

    const cardHistory = new Map<string, Map<string, number>>();
    const cardMeta = new Map<
      string,
      { cardId: string; categoryId: string | null; label: string }
    >();
    const cardPlanned = new Map<string, number>();
    for (const installment of installments) {
      const purchase = purchasesById.get(installment.purchase_id);
      if (!purchase || purchase.is_recurring) continue;
      const card = (cardsResult.data ?? []).find(
        (item) => item.id === installment.credit_card_id,
      );
      if (!card?.linked_account_id || !accountIds.has(card.linked_account_id)) continue;
      const lineKey = `${card.id}:${purchase.category_id ?? "uncategorized"}`;
      const direction = purchase.entry_kind === "purchase" ? 1 : -1;
      const amount = coerceMinorUnits(direction * coerceMinorUnits(installment.amount));
      const month = installment.competence_date.slice(0, 7);
      const label = purchase.category_id
        ? categoryNames.get(purchase.category_id) ?? card.name
        : card.name;
      cardMeta.set(lineKey, {
        cardId: card.id,
        categoryId: purchase.category_id,
        label,
      });
      if (
        installment.competence_date >= historyStart &&
        installment.competence_date <= historyEnd
      ) {
        const amounts = cardHistory.get(lineKey) ?? new Map<string, number>();
        amounts.set(month, coerceMinorUnits((amounts.get(month) ?? 0) + amount));
        cardHistory.set(lineKey, amounts);
      } else if (installment.competence_date >= monthStartFromDate(today)) {
        cardPlanned.set(
          `${lineKey}:${month}`,
          coerceMinorUnits((cardPlanned.get(`${lineKey}:${month}`) ?? 0) + amount),
        );
      }
    }
    for (const [lineKey, history] of cardHistory) {
      const meta = cardMeta.get(lineKey)!;
      const card = (cardsResult.data ?? []).find((item) => item.id === meta.cardId);
      if (!card?.linked_account_id) continue;
      const account = accountsById.get(card.linked_account_id);
      if (!account) continue;
      const average = Math.max(
        0,
        averageMonthlyExpenseMinor(history, input.averageMonths),
      );
      for (const referenceMonth of referenceMonths) {
        const dueDate = getInvoiceDueDate(
          referenceMonth,
          card.closing_day,
          card.due_day,
        );
        if (dueDate < startDate || dueDate > input.endDate) continue;
        const residualCardCurrency = residualVariableExpenseMinor(
          average,
          cardPlanned.get(`${lineKey}:${referenceMonth.slice(0, 7)}`) ?? 0,
        );
        if (residualCardCurrency <= 0) continue;
        const accountAmount = convertMinorUnits(
          residualCardCurrency,
          card.currency,
          account.currency,
          dueDate,
          conversionResult.samples,
        );
        if (accountAmount === null) {
          missingCurrencies.add(card.currency);
          continue;
        }
        events.push({
          id: `average:card:${lineKey}:${referenceMonth}`,
          accountId: account.id,
          date: dueDate,
          description: `Média variável · ${card.name} · ${meta.label}`,
          amountMinor: -accountAmount,
          kind: "variable-average",
          categoryLabel: meta.label,
          conservativeOnly: true,
        });
      }
    }
  }

  const timeline = buildCashFlowForecastTimeline({
    baselineDate: today,
    startDate,
    endDate: input.endDate,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currentBalanceMinor: coerceMinorUnits(account.current_balance_minor),
    })),
    events,
  });
  const points: CashFlowForecastReportPoint[] = timeline.points.map((point) => {
    const balancesByAccount = Object.fromEntries(
      accounts.map((account) => {
        const converted = convertMinorUnits(
          point.balancesByAccount[account.id] ?? 0,
          account.currency,
          input.currency,
          point.date,
          conversionResult.samples,
        );
        if (converted === null) missingCurrencies.add(account.currency);
        return [account.id, converted];
      }),
    );
    return {
      date: point.date,
      balancesByAccount,
      totalBalanceMinor: Object.values(balancesByAccount).reduce<number>(
        (sum, amount) => coerceMinorUnits(sum + (amount ?? 0)),
        0,
      ),
    };
  });
  const runningNativeBalances = { ...timeline.openingBalancesByAccount };
  const reportEvents: CashFlowForecastReportEvent[] = timeline.events.map((event) => {
    runningNativeBalances[event.accountId] = event.accountBalanceMinor;
    const account = accountsById.get(event.accountId)!;
    const amountMinor = convertMinorUnits(
      event.amountMinor,
      account.currency,
      input.currency,
      event.date,
      conversionResult.samples,
    );
    const accountBalanceMinor = convertMinorUnits(
      event.accountBalanceMinor,
      account.currency,
      input.currency,
      event.date,
      conversionResult.samples,
    );
    if (amountMinor === null || accountBalanceMinor === null) {
      missingCurrencies.add(account.currency);
    }
    return {
      id: event.id,
      date: event.date,
      accountId: event.accountId,
      accountName: account.name,
      description: event.description,
      categoryLabel: event.categoryLabel ?? null,
      kind: event.kind,
      amountMinor,
      accountBalanceMinor,
      totalBalanceMinor: sumConvertedBalances(
        runningNativeBalances,
        accountsById,
        input.currency,
        event.date,
        conversionResult.samples,
        missingCurrencies,
      ),
      conservativeOnly: event.conservativeOnly ?? false,
    };
  });
  const openingDate = startDate;
  const closingDate = input.endDate;
  const openingTotalMinor = sumConvertedBalances(
    timeline.openingBalancesByAccount,
    accountsById,
    input.currency,
    openingDate,
    conversionResult.samples,
    missingCurrencies,
  );
  const closingTotalMinor = sumConvertedBalances(
    timeline.closingBalancesByAccount,
    accountsById,
    input.currency,
    closingDate,
    conversionResult.samples,
    missingCurrencies,
  );

  return {
    accounts: accounts.map((account): CashFlowForecastReportAccount => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      openingBalanceMinor: convertMinorUnits(
        timeline.openingBalancesByAccount[account.id] ?? 0,
        account.currency,
        input.currency,
        openingDate,
        conversionResult.samples,
      ),
      closingBalanceMinor: convertMinorUnits(
        timeline.closingBalancesByAccount[account.id] ?? 0,
        account.currency,
        input.currency,
        closingDate,
        conversionResult.samples,
      ),
    })),
    points,
    events: reportEvents,
    openingTotalMinor,
    closingTotalMinor,
    lowestTotalMinor: points.length
      ? Math.min(...points.map((point) => point.totalBalanceMinor))
      : openingTotalMinor,
    missingCurrencies: [...missingCurrencies],
    hasError: Boolean(
      accountsResult.error ||
        transactionsResult.error ||
        transfersResult.error ||
        recurrencesResult.error ||
        cardsResult.error ||
        invoicesResult.error ||
        purchasesResult.error ||
        installmentsResult.error ||
        categoriesResult.error ||
        conversionResult.hasError
    ),
  };
}
