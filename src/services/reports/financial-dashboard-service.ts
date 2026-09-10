import "server-only";
import {
  calculateExecutiveDashboardNetWorth,
  fillMonthlyEvolution,
  limitExpenseCategories,
  referenceMonthsEndingAt,
  type DashboardMonthlySummary,
} from "@/domain/financial-dashboard";
import { coerceMinorUnits } from "@/domain/money";
import { SUPPORTED_CURRENCIES } from "@/domain/currencies";
import {
  convertMinorUnits,
  type CurrencyConversionSample,
} from "@/domain/currency-conversion";
import { requireUser } from "@/services/auth/server-auth";
import type {
  AccountBalance,
  FinancialDashboardExpenseCategory,
  FinancialDashboardExpenseCategoryBasis,
  FinancialDashboardInvoice,
  FinancialDashboardMonthlyBasisSummary,
  FinancialDashboardMonthlySummary,
  FinancialDashboardUpcomingRecurrence,
  MonthlyBudgetProgress,
  NetWorthSummary,
  Profile,
  FinancialReportBasis,
  SupportedCurrency,
} from "@/types/database";

const monthlySummaryColumns =
  "basis, user_id, reference_month, currency, income_amount_minor, expense_amount_minor, result_amount_minor, planned_amount_minor, budget_percentage_consumed";
const categoryColumns =
  "basis, user_id, reference_month, currency, category_id, category_name, context, expense_amount_minor";
const recurrenceColumns =
  "id, user_id, currency, account_name, category_name, context, transaction_type, description, amount_minor, frequency, next_occurrence";
const invoiceColumns =
  "id, user_id, credit_card_id, credit_card_name, currency, reference_month, due_date, status, effective_status, total_amount_minor, outstanding_amount_minor";
const accountColumns =
  "id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at, current_balance_minor, projected_balance_minor";
const budgetProgressColumns =
  "budget_id, user_id, category_id, category_name, context, currency, reference_month, planned_amount_minor, realized_amount_minor, available_amount_minor, percentage_consumed, category_kind";
const netWorthColumns =
  "user_id, currency, assets_minor, manual_assets_minor, investments_minor, liabilities_minor, net_worth_minor";
const creditCardBalanceColumns =
  "id, user_id, currency, current_balance_minor";

function normalizeMonthlySummary(
  row: FinancialDashboardMonthlyBasisSummary,
): FinancialDashboardMonthlyBasisSummary {
  return {
    ...row,
    income_amount_minor: coerceMinorUnits(row.income_amount_minor),
    expense_amount_minor: coerceMinorUnits(row.expense_amount_minor),
    result_amount_minor: coerceMinorUnits(row.result_amount_minor),
    planned_amount_minor: coerceMinorUnits(row.planned_amount_minor),
    budget_percentage_consumed:
      row.budget_percentage_consumed === null
        ? null
        : Number(row.budget_percentage_consumed),
  };
}

function normalizeAccount(row: AccountBalance): AccountBalance {
  return {
    ...row,
    opening_balance_minor: coerceMinorUnits(row.opening_balance_minor),
    current_balance_minor: coerceMinorUnits(row.current_balance_minor),
    projected_balance_minor: coerceMinorUnits(row.projected_balance_minor),
  };
}

function normalizeCategory(
  row: FinancialDashboardExpenseCategoryBasis,
): FinancialDashboardExpenseCategoryBasis {
  return {
    ...row,
    expense_amount_minor: coerceMinorUnits(row.expense_amount_minor),
  };
}

function normalizeRecurrence(
  row: FinancialDashboardUpcomingRecurrence,
): FinancialDashboardUpcomingRecurrence {
  return { ...row, amount_minor: coerceMinorUnits(row.amount_minor) };
}

function normalizeInvoice(
  row: FinancialDashboardInvoice,
): FinancialDashboardInvoice {
  return {
    ...row,
    total_amount_minor: coerceMinorUnits(row.total_amount_minor),
    outstanding_amount_minor: coerceMinorUnits(row.outstanding_amount_minor),
  };
}

