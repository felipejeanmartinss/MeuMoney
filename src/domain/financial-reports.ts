import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { assertMinorUnits } from "./money";
import { nextRecurrenceDate } from "./recurring-transactions";
import type {
  FinancialReportBasis,
  RecurrenceFrequency,
  SupportedCurrency,
} from "@/types/database";

export const FINANCIAL_REPORT_TYPES = [
  "income-expense",
  "fixed-expenses",
  "period-comparison",
  "asset-performance",
] as const;

export type FinancialReportType = (typeof FINANCIAL_REPORT_TYPES)[number];

export const FINANCIAL_REPORT_LABELS: Record<FinancialReportType, string> = {
  "income-expense": "Receitas x despesas",
  "fixed-expenses": "Despesas fixas",
  "period-comparison": "Comparativo entre períodos",
  "asset-performance": "Performance de ativos",
};

export const financialReportTypeSchema = z.enum(FINANCIAL_REPORT_TYPES);
export const reportContextSchema = z.enum(["all", "personal", "professional"]);
export const reportPositionStateSchema = z.enum(["active", "all"]);

export const reportYearSchema = z.coerce.number().int().min(2000).max(2200);
export const financialReportFilterSchema = z.object({
  year: reportYearSchema,
  currency: z.enum(SUPPORTED_CURRENCIES),
  basis: z.enum(["competence", "cash"]),
});

const reportMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe um mês válido.");

export const periodComparisonFilterSchema = z
  .object({
    firstStart: reportMonthSchema,
    firstEnd: reportMonthSchema,
    secondStart: reportMonthSchema,
    secondEnd: reportMonthSchema,
  })
  .superRefine((value, context) => {
    if (value.firstStart > value.firstEnd) {
      context.addIssue({
        code: "custom",
        path: ["firstEnd"],
        message: "O fim do primeiro período deve ser posterior ao início.",
      });
    }
    if (value.secondStart > value.secondEnd) {
      context.addIssue({
        code: "custom",
        path: ["secondEnd"],
        message: "O fim do segundo período deve ser posterior ao início.",
      });
    }
  });

export type IncomeExpenseReportRow = {
  referenceMonth: string;
  incomeAmountMinor: number;
  expenseAmountMinor: number;
  resultAmountMinor: number;
};

export function fillIncomeExpenseReportYear(
  year: number,
  rows: readonly IncomeExpenseReportRow[],
): IncomeExpenseReportRow[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const row = rows.find((item) => item.referenceMonth.startsWith(month));
    return row ?? {
      referenceMonth: `${month}-01`,
      incomeAmountMinor: 0,
      expenseAmountMinor: 0,
      resultAmountMinor: 0,
    };
  });
}

export function summarizeIncomeExpenseReport(
  rows: readonly IncomeExpenseReportRow[],
) {
  const totals = rows.reduce(
    (current, row) => ({
      incomeAmountMinor: assertMinorUnits(
        current.incomeAmountMinor + assertMinorUnits(row.incomeAmountMinor),
      ),
      expenseAmountMinor: assertMinorUnits(
        current.expenseAmountMinor + assertMinorUnits(row.expenseAmountMinor),
      ),
    }),
    { incomeAmountMinor: 0, expenseAmountMinor: 0 },
  );
  return {
    ...totals,
    resultAmountMinor: assertMinorUnits(
      totals.incomeAmountMinor - totals.expenseAmountMinor,
    ),
  };
}

export function reportBasisDescription(basis: FinancialReportBasis) {
  return basis === "competence"
    ? "Compras de cartão entram pela competência das parcelas; pagamentos de fatura e movimentações de capital de investimentos não duplicam o resultado."
    : "Saídas são reconhecidas quando o dinheiro deixa a conta, incluindo pagamentos de cartão; aplicações e resgates de investimento permanecem movimentos patrimoniais.";
}

export type FinancialReportSelection = {
  year: number;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
};

