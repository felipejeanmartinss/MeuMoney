import { describe, expect, it } from "vitest";
import {
  calculateBenchmarkSpread,
  calculateRealReturn,
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
});
