import { describe, expect, it } from "vitest";
import {
  parseAnnualRateToBps,
  projectSavings,
} from "../src/domain/savings-simulator";

describe("savings simulator", () => {
  it("keeps money in integer minor units with zero interest", () => {
    const result = projectSavings({
      initialMinor: 10_000,
      monthlyContributionMinor: 1_000,
      annualRateBps: 0,
      years: 2,
    });
    expect(result).toMatchObject({
      projectedMinor: 34_000,
      contributedMinor: 34_000,
      earningsMinor: 0,
    });
    expect(result.points).toHaveLength(2);
  });

  it("uses monthly compounding and produces annual points", () => {
    const result = projectSavings({
      initialMinor: 100_000,
      monthlyContributionMinor: 0,
      annualRateBps: 1_200,
      years: 1,
    });
    expect(result.projectedMinor).toBeGreaterThan(112_000);
    expect(result.earningsMinor).toBe(
      result.projectedMinor - result.contributedMinor,
    );
    expect(result.points[0].year).toBe(1);
  });

  it("parses a nominal annual percentage without floating point", () => {
    expect(parseAnnualRateToBps("12,50")).toBe(1_250);
    expect(parseAnnualRateToBps("8")).toBe(800);
  });

  it("rejects unsafe periods and negative money", () => {
    expect(() =>
      projectSavings({
        initialMinor: -1,
        monthlyContributionMinor: 0,
        annualRateBps: 0,
        years: 1,
      }),
    ).toThrow();
    expect(() =>
      projectSavings({
        initialMinor: 0,
        monthlyContributionMinor: 0,
        annualRateBps: 0,
        years: 101,
      }),
    ).toThrow();
  });
});
