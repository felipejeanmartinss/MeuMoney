import { describe, expect, it } from "vitest";
import { applyIrpfMonthlyProjections, buildIrpfMonths, calculateIrpf2026, classifyIrpfCategory } from "../src/domain/irpf-simulator";

describe("IRPF simulator", () => {
  it("classifies only explicit taxable and deductible categories", () => {
    expect(classifyIrpfCategory("income", "Salário", "Salário")).toBe("salary");
    expect(classifyIrpfCategory("income", "Férias", "Salário")).toBe("vacation");
    expect(classifyIrpfCategory("income", "Reembolso - Plano de Saúde", "Reembolsos")).toBe("health_reimbursement");
    expect(classifyIrpfCategory("expense", "INSS", "Impostos e taxas")).toBe("inss");
    expect(classifyIrpfCategory("expense", "Plano de Saúde", "Saúde")).toBe("health");
    expect(classifyIrpfCategory("expense", "IR", "Impostos e taxas")).toBe("withheld_tax");
    expect(classifyIrpfCategory("income", "13º Salário", "Salário")).toBeNull();
  });
  it("groups by month without double-counting repeated source IDs", () => {
    const months = buildIrpfMonths(2026, [
      { id: "salary-1", date: "2026-09-30", kind: "salary", amountMinor: 600_000 },
      { id: "salary-1", date: "2026-09-30", kind: "salary", amountMinor: 600_000 },
      { id: "pension-1", date: "2026-09-30", kind: "pension", amountMinor: 50_000 },
    ]);
    expect(months).toHaveLength(12);
    expect(months[8].salaryMinor).toBe(600_000);
    expect(months[8].pensionMinor).toBe(50_000);
  });
  it("caps PGBL at 12% and simplification at the annual 2026 limit", () => {
    const months = buildIrpfMonths(2026, [
      { id: "salary", date: "2026-01-01", kind: "salary", amountMinor: 10_000_000 },
      { id: "pension", date: "2026-01-01", kind: "pension", amountMinor: 2_000_000 },
      { id: "inss", date: "2026-01-01", kind: "inss", amountMinor: 500_000 },
      { id: "paid", date: "2026-01-01", kind: "withheld_tax", amountMinor: 100_000 },
    ]);
    const result = calculateIrpf2026(months);
    expect(result.deductiblePensionMinor).toBe(1_200_000);
    expect(result.complete.deductionMinor).toBe(1_700_000);
    expect(result.simplified.deductionMinor).toBe(1_764_000);
    expect(result.simplified.settlementMinor).toBe(100_000 - result.simplified.dueMinor);
    expect(result.simplified.settlementMinor).toBeLessThan(0);
    const refund = calculateIrpf2026(buildIrpfMonths(2026, [
      { id: "small-income", date: "2026-01-01", kind: "salary", amountMinor: 100_000 },
      { id: "withheld", date: "2026-01-01", kind: "withheld_tax", amountMinor: 10_000 },
    ]));
    expect(refund.simplified.settlementMinor).toBe(10_000);
  });
  it("applies the annual 2026 reduction to low taxable income", () => {
    const months = buildIrpfMonths(2026, [{ id: "salary", date: "2026-01-01", kind: "salary", amountMinor: 5_000_000 }]);
    const result = calculateIrpf2026(months);
    expect(result.simplified.annualReductionMinor).toBeGreaterThan(0);
    expect(result.simplified.dueMinor).toBeGreaterThanOrEqual(0);
  });
  it("overrides only the current and future monthly totals without changing past actuals", () => {
    const actual = buildIrpfMonths(2026, [
      { id: "sep", date: "2026-09-20", kind: "salary", amountMinor: 500_000 },
      { id: "oct", date: "2026-10-01", kind: "pension", amountMinor: 20_000 },
    ]);
    const result = applyIrpfMonthlyProjections(actual, [
      { month: "2026-09", salaryMinor: 1 },
      { month: "2026-10", pensionMinor: 100_000, salaryMinor: 0 },
    ], "2026-10");
    expect(result[8].salaryMinor).toBe(500_000);
    expect(result[9].pensionMinor).toBe(100_000);
    expect(result[9].salaryMinor).toBe(0);
    expect(actual[9].pensionMinor).toBe(20_000);
  });
});
