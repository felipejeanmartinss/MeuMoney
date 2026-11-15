import type { FinancingScheduleEntry, FinancingExtraAmortization } from "../types/database";
import { assertMinorUnits } from "./money";

type Entry = Pick<FinancingScheduleEntry, "payment_status" | "paid_amount_minor" | "principal_minor" | "interest_minor" | "extra_amortization_minor" | "extra_fgts_minor" | "insurance_mip_minor" | "insurance_dfi_minor" | "service_fee_minor" | "penalty_minor" | "late_interest_minor">;
type Extra = Pick<FinancingExtraAmortization, "cash_amount_minor" | "fgts_amount_minor">;

export function financingPaymentReport(schedule: readonly Entry[], extras: readonly Extra[]) {
  const paid = schedule.filter(e => e.payment_status === "paid");
  const sum = <T,>(rows: readonly T[], value: (e: T) => number) =>
    rows.reduce((total, e) => assertMinorUnits(total + value(e)), 0);
  const extraCash = sum(extras, e => e.cash_amount_minor);
  const extraFgts = sum(extras, e => e.fgts_amount_minor);
  const total = assertMinorUnits(sum(paid, e => e.paid_amount_minor) + extraCash + extraFgts);
  const lines: [string, number][] = [
    ["Amortização das parcelas", sum(paid, e => e.principal_minor)],
    ["Amortização extra · recursos próprios", assertMinorUnits(extraCash + sum(paid, e => (e.extra_amortization_minor ?? 0) - (e.extra_fgts_minor ?? 0)))],
    ["Amortização extra · FGTS", assertMinorUnits(extraFgts + sum(paid, e => e.extra_fgts_minor ?? 0))],
    ["Juros contratuais", sum(paid, e => e.interest_minor)],
    ["Seguros (MIP e DFI)", sum(paid, e => e.insurance_mip_minor + e.insurance_dfi_minor)],
    ["Taxas de serviço", sum(paid, e => e.service_fee_minor)],
    ["Multas e juros de mora", sum(paid, e => e.penalty_minor + e.late_interest_minor)],
  ];
  const difference = assertMinorUnits(total - sum(lines, line => line[1]));
  if (difference !== 0) lines.push(["Diferença entre pagamentos e composição registrada", difference]);
  return { total, lines, paidCount: paid.length };
}
