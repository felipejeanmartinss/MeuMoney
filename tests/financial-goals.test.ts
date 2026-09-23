import { describe, expect, it } from "vitest";
import { calculateGoalProgress } from "../src/domain/financial-goals";

describe("financial goals", () => {
  it("calculates remaining amount and monthly contribution", () => {
    const result = calculateGoalProgress({
      targetAmountMinor: 12_000,
      accumulatedAmountMinor: 3_000,
      today: "2026-01-15",
      targetDate: "2026-06-15",
    });
    expect(result.remainingAmountMinor).toBe(9_000);
    expect(result.monthsRemaining).toBe(5);
    expect(result.monthlyContributionMinor).toBe(1_500);
    expect(result.percentage).toBe(25);
  });

  it("caps progress and removes the contribution when the goal is complete", () => {
    const result = calculateGoalProgress({
      targetAmountMinor: 1_000,
      accumulatedAmountMinor: 1_200,
      today: "2026-01-15",
      targetDate: "2025-12-15",
    });
    expect(result.percentage).toBe(100);
    expect(result.remainingAmountMinor).toBe(0);
    expect(result.monthlyContributionMinor).toBe(0);
    expect(result.isOverdue).toBe(false);
  });
});
