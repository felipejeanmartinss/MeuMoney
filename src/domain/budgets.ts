import { z } from "zod";
import { FINANCIAL_CONTEXTS } from "./accounts";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { assertMinorUnits, parseMoneyInputToMinor } from "./money";
import type {
  FinancialContext,
  SupportedCurrency,
  TransactionOriginType,
  TransactionStatus,
  TransactionType,
} from "../types/database";

export const referenceMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe um mês válido.");

export const budgetFilterSchema = z.object({
  month: referenceMonthSchema,
  context: z.enum(FINANCIAL_CONTEXTS),
  currency: z.enum(SUPPORTED_CURRENCIES),
});

const plannedMoneyInput = z.string().trim().transform((value, context) => {
  try {
    const amount = parseMoneyInputToMinor(value);
    if (amount < 0) {
      context.addIssue({
        code: "custom",
        message: "O orçamento não pode ser negativo.",
      });
      return z.NEVER;
    }
    return amount;
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error ? error.message : "Informe um valor válido.",
    });
    return z.NEVER;
  }
});

export const monthlyBudgetRowSchema = z.object({
  categoryId: z.uuid("Categoria inválida."),
  plannedAmountMinor: plannedMoneyInput,
});

export const monthlyBudgetBatchSchema = z.object({
  referenceMonth: referenceMonthSchema,
  context: z.enum(FINANCIAL_CONTEXTS),
  currency: z.enum(SUPPORTED_CURRENCIES),
  rows: z.array(monthlyBudgetRowSchema).max(1200),
});

export const annualBudgetBatchSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
  context: z.enum(FINANCIAL_CONTEXTS),
  currency: z.enum(SUPPORTED_CURRENCIES),
  rows: z.array(z.object({
    categoryId: z.uuid("Categoria inválida."),
    referenceMonth: z.string().regex(
      /^\d{4}-(0[1-9]|1[0-2])-01$/,
      "Mês do orçamento inválido.",
    ),
    plannedAmountMinor: plannedMoneyInput,
  })).max(2400),
});

export function toReferenceMonth(month: string) {
  return `${referenceMonthSchema.parse(month)}-01`;
}

export function currentReferenceMonth(
  now = new Date(),
  timeZone = "America/Sao_Paulo",
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Não foi possível determinar o mês atual.");
  return `${year}-${month}`;
}

