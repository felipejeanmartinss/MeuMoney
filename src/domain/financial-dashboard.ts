import { referenceMonthSchema, toReferenceMonth } from "./budgets";
import { assertMinorUnits } from "./money";
import type {
  FinancialContext,
  FinancialReportBasis,
  SupportedCurrency,
  TransactionOriginType,
  TransactionStatus,
  TransactionType,
} from "../types/database";

type DashboardEntryBase = {
  userId: string;
  currency: SupportedCurrency;
  amountMinor: number;
  categoryId: string | null;
  categoryName: string | null;
  context: FinancialContext | null;
};

export type DashboardTransactionEntry = DashboardEntryBase & {
  source: "transaction";
  transactionDate: string;
  transactionType: TransactionType;
  status: TransactionStatus;
  isActive: boolean;
  originType: TransactionOriginType;
};

export type DashboardCardInstallmentEntry = DashboardEntryBase & {
  source: "card_installment";
  competenceDate: string;
  purchaseActive: boolean;
  installmentCancelled: boolean;
};

export type DashboardTransferEntry = Omit<
  DashboardEntryBase,
  "categoryId" | "categoryName" | "context"
> & {
  source: "transfer";
  transactionDate: string;
};

export type DashboardEntry =
  | DashboardTransactionEntry
  | DashboardCardInstallmentEntry
  | DashboardTransferEntry;

export type DashboardBudgetInput = {
  userId: string;
  currency: SupportedCurrency;
  referenceMonth: string;
  plannedAmountMinor: number;
};

export type DashboardCategoryExpense = {
  categoryId: string;
  categoryName: string;
  context: FinancialContext;
  amountMinor: number;
};

export type DashboardCurrencySummary = {
  currency: SupportedCurrency;
  incomeAmountMinor: number;
  expenseAmountMinor: number;
  resultAmountMinor: number;
  plannedAmountMinor: number;
  budgetPercentageConsumed: number | null;
  categoryExpenses: DashboardCategoryExpense[];
};

export type DashboardMonthlySummary = Omit<
  DashboardCurrencySummary,
  "categoryExpenses"
> & {
  referenceMonth: string;
};

function addMinorUnits(current: number, amount: number) {
  return assertMinorUnits(assertMinorUnits(current) + assertMinorUnits(amount));
}

function emptyCurrencySummary(
  currency: SupportedCurrency,
): DashboardCurrencySummary {
  return {
    currency,
    incomeAmountMinor: 0,
    expenseAmountMinor: 0,
    resultAmountMinor: 0,
    plannedAmountMinor: 0,
    budgetPercentageConsumed: null,
    categoryExpenses: [],
  };
}

