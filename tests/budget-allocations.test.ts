import { describe, expect, it } from "vitest";
import { allocateBudgetGroupByPercent } from "../src/domain/budget-allocations";

describe("percent-of-income budget allocation", () => {
  it("keeps exact cents and existing subcategory proportions", () => {
    const result = allocateBudgetGroupByPercent(100_01, 25, [
      { id: "rent", plannedAmountMinor: 3_00 },
      { id: "utilities", plannedAmountMinor: 1_00 },
    ]);
    expect(result.rent + result.utilities).toBe(25_00);
    expect(result.rent).toBe(18_75);
    expect(result.utilities).toBe(6_25);
  });

  it("starts an empty group at the parent and rejects invalid percentages", () => {
    expect(allocateBudgetGroupByPercent(10_000, 30, [
      { id: "parent", plannedAmountMinor: 0 },
      { id: "child", plannedAmountMinor: 0 },
    ])).toEqual({ parent: 3_000, child: 0 });
    expect(() => allocateBudgetGroupByPercent(10_000, 101, [{ id: "parent", plannedAmountMinor: 0 }])).toThrow();
  });
});
