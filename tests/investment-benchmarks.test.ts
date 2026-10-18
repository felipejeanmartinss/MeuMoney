import { describe, expect, it } from "vitest";
import {
  calculateBenchmarkSpread,
  calculateRealReturn,
  compareInvestmentBenchmarks,
  INVESTMENT_BENCHMARKS,
} from "../src/domain/investment-benchmarks";

describe("investment benchmarks", () => {
  it("keeps the priority reference series available", () => {
    expect(INVESTMENT_BENCHMARKS.map((benchmark) => benchmark.code)).toEqual([
      "cdi",
      "selic",
      "ipca",
      "ibovespa",
      "ifix",
      "usd",
    ]);
  });

  it("calculates the spread and real return without floating point output", () => {
    expect(calculateBenchmarkSpread(1_000, 850)).toBe(150);
    expect(calculateRealReturn(1_000, 400)).toBe(577);
  });

  it("estimates month boundaries from dated snapshots without replacing recorded values", () => {
    const result = compareInvestmentBenchmarks({
      months: ["2026-09-01"],
      positions: [{ id: "asset", name: "Ativo", historyIsComplete: true, currency: "BRL" }],
      snapshots: [
        { positionId: "asset", date: "2026-08-15", valueMinor: 10_000_00 },
        { positionId: "asset", date: "2026-09-15", valueMinor: 11_000_00 },
        { positionId: "asset", date: "2026-10-15", valueMinor: 12_000_00 },
      ],
      flows: [], benchmarks: [],
    });
    expect(result.gaps).toEqual([]);
    expect(result.estimates).toHaveLength(1);
    expect(result.points).toHaveLength(1);
    expect(result.portfolioReturn).toBeGreaterThan(0);
  });
});
