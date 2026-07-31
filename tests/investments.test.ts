import { describe, expect, it } from "vitest";
import {
  calculateInvestmentBreakdown,
  formatInvestmentQuantity,
  investmentCashFlowFormSchema,
  investmentPositionFormSchema,
  normalizeInvestmentQuantity,
  summarizeInvestmentsByCurrency,
} from "../src/domain/investments";

const basePosition = {
  id: "position-a",
  userId: "user-a",
  currency: "BRL" as const,
  accumulatedCostMinor: 100_000,
  currentValueMinor: 120_000,
  historyIsComplete: false,
  isActive: true,
};

describe("investment rules", () => {
  it("preserves exact quantities with up to twelve decimal places", () => {
    expect(normalizeInvestmentQuantity("0,00000001")).toBe("0.00000001");
    expect(normalizeInvestmentQuantity("00012.340000000000")).toBe("12.34");
    expect(formatInvestmentQuantity("1234567.00000001")).toBe(
      "1.234.567,00000001",
    );
  });

  it("rejects exponent notation, excessive scale and negative quantities", () => {
    expect(() => normalizeInvestmentQuantity("1e-8")).toThrow(
      "notação científica",
    );
    expect(() => normalizeInvestmentQuantity("1.1234567890123")).toThrow(
      "12 decimais",
    );
    expect(() => normalizeInvestmentQuantity("-1")).toThrow(
      "quantidade válida",
    );
  });

  it("validates a manual position using integer money and decimal quantity", () => {
    const result = investmentPositionFormSchema.safeParse({
      institution: "Corretora",
      investmentClass: "crypto",
      assetName: "Bitcoin",
      currency: "BRL",
      quantity: "0,00000001",
      accumulatedCostMinor: "350,00",
      currentValueMinor: "420,50",
      positionDate: "2026-07-25",
      context: "personal",
      historyIsComplete: false,
      notes: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe("0.00000001");
      expect(result.data.accumulatedCostMinor).toBe(35_000);
      expect(result.data.currentValueMinor).toBe(42_050);
    }
  });

  it("requires positive cash-flow money and accepts optional quantity", () => {
    const valid = investmentCashFlowFormSchema.safeParse({
      positionId: "5bca08ad-3663-4bf3-bec1-edceb86146d8",
      cashFlowType: "income",
      amountMinor: "12,34",
      quantity: "",
      cashFlowDate: "2026-07-25",
      notes: "",
    });
    const invalid = investmentCashFlowFormSchema.safeParse({
      positionId: "5bca08ad-3663-4bf3-bec1-edceb86146d8",
      cashFlowType: "contribution",
      amountMinor: "0,00",
      quantity: "0",
      cashFlowDate: "2026-07-25",
      notes: "",
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("separates contributions, redemptions, income and unrealized change", () => {
    const result = calculateInvestmentBreakdown(basePosition, [
      {
        positionId: "position-a",
        userId: "user-a",
        type: "contribution",
        amountMinor: 100_000,
      },
      {
        positionId: "position-a",
        userId: "user-a",
        type: "redemption",
        amountMinor: 10_000,
      },
      {
        positionId: "position-a",
        userId: "user-a",
        type: "income",
        amountMinor: 5_000,
      },
      {
        positionId: "position-a",
        userId: "user-b",
        type: "income",
        amountMinor: 999_000,
      },
    ]);

    expect(result).toEqual({
      contributionsMinor: 100_000,
      redemptionsMinor: 10_000,
      incomeMinor: 5_000,
      unrealizedAppreciationMinor: 20_000,
      totalResultMinor: null,
    });
  });

  it("only calculates total result when the history is declared complete", () => {
    const result = calculateInvestmentBreakdown(
      { ...basePosition, historyIsComplete: true },
      [
        {
          positionId: "position-a",
          userId: "user-a",
          type: "contribution",
          amountMinor: 100_000,
        },
        {
          positionId: "position-a",
          userId: "user-a",
          type: "redemption",
          amountMinor: 10_000,
        },
        {
          positionId: "position-a",
          userId: "user-a",
          type: "income",
          amountMinor: 5_000,
        },
      ],
    );

    expect(result.totalResultMinor).toBe(35_000);
  });

  it("consolidates only active positions owned by the user and keeps currencies separate", () => {
    const result = summarizeInvestmentsByCurrency(
      [
        basePosition,
        {
          ...basePosition,
          id: "position-b",
          currency: "USD",
          currentValueMinor: 50_000,
        },
        {
          ...basePosition,
          id: "position-c",
          currentValueMinor: 999_000,
          isActive: false,
        },
        {
          ...basePosition,
          id: "position-d",
          userId: "user-b",
          currentValueMinor: 999_000,
        },
      ],
      "user-a",
    );

    expect(result).toEqual([
      { currency: "BRL", currentValueMinor: 120_000 },
      { currency: "USD", currentValueMinor: 50_000 },
    ]);
  });

  it("rejects aggregation beyond the safe integer boundary", () => {
    expect(() =>
      summarizeInvestmentsByCurrency(
        [
          { ...basePosition, currentValueMinor: Number.MAX_SAFE_INTEGER },
          { ...basePosition, id: "position-b", currentValueMinor: 1 },
        ],
        "user-a",
      ),
    ).toThrow("safe integer");
  });
});
