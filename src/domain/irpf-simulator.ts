import { assertMinorUnits } from "./money";

export type IrpfEventKind = "salary" | "vacation" | "inss" | "health" | "health_reimbursement" | "pension" | "withheld_tax";
export type IrpfEvent = { id: string; date: string; kind: IrpfEventKind; amountMinor: number };
export type IrpfMonth = { month: string; salaryMinor: number; vacationMinor: number; inssMinor: number; healthMinor: number; healthReimbursementMinor: number; pensionMinor: number; withheldTaxMinor: number };

function percent(value: number, numerator: number, denominator = 10_000) {
  return Number((BigInt(assertMinorUnits(value)) * BigInt(numerator) + BigInt(denominator / 2)) / BigInt(denominator));
}

export function classifyIrpfCategory(kind: "income" | "expense", name: string, parentName?: string | null): IrpfEventKind | null {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const leaf = normalize(name);
  void parentName;
  if (kind === "income") {
    if (leaf === "reembolso - plano de saude") return "health_reimbursement";
    if (leaf === "ferias") return "vacation";
    if (leaf === "salario") return "salary";
    return null;
  }
  if (leaf === "inss") return "inss";
  if (leaf === "plano de saude") return "health";
  if (leaf === "ir" || leaf === "irpf" || leaf === "imposto de renda") return "withheld_tax";
  return null;
}

export function buildIrpfMonths(year: number, events: readonly IrpfEvent[]): IrpfMonth[] {
  const months = Array.from({ length: 12 }, (_, index): IrpfMonth => ({
    month: `${year}-${String(index + 1).padStart(2, "0")}`,
    salaryMinor: 0, vacationMinor: 0, inssMinor: 0, healthMinor: 0, healthReimbursementMinor: 0, pensionMinor: 0, withheldTaxMinor: 0,
  }));
  const seen = new Set<string>();
  const field: Record<IrpfEventKind, Exclude<keyof IrpfMonth, "month">> = {
    salary: "salaryMinor", vacation: "vacationMinor", inss: "inssMinor", health: "healthMinor",
    health_reimbursement: "healthReimbursementMinor", pension: "pensionMinor", withheld_tax: "withheldTaxMinor",
  };
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const month = months.find((item) => item.month === event.date.slice(0, 7));
    if (!month) continue;
    const amount = assertMinorUnits(event.amountMinor);
    if (amount <= 0) continue;
    const key = field[event.kind];
    month[key] = assertMinorUnits(month[key] + amount);
  }
  return months;
}

export function calculateIrpf2026(months: readonly IrpfMonth[]) {
  const total = (key: Exclude<keyof IrpfMonth, "month">) => months.reduce((sum, row) => assertMinorUnits(sum + row[key]), 0);
  const incomeMinor = assertMinorUnits(total("salaryMinor") + total("vacationMinor"));
  const inssMinor = total("inssMinor");
  const healthMinor = Math.max(0, total("healthMinor") - total("healthReimbursementMinor"));
  const pensionMinor = total("pensionMinor");
  const withheldTaxMinor = total("withheldTaxMinor");
  const deductiblePensionMinor = Math.min(pensionMinor, percent(incomeMinor, 1200));
  const completeDeductionMinor = Math.min(incomeMinor, assertMinorUnits(inssMinor + healthMinor + deductiblePensionMinor));
  const simplifiedDeductionMinor = Math.min(percent(incomeMinor, 2000), 1_764_000);

  function annualTax(deductionMinor: number) {
    const baseMinor = Math.max(0, incomeMinor - deductionMinor);
    const bracket = baseMinor <= 2_914_560 ? [0, 0] : baseMinor <= 3_391_980 ? [750, 218_592]
      : baseMinor <= 4_501_260 ? [1500, 472_991] : baseMinor <= 5_597_616 ? [2250, 810_585] : [2750, 1_090_466];
    const progressiveMinor = Math.max(0, percent(baseMinor, bracket[0]) - bracket[1]);
    const annualReductionMinor = incomeMinor <= 6_000_000 ? Math.min(progressiveMinor, 269_415)
      : incomeMinor <= 8_820_000 ? Math.min(progressiveMinor, Math.max(0, 842_973 - percent(incomeMinor, 95_575, 1_000_000))) : 0;
    const dueMinor = progressiveMinor - annualReductionMinor;
    return { deductionMinor, baseMinor, progressiveMinor, annualReductionMinor, dueMinor, balanceMinor: dueMinor - withheldTaxMinor };
  }
  const complete = annualTax(completeDeductionMinor);
  const simplified = annualTax(simplifiedDeductionMinor);
  return {
    incomeMinor, inssMinor, healthMinor, pensionMinor, deductiblePensionMinor, withheldTaxMinor,
    complete, simplified,
    advantageous: complete.dueMinor < simplified.dueMinor ? "complete" as const : "simplified" as const,
  };
}