export type CategoryMonthlyReportEntry = {
  rowId: string;
  section: "income" | "expense";
  groupLabel: string;
  label: string;
  categoryKey?: string;
  categoryLabel?: string;
  subcategoryKey?: string | null;
  subcategoryLabel?: string | null;
  isFixedExpense?: boolean;
  referenceMonth: string;
  amountMinor: number;
};

export type MonthlyReportMatrixRow = {
  rowId: string;
  section: "income" | "expense";
  groupLabel: string;
  label: string;
  categoryKey: string;
  categoryLabel: string;
  subcategoryKey: string | null;
  subcategoryLabel: string | null;
  monthAmountsMinor: number[];
  totalAmountMinor: number;
};

function reportHierarchy(entry: CategoryMonthlyReportEntry) {
  const [fallbackCategory, ...fallbackSubcategory] = entry.label.split(" › ");
  return {
    categoryKey: entry.categoryKey ?? entry.rowId,
    categoryLabel: entry.categoryLabel ?? fallbackCategory,
    subcategoryKey: entry.subcategoryKey ?? null,
    subcategoryLabel:
      entry.subcategoryLabel ??
      (fallbackSubcategory.length ? fallbackSubcategory.join(" › ") : null),
  };
}

function compareMinorDescending(left: number, right: number) {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

export function buildMonthlyCategoryMatrix(
  year: number,
  entries: readonly CategoryMonthlyReportEntry[],
): MonthlyReportMatrixRow[] {
  const rows = new Map<string, MonthlyReportMatrixRow>();

  for (const entry of entries) {
    const amount = assertMinorUnits(entry.amountMinor);
    const match = entry.referenceMonth.match(/^(\d{4})-(\d{2})/);
    if (!match || Number(match[1]) !== year) continue;
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;

    const key = `${entry.section}:${entry.rowId}`;
    const hierarchy = reportHierarchy(entry);
    const row = rows.get(key) ?? {
      rowId: key,
      section: entry.section,
      groupLabel: entry.groupLabel,
      label: entry.label,
      ...hierarchy,
      monthAmountsMinor: Array.from({ length: 12 }, () => 0),
      totalAmountMinor: 0,
    };
    row.monthAmountsMinor[monthIndex] = assertMinorUnits(
      row.monthAmountsMinor[monthIndex] + amount,
    );
    row.totalAmountMinor = assertMinorUnits(row.totalAmountMinor + amount);
    rows.set(key, row);
  }

  return [...rows.values()].sort((left, right) => {
    if (left.section !== right.section) {
      return left.section === "income" ? -1 : 1;
    }
    return (
      compareMinorDescending(left.totalAmountMinor, right.totalAmountMinor) ||
      left.groupLabel.localeCompare(right.groupLabel, "pt-BR") ||
      left.label.localeCompare(right.label, "pt-BR")
    );
  });
}

export type FixedExpenseRule = {
  rowId: string;
  groupLabel: string;
  label: string;
  amountMinor: number;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string | null;
};

export function projectFixedExpenseMatrix(
  year: number,
  rules: readonly FixedExpenseRule[],
): MonthlyReportMatrixRow[] {
  const rangeStart = `${year}-01-01`;
  const rangeEnd = `${year}-12-31`;
  const entries: CategoryMonthlyReportEntry[] = [];

  for (const rule of rules) {
    let occurrence = rule.startDate;
    let iterations = 0;
    while (occurrence < rangeStart) {
      occurrence = nextRecurrenceDate({
        startDate: rule.startDate,
        currentOccurrence: occurrence,
        frequency: rule.frequency,
      });
      iterations += 1;
      if (iterations > 10000) throw new Error("Fixed expense projection limit exceeded.");
    }

    while (
      occurrence <= rangeEnd &&
      (rule.endDate === null || occurrence <= rule.endDate)
    ) {
      entries.push({
        rowId: rule.rowId,
        section: "expense",
        groupLabel: rule.groupLabel,
        label: rule.label,
        categoryKey: rule.rowId,
        categoryLabel: rule.label,
        subcategoryKey: null,
        subcategoryLabel: null,
        referenceMonth: occurrence,
        amountMinor: assertMinorUnits(rule.amountMinor),
      });
      occurrence = nextRecurrenceDate({
        startDate: rule.startDate,
        currentOccurrence: occurrence,
        frequency: rule.frequency,
      });
      iterations += 1;
      if (iterations > 10000) throw new Error("Fixed expense projection limit exceeded.");
    }
  }

  return buildMonthlyCategoryMatrix(year, entries);
}

export type PeriodComparisonRow = {
  rowId: string;
  section: "income" | "expense";
  groupLabel: string;
  label: string;
  categoryKey: string;
  categoryLabel: string;
  subcategoryKey: string | null;
  subcategoryLabel: string | null;
  firstAmountMinor: number;
  secondAmountMinor: number;
  differenceMinor: number;
  variationBasisPoints: number | null;
};

function isMonthInRange(month: string, start: string, end: string) {
  const normalized = month.slice(0, 7);
  return normalized >= start && normalized <= end;
}

export function calculateVariationBasisPoints(
  currentAmountMinor: number,
  previousAmountMinor: number,
) {
  const current = assertMinorUnits(currentAmountMinor);
  const previous = assertMinorUnits(previousAmountMinor);
  if (previous === 0) return null;
  const scaled =
    (BigInt(current - previous) * 10_000n) / BigInt(Math.abs(previous));
  const result = Number(scaled);
  return Number.isSafeInteger(result) ? result : null;
}

export function buildPeriodComparison(
  entries: readonly CategoryMonthlyReportEntry[],
  periods: z.infer<typeof periodComparisonFilterSchema>,
): PeriodComparisonRow[] {
  const rows = new Map<string, PeriodComparisonRow>();

  for (const entry of entries) {
    const inFirst = isMonthInRange(
      entry.referenceMonth,
      periods.firstStart,
      periods.firstEnd,
    );
    const inSecond = isMonthInRange(
      entry.referenceMonth,
      periods.secondStart,
      periods.secondEnd,
    );
    if (!inFirst && !inSecond) continue;

    const key = `${entry.section}:${entry.rowId}`;
    const hierarchy = reportHierarchy(entry);
    const row = rows.get(key) ?? {
      rowId: key,
      section: entry.section,
      groupLabel: entry.groupLabel,
      label: entry.label,
      ...hierarchy,
      firstAmountMinor: 0,
      secondAmountMinor: 0,
      differenceMinor: 0,
      variationBasisPoints: null,
    };
    if (inFirst) {
      row.firstAmountMinor = assertMinorUnits(
        row.firstAmountMinor + assertMinorUnits(entry.amountMinor),
      );
    }
    if (inSecond) {
      row.secondAmountMinor = assertMinorUnits(
        row.secondAmountMinor + assertMinorUnits(entry.amountMinor),
      );
    }
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      differenceMinor: assertMinorUnits(
        row.secondAmountMinor - row.firstAmountMinor,
      ),
      variationBasisPoints: calculateVariationBasisPoints(
        row.secondAmountMinor,
        row.firstAmountMinor,
      ),
    }))
    .sort((left, right) => {
      if (left.section !== right.section) {
        return left.section === "income" ? -1 : 1;
      }
      return (
        compareMinorDescending(left.secondAmountMinor, right.secondAmountMinor) ||
        left.groupLabel.localeCompare(right.groupLabel, "pt-BR") ||
        left.label.localeCompare(right.label, "pt-BR")
      );
    });
}

export function calculateInvestmentReturnBasisPoints(
  resultMinor: number | null,
  contributionsMinor: number,
) {
  if (resultMinor === null || contributionsMinor <= 0) return null;
  const result = assertMinorUnits(resultMinor);
  const contributions = assertMinorUnits(contributionsMinor);
  const scaled = (BigInt(result) * 10_000n) / BigInt(contributions);
  const basisPoints = Number(scaled);
  return Number.isSafeInteger(basisPoints) ? basisPoints : null;
}