export function previousReferenceMonth(month: string) {
  const [year, monthNumber] = referenceMonthSchema.parse(month).split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type BudgetPlanInput = {
  userId: string;
  categoryId: string;
  categoryName: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  referenceMonth: string;
  plannedAmountMinor: number;
};

export type ManualConsumptionInput = {
  userId: string;
  categoryId: string | null;
  categoryName: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  amountMinor: number;
  transactionDate: string;
  transactionType: TransactionType;
  status: TransactionStatus;
  isActive: boolean;
  originType: TransactionOriginType;
};

export type CardInstallmentConsumptionInput = {
  userId: string;
  categoryId: string;
  categoryName: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  amountMinor: number;
  competenceDate: string;
  purchaseActive: boolean;
  installmentCancelled: boolean;
};

export type BudgetProgress = {
  categoryId: string;
  categoryName: string;
  plannedAmountMinor: number;
  realizedAmountMinor: number;
  availableAmountMinor: number;
  percentageConsumed: number | null;
};

function addMinorUnits(current: number, amount: number) {
  return assertMinorUnits(assertMinorUnits(current) + assertMinorUnits(amount));
}

export function calculateMonthlyBudgetProgress(input: {
  userId: string;
  referenceMonth: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  budgets: BudgetPlanInput[];
  manualExpenses: ManualConsumptionInput[];
  cardInstallments: CardInstallmentConsumptionInput[];
}): BudgetProgress[] {
  const referenceMonth = toReferenceMonth(input.referenceMonth);
  const byCategory = new Map<
    string,
    { categoryName: string; planned: number; realized: number }
  >();

  for (const budget of input.budgets) {
    if (
      budget.userId !== input.userId ||
      budget.referenceMonth !== referenceMonth ||
      budget.context !== input.context ||
      budget.currency !== input.currency
    ) {
      continue;
    }
    byCategory.set(budget.categoryId, {
      categoryName: budget.categoryName,
      planned: assertMinorUnits(budget.plannedAmountMinor),
      realized: 0,
    });
  }

  for (const expense of input.manualExpenses) {
    if (
      expense.userId !== input.userId ||
      expense.categoryId === null ||
      expense.context !== input.context ||
      expense.currency !== input.currency ||
      !expense.transactionDate.startsWith(input.referenceMonth) ||
      expense.transactionType !== "expense" ||
      expense.status !== "completed" ||
      !expense.isActive ||
      expense.originType === "credit_card_invoice_payment"
    ) {
      continue;
    }
    const current = byCategory.get(expense.categoryId) ?? {
      categoryName: expense.categoryName,
      planned: 0,
      realized: 0,
    };
    current.realized = addMinorUnits(current.realized, expense.amountMinor);
    byCategory.set(expense.categoryId, current);
  }

  for (const installment of input.cardInstallments) {
    if (
      installment.userId !== input.userId ||
      installment.context !== input.context ||
      installment.currency !== input.currency ||
      installment.competenceDate !== referenceMonth ||
      !installment.purchaseActive ||
      installment.installmentCancelled
    ) {
      continue;
    }
    const current = byCategory.get(installment.categoryId) ?? {
      categoryName: installment.categoryName,
      planned: 0,
      realized: 0,
    };
    current.realized = addMinorUnits(
      current.realized,
      installment.amountMinor,
    );
    byCategory.set(installment.categoryId, current);
  }

  return [...byCategory.entries()]
    .map(([categoryId, values]) => ({
      categoryId,
      categoryName: values.categoryName,
      plannedAmountMinor: values.planned,
      realizedAmountMinor: values.realized,
      availableAmountMinor: assertMinorUnits(
        values.planned - values.realized,
      ),
      percentageConsumed:
        values.planned === 0
          ? null
          : Math.round((values.realized / values.planned) * 10_000) / 100,
    }))
    .sort((left, right) =>
      left.categoryName.localeCompare(right.categoryName, "pt-BR"),
    );
}

export function summarizeBudgetProgress(rows: BudgetProgress[]) {
  const totals = rows.reduce(
    (summary, row) => ({
      plannedAmountMinor: addMinorUnits(
        summary.plannedAmountMinor,
        row.plannedAmountMinor,
      ),
      realizedAmountMinor: addMinorUnits(
        summary.realizedAmountMinor,
        row.realizedAmountMinor,
      ),
    }),
    { plannedAmountMinor: 0, realizedAmountMinor: 0 },
  );

  return {
    ...totals,
    availableAmountMinor: assertMinorUnits(
      totals.plannedAmountMinor - totals.realizedAmountMinor,
    ),
    percentageConsumed:
      totals.plannedAmountMinor === 0
        ? null
        : Math.round(
            (totals.realizedAmountMinor / totals.plannedAmountMinor) * 10_000,
          ) / 100,
  };
}

export type BudgetHistoryMonth = {
  referenceMonth: string;
  amountMinor: number;
};

export type BudgetHistoryStats = {
  categoryId: string;
  categoryName: string;
  minimumAmountMinor: number;
  averageAmountMinor: number;
  medianAmountMinor: number;
  maximumAmountMinor: number;
  plannedAmountMinor: number;
  realizedAmountMinor: number;
  percentageConsumed: number | null;
  suggestedAmountMinor: number;
  seasonal: boolean;
  seasonalReferenceMonth: string | null;
};

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

export function calculateBudgetHistoryStats(input: {
  categoryId: string;
  categoryName: string;
  history: BudgetHistoryMonth[];
  plannedAmountMinor: number;
  realizedAmountMinor: number;
  referenceMonth: string;
}): BudgetHistoryStats {
  const values = input.history.map((row) => Math.max(0, row.amountMinor));
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = values.length ? Math.round(total / values.length) : 0;
  const targetMonth = input.referenceMonth.slice(5, 7);
  const seasonalRows = input.history.filter((row) => row.referenceMonth.slice(5, 7) === targetMonth);
  const seasonalAverage = seasonalRows.length
    ? Math.round(seasonalRows.reduce((sum, row) => sum + Math.max(0, row.amountMinor), 0) / seasonalRows.length)
    : 0;
  const maximum = values.length ? Math.max(...values) : 0;
  const seasonal = maximum > 0 && (maximum >= average * 1.5 || seasonalAverage >= average * 1.25);
  const suggested = seasonal
    ? Math.max(average, median(values), seasonalAverage)
    : Math.max(average, median(values));
  return {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    minimumAmountMinor: values.length ? Math.min(...values) : 0,
    averageAmountMinor: average,
    medianAmountMinor: median(values),
    maximumAmountMinor: maximum,
    plannedAmountMinor: input.plannedAmountMinor,
    realizedAmountMinor: input.realizedAmountMinor,
    percentageConsumed: input.plannedAmountMinor > 0
      ? Math.round((input.realizedAmountMinor / input.plannedAmountMinor) * 10_000) / 100
      : null,
    suggestedAmountMinor: suggested,
    seasonal,
    seasonalReferenceMonth: seasonal ? targetMonth : null,
  };
}
