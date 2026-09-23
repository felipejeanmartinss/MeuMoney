import { describe, expect, it } from "vitest";
import { amortizeFinancingSchedule, financingMoneyInput, normalizeFinancingMoney, projectFinancingSchedule } from "../src/domain/financing-schedule";

function schedule() {
  return projectFinancingSchedule({ principalMinor: 120_000, months: 12, annualRate: "12", method: "SAC" }).map((row, i) => ({
    id: String(i), principalMinor: row.principalMinor, interestMinor: row.interestMinor, totalAmountMinor: row.paymentMinor + 250,
    outstandingBalanceMinor: row.balanceMinor, chargesMinor: 250, extraAmortizationMinor: 0, installmentsReduced: 0,
    paymentStatus: i === 0 ? "paid" as const : "scheduled" as const, paidAmountMinor: i === 0 ? row.paymentMinor + 250 : 0, linkedTransactionId: null as string | null,
  }));
}
describe("editable financing schedule", () => {
  it("formats thousands without changing cents", () => {
    expect(financingMoneyInput(202865)).toBe("2.028,65");
    expect(normalizeFinancingMoney("234000,01")).toBe("234.000,01");
    expect(normalizeFinancingMoney("inválido")).toBe("inválido");
  });
  it.each(["SAC", "PRICE"] as const)("settles %s exactly in integer cents", (method) => {
    const rows = projectFinancingSchedule({ principalMinor: 23400001, annualRate: "7,07", months: 360, method });
    expect(rows).toHaveLength(360);
    expect(rows.reduce((sum, row) => sum + row.principalMinor, 0)).toBe(23400001);
    expect(rows.at(-1)?.balanceMinor).toBe(0);
    expect(rows.every((row) => Object.values(row).every(Number.isSafeInteger))).toBe(true);
    expect(rows[0].interestMinor).toBe(137865);
  });
  it("supports zero interest", () => {
    const rows = projectFinancingSchedule({ principalMinor: 10001, annualRate: "0", months: 3, method: "PRICE" });
    expect(rows.map((row) => row.principalMinor)).toEqual([3334, 3334, 3333]);
  });
  it("value-only lowers future payments, preserves fees and stable IDs", () => {
    const before = schedule();
    const after = amortizeFinancingSchedule(before, 0, { amountMinor: 11000, installments: 0, annualRate: "12", method: "SAC" });
    expect(after).toHaveLength(12);
    expect(after[1].principalMinor).toBe(9000);
    expect(after[1].totalAmountMinor).toBe(10240);
    expect(after[1].id).toBe(before[1].id);
    expect(after[0].paidAmountMinor).toBe(before[0].paidAmountMinor + 11000);
    expect(before[0].extraAmortizationMinor).toBe(0);
  });
  it("count-only anticipates principal of last installments", () => {
    const after = amortizeFinancingSchedule(schedule(), 0, { amountMinor: 0, installments: 2, annualRate: "12", method: "SAC" });
    expect(after).toHaveLength(10);
    expect(after[0].extraAmortizationMinor).toBe(20000);
    expect(after[0].installmentsReduced).toBe(2);
    expect(after.at(-1)?.outstandingBalanceMinor).toBe(0);
  });
  it("combined value and count recalculate the remaining term", () => {
    const after = amortizeFinancingSchedule(schedule(), 0, { amountMinor: 29000, installments: 2, annualRate: "12", method: "PRICE" });
    expect(after).toHaveLength(10);
    expect(after[0].outstandingBalanceMinor).toBe(81000);
    expect(after.slice(1).reduce((sum, row) => sum + row.principalMinor, 0)).toBe(81000);
  });
  it("full payoff removes future installments", () => {
    const after = amortizeFinancingSchedule(schedule(), 0, { amountMinor: 110000, installments: 0, annualRate: "12", method: "SAC" });
    expect(after).toHaveLength(1);
    expect(after[0].installmentsReduced).toBe(11);
  });
  it("protects paid or linked future history and rejects overpayment", () => {
    const rows = schedule();
    rows[2].linkedTransactionId = "linked";
    expect(() => amortizeFinancingSchedule(rows, 0, { amountMinor: 10000, installments: 0, annualRate: "12", method: "SAC" })).toThrow(/histórico/);
    expect(() => amortizeFinancingSchedule(schedule(), 0, { amountMinor: 120000, installments: 0, annualRate: "12", method: "SAC" })).toThrow(/exceder/);
  });
});
