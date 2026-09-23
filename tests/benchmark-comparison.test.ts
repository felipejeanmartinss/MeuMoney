import { describe, expect, it } from "vitest";
import { benchmarkMonths, compareInvestmentBenchmarks } from "../src/domain/investment-benchmarks";

const base = {
  positions: [{ id: "asset", name: "Ativo", currency: "BRL", historyIsComplete: true }],
  snapshots: [{ positionId: "asset", date: "2025-12-31", valueMinor: 100000 }, { positionId: "asset", date: "2026-01-31", valueMinor: 110000 }, { positionId: "asset", date: "2026-02-28", valueMinor: 121000 }],
  flows: [], months: benchmarkMonths("2026-01", "2026-02"),
  benchmarks: [{ code: "cdi", reference_month: "2026-01-01", return_percent: 1 }, { code: "cdi", reference_month: "2026-02-01", return_percent: 1 }, { code: "ipca", reference_month: "2026-01-01", return_percent: 0.5 }, { code: "ipca", reference_month: "2026-02-01", return_percent: 0.5 }],
};
describe("same-period benchmark comparison", () => {
  it("compounds returns, inflation and references over identical months", () => {
    const result = compareInvestmentBenchmarks(base);
    expect(result.gaps).toEqual([]);
    expect(result.portfolioReturn).toBe(2100);
    expect(result.comparisons.find((row) => row.code === "cdi")?.returnBasisPoints).toBe(201);
    expect(result.comparisons.find((row) => row.code === "cdi")?.spreadBasisPoints).toBe(1899);
    expect(result.realReturn).toBeCloseTo(1980, -1);
    expect(result.comparisons.find((row) => row.code === "ifix")?.returnBasisPoints).toBeNull();
  });
  it("does not report an end-of-month contribution as profit", () => {
    const result = compareInvestmentBenchmarks({ ...base, months: ["2026-01-01"], flows: [{ positionId: "asset", date: "2026-01-31", amountMinor: 10000, type: "contribution" }] });
    expect(result.portfolioReturn).toBe(0);
  });
  it("includes distributed income in total return", () => {
    const result = compareInvestmentBenchmarks({ ...base, months: ["2026-01-01"], flows: [{ positionId: "asset", date: "2026-01-15", amountMinor: 1000, type: "income" }] });
    expect(result.portfolioReturn).toBe(1100);
  });
  it("blocks incomplete asset history and missing month-end valuations", () => {
    expect(compareInvestmentBenchmarks({ ...base, positions: [{ ...base.positions[0], historyIsComplete: false }] }).portfolioReturn).toBeNull();
    const missing = compareInvestmentBenchmarks({ ...base, snapshots: base.snapshots.slice(1) });
    expect(missing.portfolioReturn).toBeNull();
    expect(missing.points).toEqual([]);
    expect(missing.gaps.join(" ")).toContain("2025-12-31");
  });
  it("requires every asset in the class and every benchmark month", () => {
    const result = compareInvestmentBenchmarks({ ...base, positions: [...base.positions, { id: "other", name: "Outro", currency: "BRL", historyIsComplete: true }], benchmarks: base.benchmarks.slice(1) });
    expect(result.portfolioReturn).toBeNull();
    expect(result.comparisons[0].returnBasisPoints).toBeNull();
    expect(result.comparisons[0].series).toEqual([]);
  });
  it("rejects invalid periods", () => {
    expect(() => benchmarkMonths("2026-03", "2026-01")).toThrow();
    expect(() => benchmarkMonths("2026-13", "2027-01")).toThrow();
  });
});