export function calculateFinancialDashboardMonth(input: {
  userId: string;
  referenceMonth: string;
  basis?: FinancialReportBasis;
  budgets: DashboardBudgetInput[];
  entries: DashboardEntry[];
}): DashboardCurrencySummary[] {
  const referenceMonth = toReferenceMonth(input.referenceMonth);
  const basis = input.basis ?? "competence";
  const summaries = new Map<SupportedCurrency, DashboardCurrencySummary>();
  const categories = new Map<
    SupportedCurrency,
    Map<string, DashboardCategoryExpense>
  >();

  const getSummary = (currency: SupportedCurrency) => {
    const current = summaries.get(currency) ?? emptyCurrencySummary(currency);
    summaries.set(currency, current);
    return current;
  };

  const addExpense = (
    entry: DashboardEntryBase,
    summary: DashboardCurrencySummary,
  ) => {
    if (!entry.categoryId || !entry.categoryName || !entry.context) return;
    summary.expenseAmountMinor = addMinorUnits(
      summary.expenseAmountMinor,
      entry.amountMinor,
    );
    const currencyCategories =
      categories.get(entry.currency) ??
      new Map<string, DashboardCategoryExpense>();
    const category = currencyCategories.get(entry.categoryId) ?? {
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      context: entry.context,
      amountMinor: 0,
    };
    category.amountMinor = addMinorUnits(
      category.amountMinor,
      entry.amountMinor,
    );
    currencyCategories.set(entry.categoryId, category);
    categories.set(entry.currency, currencyCategories);
  };

  for (const budget of input.budgets) {
    if (
      basis !== "competence" ||
      budget.userId !== input.userId ||
      budget.referenceMonth !== referenceMonth
    ) {
      continue;
    }
    const summary = getSummary(budget.currency);
    summary.plannedAmountMinor = addMinorUnits(
      summary.plannedAmountMinor,
      budget.plannedAmountMinor,
    );
  }

  for (const entry of input.entries) {
    if (entry.userId !== input.userId || entry.source === "transfer") continue;

    if (entry.source === "transaction") {
      if (
        !entry.transactionDate.startsWith(input.referenceMonth) ||
        entry.status !== "completed" ||
        !entry.isActive
      ) {
        continue;
      }
      if (entry.transactionType === "income") {
        const summary = getSummary(entry.currency);
        summary.incomeAmountMinor = addMinorUnits(
          summary.incomeAmountMinor,
          entry.amountMinor,
        );
      } else if (basis === "cash") {
        const summary = getSummary(entry.currency);
        if (entry.categoryId !== null) {
          addExpense(entry, summary);
        } else {
          summary.expenseAmountMinor = addMinorUnits(
            summary.expenseAmountMinor,
            entry.amountMinor,
          );
          if (entry.originType === "credit_card_invoice_payment") {
            const currencyCategories =
              categories.get(entry.currency) ??
              new Map<string, DashboardCategoryExpense>();
            const category = currencyCategories.get("cash-card-payments") ?? {
              categoryId: "cash-card-payments",
              categoryName: "Pagamento de cartões",
              context: entry.context ?? "personal",
              amountMinor: 0,
            };
            category.amountMinor = addMinorUnits(
              category.amountMinor,
              entry.amountMinor,
            );
            currencyCategories.set(category.categoryId, category);
            categories.set(entry.currency, currencyCategories);
          }
        }
      } else if (
        entry.originType !== "credit_card_invoice_payment" &&
        entry.categoryId !== null
      ) {
        addExpense(entry, getSummary(entry.currency));
      }
      continue;
    }

    if (
      basis === "competence" &&
      entry.competenceDate === referenceMonth &&
      entry.purchaseActive &&
      !entry.installmentCancelled
    ) {
      addExpense(entry, getSummary(entry.currency));
    }
  }

  return [...summaries.values()]
    .map((summary) => {
      summary.resultAmountMinor = assertMinorUnits(
        summary.incomeAmountMinor - summary.expenseAmountMinor,
      );
      summary.budgetPercentageConsumed =
        summary.plannedAmountMinor === 0
          ? null
          : Math.round(
              (summary.expenseAmountMinor / summary.plannedAmountMinor) *
                10_000,
            ) / 100;
      summary.categoryExpenses = [
        ...(categories.get(summary.currency)?.values() ?? []),
      ].sort(
        (left, right) =>
          right.amountMinor - left.amountMinor ||
          left.categoryName.localeCompare(right.categoryName, "pt-BR"),
      );
      return summary;
    })
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

export function referenceMonthsEndingAt(month: string, count = 6) {
  const [year, monthNumber] = referenceMonthSchema
    .parse(month)
    .split("-")
    .map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(year, monthNumber - count + index, 1),
    );
    return `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
  });
}

export function fillMonthlyEvolution(
  currency: SupportedCurrency,
  endingMonth: string,
  rows: DashboardMonthlySummary[],
) {
  const byMonth = new Map(
    rows
      .filter((row) => row.currency === currency)
      .map((row) => [row.referenceMonth.slice(0, 7), row]),
  );
  return referenceMonthsEndingAt(endingMonth).map((referenceMonth) => {
    const row = byMonth.get(referenceMonth);
    return (
      row ?? {
        currency,
        referenceMonth: `${referenceMonth}-01`,
        incomeAmountMinor: 0,
        expenseAmountMinor: 0,
        resultAmountMinor: 0,
        plannedAmountMinor: 0,
        budgetPercentageConsumed: null,
      }
    );
  });
}

export function sumAccountBalancesByCurrency(
  rows: Array<{
    userId: string;
    currency: SupportedCurrency;
    currentBalanceMinor: number;
    active: boolean;
  }>,
  userId: string,
) {
  const totals = new Map<SupportedCurrency, number>();
  for (const row of rows) {
    if (row.userId !== userId || !row.active) continue;
    totals.set(
      row.currency,
      addMinorUnits(
        totals.get(row.currency) ?? 0,
        row.currentBalanceMinor,
      ),
    );
  }
  return totals;
}

export function limitExpenseCategories(
  rows: DashboardCategoryExpense[],
  maximumVisible = 5,
): DashboardCategoryExpense[] {
  if (!Number.isSafeInteger(maximumVisible) || maximumVisible < 2) {
    throw new Error("O limite de categorias deve ser um inteiro maior que um.");
  }
  const sorted = [...rows].sort(
    (left, right) =>
      right.amountMinor - left.amountMinor ||
      left.categoryName.localeCompare(right.categoryName, "pt-BR"),
  );
  if (sorted.length <= maximumVisible) return sorted;

  const visible = sorted.slice(0, maximumVisible - 1);
  const remaining = sorted.slice(maximumVisible - 1);
  return [
    ...visible,
    {
      categoryId: "other-categories",
      categoryName: "Outras",
      context: remaining[0]?.context ?? "personal",
      amountMinor: remaining.reduce(
        (total, row) => addMinorUnits(total, row.amountMinor),
        0,
      ),
    },
  ];
}

export function calculateExecutiveDashboardNetWorth(input: {
  accountBalanceMinor: number;
  manualNetWorthMinor: number;
  creditCardBalanceMinor: number;
}) {
  return assertMinorUnits(
    assertMinorUnits(input.accountBalanceMinor) +
      assertMinorUnits(input.manualNetWorthMinor) -
      Math.max(0, assertMinorUnits(input.creditCardBalanceMinor)),
  );
}

export function calculateSavingsRatePercentage(input: {
  incomeAmountMinor: number;
  resultAmountMinor: number;
}) {
  const incomeAmountMinor = assertMinorUnits(input.incomeAmountMinor);
  const resultAmountMinor = assertMinorUnits(input.resultAmountMinor);
  if (incomeAmountMinor <= 0) return null;

  return Math.round((resultAmountMinor / incomeAmountMinor) * 1_000) / 10;
}
