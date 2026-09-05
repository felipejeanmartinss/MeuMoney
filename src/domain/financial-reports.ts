import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { assertMinorUnits } from "./money";
import type {
  FinancialReportBasis,
  SupportedCurrency,
} from "@/types/database";

export const reportYearSchema = z.coerce.number().int().min(2000).max(2200);
export const financialReportFilterSchema = z.object({
  year: reportYearSchema,
  currency: z.enum(SUPPORTED_CURRENCIES),
  basis: z.enum(["competence", "cash"]),
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
