import { describe, expect, it } from "vitest";
import {
  calculateMonthlyBudgetProgress,
  currentReferenceMonth,
  previousReferenceMonth,
  summarizeBudgetProgress,
  type CardInstallmentConsumptionInput,
  type ManualConsumptionInput,
} from "../src/domain/budgets";

const userId = "user-a";
const categoryId = "category-food";

function manualExpense(
  overrides: Partial<ManualConsumptionInput> = {},
): ManualConsumptionInput {
  return {
    userId,
    categoryId,
    categoryName: "Alimentação",
    context: "personal",
    currency: "BRL",
    amountMinor: 20_000,
    transactionDate: "2026-07-10",
    transactionType: "expense",
    status: "completed",
    isActive: true,
    originType: "manual",
    ...overrides,
  };
}

function cardInstallment(
  overrides: Partial<CardInstallmentConsumptionInput> = {},
): CardInstallmentConsumptionInput {
  return {
    userId,
    categoryId,
    categoryName: "Alimentação",
    context: "personal",
    currency: "BRL",
    amountMinor: 30_000,
    competenceDate: "2026-07-01",
    purchaseActive: true,
    installmentCancelled: false,
    ...overrides,
  };
}

const budget = {
  userId,
  categoryId,
  categoryName: "Alimentação",
  context: "personal" as const,
  currency: "BRL" as const,
  referenceMonth: "2026-07-01",
  plannedAmountMinor: 100_000,
};

describe("monthly budget aggregation", () => {
  it("adds completed consumption expenses and card installments by competence", () => {
    const rows = calculateMonthlyBudgetProgress({
      userId,
      referenceMonth: "2026-07",
      context: "personal",
      currency: "BRL",
      budgets: [budget],
      manualExpenses: [manualExpense()],
      cardInstallments: [cardInstallment()],
    });

    expect(rows).toEqual([
      {
        categoryId,
        categoryName: "Alimentação",
        plannedAmountMinor: 100_000,
        realizedAmountMinor: 50_000,
        availableAmountMinor: 50_000,
        percentageConsumed: 50,
      },
    ]);
  });

  it("excludes pending, inactive and technical payments from realized consumption", () => {
    const rows = calculateMonthlyBudgetProgress({
      userId,
      referenceMonth: "2026-07",
      context: "personal",
      currency: "BRL",
      budgets: [budget],
      manualExpenses: [
        manualExpense({ status: "pending" }),
        manualExpense({ isActive: false }),
        manualExpense({ originType: "credit_card_invoice_payment" }),
        manualExpense({ transactionType: "income" }),
        manualExpense({ transactionDate: "2026-08-01" }),
      ],
      cardInstallments: [],
    });

    expect(rows[0].realizedAmountMinor).toBe(0);
    expect(rows[0].availableAmountMinor).toBe(100_000);
  });

  it("uses installment competence and ignores cancelled purchases or installments", () => {
    const rows = calculateMonthlyBudgetProgress({
      userId,
      referenceMonth: "2026-07",
      context: "personal",
      currency: "BRL",
      budgets: [budget],
      manualExpenses: [],
      cardInstallments: [
        cardInstallment({ amountMinor: 10_000 }),
        cardInstallment({
          amountMinor: 20_000,
          competenceDate: "2026-08-01",
        }),
        cardInstallment({ amountMinor: 30_000, purchaseActive: false }),
        cardInstallment({
          amountMinor: 40_000,
          installmentCancelled: true,
        }),
      ],
    });

    expect(rows[0].realizedAmountMinor).toBe(10_000);
  });

  it("isolates every aggregation dimension, including the owner", () => {
    const rows = calculateMonthlyBudgetProgress({
      userId,
      referenceMonth: "2026-07",
      context: "personal",
      currency: "BRL",
      budgets: [
        budget,
        { ...budget, userId: "user-b", plannedAmountMinor: 900_000 },
      ],
      manualExpenses: [
        manualExpense(),
        manualExpense({ userId: "user-b", amountMinor: 700_000 }),
        manualExpense({ context: "professional", amountMinor: 600_000 }),
        manualExpense({ currency: "USD", amountMinor: 500_000 }),
      ],
      cardInstallments: [
        cardInstallment(),
        cardInstallment({ userId: "user-b", amountMinor: 400_000 }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].plannedAmountMinor).toBe(100_000);
    expect(rows[0].realizedAmountMinor).toBe(50_000);
  });

  it("shows unbudgeted consumption and summarizes overspending without floats for money", () => {
    const rows = calculateMonthlyBudgetProgress({
      userId,
      referenceMonth: "2026-07",
      context: "personal",
      currency: "BRL",
      budgets: [budget],
      manualExpenses: [
        manualExpense({ amountMinor: 120_000 }),
        manualExpense({
          categoryId: "category-health",
          categoryName: "Saúde",
          amountMinor: 15_000,
        }),
      ],
      cardInstallments: [],
    });
    const summary = summarizeBudgetProgress(rows);

    expect(rows.find((row) => row.categoryId === categoryId)).toMatchObject({
      availableAmountMinor: -20_000,
      percentageConsumed: 120,
    });
    expect(
      rows.find((row) => row.categoryId === "category-health"),
    ).toMatchObject({
      plannedAmountMinor: 0,
      realizedAmountMinor: 15_000,
      percentageConsumed: null,
    });
    expect(summary).toMatchObject({
      plannedAmountMinor: 100_000,
      realizedAmountMinor: 135_000,
      availableAmountMinor: -35_000,
      percentageConsumed: 135,
    });
  });

  it("handles the year boundary when identifying the previous month", () => {
    expect(previousReferenceMonth("2026-01")).toBe("2025-12");
  });

  it("uses the product timezone at a UTC month boundary", () => {
    expect(
      currentReferenceMonth(
        new Date("2026-08-01T01:30:00.000Z"),
        "America/Sao_Paulo",
      ),
    ).toBe("2026-07");
  });
});
