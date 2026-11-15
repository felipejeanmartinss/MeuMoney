import { describe, expect, it } from "vitest";
import { compareReinvestment, monthlyYieldBps } from "../src/domain/financing-reinvestment";
import { simulateFinancing } from "../src/domain/financing-imports";

const schedule = (...payments: number[]) => ({ rows: payments.map(paymentMinor => ({ paymentMinor })) });

describe("reinvestimento na amortização", () => {
  it("compounds prior balances only and invests the full budget after early payoff", () => {
    const result = compareReinvestment(schedule(10000, 10000, 10000), schedule(10000, 8000), schedule(10000, 5000, 5000), 100);
    expect(result.term).toEqual({ contributions: 12000, balance: 12020 });
    expect(result.payment).toEqual({ contributions: 10000, balance: 10050 });
  });

  it.each(["sac", "price"] as const)("can favor either strategy on a real %s schedule", method => {
    const input = { principalMinor: 10000000, annualRatePercent: 6, termMonths: 120, method };
    const base = simulateFinancing(input);
    const extra = { ...input, extraAmortizationMinor: 2000000 };
    const term = simulateFinancing({ ...extra, extraAmortizationMode: "term" });
    const payment = simulateFinancing({ ...extra, extraAmortizationMode: "payment" });
    const zero = compareReinvestment(base, term, payment, 0);
    expect(zero.term.balance - zero.payment.balance).toBe(payment.totalInterestMinor - term.totalInterestMinor);
    expect(zero.term.balance).toBeGreaterThan(zero.payment.balance);
    const onePercent = compareReinvestment(base, term, payment, monthlyYieldBps("1,00"));
    expect(onePercent.payment.balance).toBeGreaterThan(onePercent.term.balance);
    expect(compareReinvestment(base, term, term, 100).term).toEqual(compareReinvestment(base, term, term, 100).payment);
  });

  it("parses percentages without ambiguous partial inputs and rejects unsafe projections", () => {
    expect(monthlyYieldBps("0.05")).toBe(5);
    for (const bad of ["", "1,001", "1x", "-1", "100,01"]) expect(() => monthlyYieldBps(bad)).toThrow();
    expect(() => compareReinvestment(schedule(Number.MAX_SAFE_INTEGER, 1), schedule(), schedule(), 100)).toThrow(/limite/);
  });
});
