import { describe, expect, it } from "vitest";
import { compareAmortizationBenefits, projectInstallmentDifference, monthlyYieldBps } from "../src/domain/financing-reinvestment";
import { simulateFinancing } from "../src/domain/financing-imports";

const schedule = (...payments: number[]) => ({ rows: payments.map(paymentMinor => ({ paymentMinor })) });

describe("reinvestimento da diferença entre prestações", () => {
  it.each([[199, "term", 1], [200, "tie", 0], [201, "payment", 1]] as const)(
    "compares interest saved plus %i cents of earnings at cent precision", (earnings, winner, advantage) => {
      expect(compareAmortizationBenefits(1000, 300, 500, earnings)).toEqual({
        termSavings: 700, paymentSavings: 500, paymentBenefit: 500 + earnings, earnings, winner, advantage,
      });
    });
  it("deposits only a positive monthly difference and earns interest without new deposits after payoff", () => {
    const result = projectInstallmentDifference(schedule(10000, 8000, 2000), schedule(10000, 5000, 5000, 5000), 100);
    expect(result).toEqual({ contributions: 3000, earnings: 60, balance: 3060, months: 4, rateBps: 100 });
  });

  it.each(["sac", "price"] as const)("uses actual monthly deltas, never a post-payoff budget, for %s", method => {
    const input = { principalMinor: 10000000, annualRatePercent: 6, termMonths: 120, method, extraAmortizationMinor: 2000000 };
    const term = simulateFinancing({ ...input, extraAmortizationMode: "term" });
    const payment = simulateFinancing({ ...input, extraAmortizationMode: "payment" });
    expect(term.rows.length).toBeLessThan(payment.rows.length);
    const deposits = term.rows.reduce((sum, row, i) => sum + Math.max(0, row.paymentMinor - payment.rows[i].paymentMinor), 0);
    expect(deposits).toBeGreaterThan(0);
    expect(projectInstallmentDifference(term, payment, 0)).toMatchObject({ contributions: deposits, earnings: 0, balance: deposits });
    expect(projectInstallmentDifference(term, payment, monthlyYieldBps("1,00")).earnings).toBeGreaterThan(0);
    expect(projectInstallmentDifference(term, term, 100).balance).toBe(0);
  });

  it("parses percentages without ambiguous partial inputs and rejects unsafe projections", () => {
    expect(monthlyYieldBps("0.05")).toBe(5);
    for (const bad of ["", "1,001", "1x", "-1", "100,01"]) expect(() => monthlyYieldBps(bad)).toThrow();
    expect(() => projectInstallmentDifference(schedule(Number.MAX_SAFE_INTEGER), schedule(0, 0), 100)).toThrow(/limite/);
  });
});