function normalizeBudgetProgress(
  row: MonthlyBudgetProgress,
): MonthlyBudgetProgress {
  return {
    ...row,
    planned_amount_minor: coerceMinorUnits(row.planned_amount_minor),
    realized_amount_minor: coerceMinorUnits(row.realized_amount_minor),
    available_amount_minor: coerceMinorUnits(row.available_amount_minor),
    percentage_consumed:
      row.percentage_consumed === null
        ? null
        : Number(row.percentage_consumed),
  };
}

function normalizeNetWorth(row: NetWorthSummary): NetWorthSummary {
  return {
    ...row,
    assets_minor: coerceMinorUnits(row.assets_minor),
    manual_assets_minor: coerceMinorUnits(row.manual_assets_minor),
    investments_minor: coerceMinorUnits(row.investments_minor),
    liabilities_minor: coerceMinorUnits(row.liabilities_minor),
    net_worth_minor: coerceMinorUnits(row.net_worth_minor),
  };
}

function todayInSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type FinancialDashboardCurrencyData = {
  currency: SupportedCurrency;
  accounts: AccountBalance[];
  accountBalanceMinor: number;
  selectedMonth: FinancialDashboardMonthlySummary;
  evolution: DashboardMonthlySummary[];
  categories: FinancialDashboardExpenseCategory[];
  recurrences: FinancialDashboardUpcomingRecurrence[];
  invoices: FinancialDashboardInvoice[];
  spendingTracker: MonthlyBudgetProgress[];
  netWorthMinor: number;
};

export type FinancialDashboardData = {
  userEmail: string;
  profile: Profile | null;
  currencies: FinancialDashboardCurrencyData[];
  missingCurrencies: SupportedCurrency[];
  hasError: boolean;
};

