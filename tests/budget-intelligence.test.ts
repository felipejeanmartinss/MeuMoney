import { describe, expect, it } from "vitest";
import { calculateBudgetHistoryStats } from "../src/domain/budgets";

describe("budget intelligence", () => {
  it("calculates descriptive statistics and a practical suggestion", () => {
    const result = calculateBudgetHistoryStats({
      categoryId: "category",
      categoryName: "Alimentação",
      referenceMonth: "2026-09-01",
      plannedAmountMinor: 1_000,
      realizedAmountMinor: 850,
      history: [
        { referenceMonth: "2026-01-01", amountMinor: 500 },
        { referenceMonth: "2026-02-01", amountMinor: 600 },
        { referenceMonth: "2026-03-01", amountMinor: 700 },
        { referenceMonth: "2026-04-01", amountMinor: 600 },
      ],
    });
    expect(result.minimumAmountMinor).toBe(500);
    expect(result.averageAmountMinor).toBe(600);
    expect(result.medianAmountMinor).toBe(600);
    expect(result.maximumAmountMinor).toBe(700);
    expect(result.suggestedAmountMinor).toBe(600);
    expect(result.percentageConsumed).toBe(85);
  });

  it("marks an atypical peak as seasonal", () => {
    const result = calculateBudgetHistoryStats({
      categoryId: "travel",
      categoryName: "Viagem",
      referenceMonth: "2026-12-01",
      plannedAmountMinor: 0,
      realizedAmountMinor: 0,
      history: [
        { referenceMonth: "2026-01-01", amountMinor: 100 },
        { referenceMonth: "2026-02-01", amountMinor: 100 },
        { referenceMonth: "2026-03-01", amountMinor: 100 },
        { referenceMonth: "2026-12-01", amountMinor: 900 },
      ],
    });
    expect(result.seasonal).toBe(true);
    expect(result.suggestedAmountMinor).toBe(900);
  });
});