export async function getFinancialDashboard(
  referenceMonth: string,
  basis: FinancialReportBasis = "competence",
): Promise<FinancialDashboardData> {
  const { supabase, user } = await requireUser();
  const months = referenceMonthsEndingAt(referenceMonth);
  const firstReferenceMonth = `${months[0]}-01`;
  const selectedReferenceMonth = `${referenceMonth}-01`;
  const today = todayInSaoPaulo();

  const [
    profileResult,
    accountsResult,
    summariesResult,
    categoriesResult,
    budgetsResult,
    netWorthResult,
    cardBalancesResult,
    recurrenceResults,
    invoiceResults,
    conversionResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, preferred_currency, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("account_balances")
      .select(accountColumns)
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("financial_dashboard_monthly_basis")
      .select(monthlySummaryColumns)
      .eq("user_id", user.id)
      .eq("basis", basis)
      .gte("reference_month", firstReferenceMonth)
      .lte("reference_month", selectedReferenceMonth)
      .order("reference_month"),
    supabase
      .from("financial_dashboard_expense_categories_basis")
      .select(categoryColumns)
      .eq("user_id", user.id)
      .eq("basis", basis)
      .eq("reference_month", selectedReferenceMonth)
      .order("expense_amount_minor", { ascending: false }),
    supabase
      .from("monthly_budget_progress")
      .select(budgetProgressColumns)
      .eq("user_id", user.id)
      .eq("reference_month", selectedReferenceMonth)
      .eq("category_kind", "expense")
      .order("percentage_consumed", { ascending: false }),
    supabase
      .from("net_worth_summary")
      .select(netWorthColumns)
      .eq("user_id", user.id),
    supabase
      .from("credit_card_summaries")
      .select(creditCardBalanceColumns)
      .eq("user_id", user.id)
      .eq("is_active", true),
    Promise.all(
      SUPPORTED_CURRENCIES.map((currency) =>
        supabase
          .from("financial_dashboard_upcoming_recurrences")
          .select(recurrenceColumns)
          .eq("user_id", user.id)
          .eq("currency", currency)
          .gte("next_occurrence", today)
          .order("next_occurrence")
          .limit(5),
      ),
    ),
    Promise.all(
      SUPPORTED_CURRENCIES.map((currency) =>
        supabase
          .from("financial_dashboard_invoices")
          .select(invoiceColumns)
          .eq("user_id", user.id)
          .eq("currency", currency)
          .order("due_date")
          .limit(5),
      ),
    ),
    supabase
      .from("transfers")
      .select("currency, destination_currency, amount_minor, destination_amount_minor, transaction_date")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .eq("is_active", true)
      .not("destination_account_id", "is", null)
      .not("destination_currency", "is", null)
      .not("destination_amount_minor", "is", null)
      .order("transaction_date", { ascending: false }),
  ]);

  const accounts = (accountsResult.data ?? []).map(normalizeAccount);
  const summaries = (summariesResult.data ?? []).map(
    normalizeMonthlySummary,
  );
  const categories = (categoriesResult.data ?? []).map(normalizeCategory);
  const budgets = (budgetsResult.data ?? []).map(normalizeBudgetProgress);
  const netWorth = (netWorthResult.data ?? []).map(normalizeNetWorth);
  const cardBalances = (cardBalancesResult.data ?? []).map((card) => ({
    ...card,
    current_balance_minor: coerceMinorUnits(card.current_balance_minor),
  }));
  const recurrences = recurrenceResults.flatMap((result) =>
    (result.data ?? []).map(normalizeRecurrence),
  );
  const invoices = invoiceResults.flatMap((result) =>
    (result.data ?? []).map(normalizeInvoice),
  );
  const profile = profileResult.data;
  const preferredCurrency = profile?.preferred_currency ?? "BRL";
  const conversionSamples: CurrencyConversionSample[] = (
    conversionResult.data ?? []
  ).flatMap((row) =>
    row.destination_currency && row.destination_amount_minor
      ? [{
          sourceCurrency: row.currency,
          destinationCurrency: row.destination_currency,
          sourceAmountMinor: coerceMinorUnits(row.amount_minor),
          destinationAmountMinor: coerceMinorUnits(row.destination_amount_minor),
          transactionDate: row.transaction_date,
        }]
      : [],
  );
  const missingCurrencies = new Set<SupportedCurrency>();
  const converted = (
    value: number,
    sourceCurrency: SupportedCurrency,
    referenceDate: string,
  ) => {
    const result = convertMinorUnits(
      coerceMinorUnits(value),
      sourceCurrency,
      preferredCurrency,
      referenceDate,
      conversionSamples,
    );
    if (result === null) {
      missingCurrencies.add(sourceCurrency);
      return 0;
    }
    return result;
  };
  const convertedAccounts = accounts.map((account) => ({
    ...account,
    currency: preferredCurrency,
    opening_balance_minor: converted(account.opening_balance_minor, account.currency, today),
    current_balance_minor: converted(account.current_balance_minor, account.currency, today),
    projected_balance_minor: converted(account.projected_balance_minor, account.currency, today),
  }));
  const accountBalanceMinor = convertedAccounts.reduce(
    (total, account) => coerceMinorUnits(total + account.current_balance_minor),
    0,
  );
  const summaryByMonth = new Map<string, FinancialDashboardMonthlySummary>();
  for (const row of summaries) {
    const date = `${row.reference_month.slice(0, 7)}-31`;
    const current = summaryByMonth.get(row.reference_month) ?? {
      user_id: user.id,
      reference_month: row.reference_month,
      currency: preferredCurrency,
      income_amount_minor: 0,
      expense_amount_minor: 0,
      result_amount_minor: 0,
      planned_amount_minor: 0,
      budget_percentage_consumed: null,
    };
    current.income_amount_minor = coerceMinorUnits(
      current.income_amount_minor + converted(row.income_amount_minor, row.currency, date),
    );
    current.expense_amount_minor = coerceMinorUnits(
      current.expense_amount_minor + converted(row.expense_amount_minor, row.currency, date),
    );
    current.planned_amount_minor = coerceMinorUnits(
      current.planned_amount_minor + converted(row.planned_amount_minor, row.currency, date),
    );
    current.result_amount_minor = coerceMinorUnits(
      current.income_amount_minor - current.expense_amount_minor,
    );
    current.budget_percentage_consumed = current.planned_amount_minor > 0
      ? (current.expense_amount_minor / current.planned_amount_minor) * 100
      : null;
    summaryByMonth.set(row.reference_month, current);
  }
  const selectedMonth = summaryByMonth.get(selectedReferenceMonth) ?? {
    user_id: user.id,
    reference_month: selectedReferenceMonth,
    currency: preferredCurrency,
    income_amount_minor: 0,
    expense_amount_minor: 0,
    result_amount_minor: 0,
    planned_amount_minor: 0,
    budget_percentage_consumed: null,
  };
  const categoryMap = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      context: FinancialDashboardExpenseCategory["context"];
      amountMinor: number;
    }
  >();
  for (const row of categories) {
    const categoryId = row.category_id ?? `cash-card-payment-${row.context}`;
    const key = `${categoryId}:${row.context}`;
    const current = categoryMap.get(key) ?? {
      categoryId,
      categoryName: row.category_name,
      context: row.context,
      amountMinor: 0,
    };
    current.amountMinor = coerceMinorUnits(
      current.amountMinor + converted(row.expense_amount_minor, row.currency, `${referenceMonth}-31`),
    );
    categoryMap.set(key, current);
  }
  const convertedCategories = limitExpenseCategories([...categoryMap.values()]).map((row) => ({
    user_id: user.id,
    reference_month: selectedReferenceMonth,
    currency: preferredCurrency,
    category_id: row.categoryId,
    category_name: row.categoryName,
    context: row.context,
    expense_amount_minor: row.amountMinor,
  }));
  const convertedRecurrences = recurrences.map((row) => ({
    ...row,
    currency: preferredCurrency,
    amount_minor: converted(row.amount_minor, row.currency, row.next_occurrence),
  }));
  const convertedInvoices = invoices.map((row) => ({
    ...row,
    currency: preferredCurrency,
    total_amount_minor: converted(row.total_amount_minor, row.currency, row.due_date),
    outstanding_amount_minor: converted(row.outstanding_amount_minor, row.currency, row.due_date),
  }));
  const manualNetWorthMinor = netWorth.reduce(
    (total, row) => coerceMinorUnits(total + converted(row.net_worth_minor, row.currency, today)),
    0,
  );
  const creditCardBalanceMinor = cardBalances.reduce(
    (total, card) => coerceMinorUnits(
      total + converted(Math.max(0, card.current_balance_minor), card.currency, today),
    ),
    0,
  );
  const currencies: FinancialDashboardCurrencyData[] = [{
    currency: preferredCurrency,
    accounts: convertedAccounts,
    accountBalanceMinor,
    selectedMonth,
    evolution: fillMonthlyEvolution(
      preferredCurrency,
      referenceMonth,
      [...summaryByMonth.values()].map((row) => ({
        currency: preferredCurrency,
        referenceMonth: row.reference_month,
        incomeAmountMinor: row.income_amount_minor,
        expenseAmountMinor: row.expense_amount_minor,
        resultAmountMinor: row.result_amount_minor,
        plannedAmountMinor: row.planned_amount_minor,
        budgetPercentageConsumed: row.budget_percentage_consumed,
      })),
    ),
    categories: convertedCategories,
    recurrences: convertedRecurrences,
    invoices: convertedInvoices,
    spendingTracker: budgets.filter((row) => row.currency === preferredCurrency),
    netWorthMinor: calculateExecutiveDashboardNetWorth({
      accountBalanceMinor,
      manualNetWorthMinor,
      creditCardBalanceMinor,
    }),
  }];

  return {
    userEmail: user.email ?? "",
    profile,
    currencies,
    missingCurrencies: [...missingCurrencies],
    hasError: Boolean(
      profileResult.error ||
        accountsResult.error ||
        summariesResult.error ||
        categoriesResult.error ||
        budgetsResult.error ||
        netWorthResult.error ||
        cardBalancesResult.error ||
        recurrenceResults.some((result) => result.error) ||
        invoiceResults.some((result) => result.error) ||
        conversionResult.error,
    ),
  };
}
