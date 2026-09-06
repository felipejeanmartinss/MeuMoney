import { describe, expect, it } from "vitest";
import {
  calculateInvestmentBreakdown,
  calculateInvestmentPositionMoneyEffect,
  formatInvestmentQuantity,
  inferInvestmentTransferEvent,
  investmentAccountEntryFormSchema,
  investmentCashFlowFormSchema,
  investmentEventTransactionType,
  investmentPositionFormSchema,
  investmentTransferLinkFormSchema,
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
  it("updates the position for contributions and leaves income outside principal", () => {
    expect(
      calculateInvestmentPositionMoneyEffect({
        cashFlowType: "contribution",
        amountMinor: 25_000,
        currentValueMinor: 100_000,
        accumulatedCostMinor: 90_000,
      }),
    ).toEqual({
      valueDeltaMinor: 25_000,
      costDeltaMinor: 25_000,
      nextCurrentValueMinor: 125_000,
      nextAccumulatedCostMinor: 115_000,
    });
    expect(
      calculateInvestmentPositionMoneyEffect({
        cashFlowType: "income",
        amountMinor: 2_500,
        currentValueMinor: 100_000,
        accumulatedCostMinor: 90_000,
      }),
    ).toEqual({
      valueDeltaMinor: 0,
      costDeltaMinor: 0,
      nextCurrentValueMinor: 100_000,
      nextAccumulatedCostMinor: 90_000,
    });
  });

  it("reduces value and proportional cost on partial and full redemption", () => {
    expect(
      calculateInvestmentPositionMoneyEffect({
        cashFlowType: "redemption",
        amountMinor: 25_000,
        currentValueMinor: 100_000,
        accumulatedCostMinor: 80_000,
      }),
    ).toEqual({
      valueDeltaMinor: -25_000,
      costDeltaMinor: -20_000,
      nextCurrentValueMinor: 75_000,
      nextAccumulatedCostMinor: 60_000,
    });
    expect(
      calculateInvestmentPositionMoneyEffect({
        cashFlowType: "redemption",
        amountMinor: 100_000,
        currentValueMinor: 100_000,
        accumulatedCostMinor: 80_000,
      }),
    ).toEqual({
      valueDeltaMinor: -100_000,
      costDeltaMinor: -80_000,
      nextCurrentValueMinor: 0,
      nextAccumulatedCostMinor: 0,
    });
  });

  it("rejects redemption above the current investment value", () => {
    expect(() =>
      calculateInvestmentPositionMoneyEffect({
        cashFlowType: "redemption",
        amountMinor: 100_001,
        currentValueMinor: 100_000,
        accumulatedCostMinor: 80_000,
      }),
    ).toThrow("exceeds");
  });

  it("preserves exact quantities with up to twelve decimal places", () => {
    expect(normalizeInvestmentQuantity("0,00000001")).toBe("0.00000001");
    expect(normalizeInvestmentQuantity("00012.340000000000")).toBe("12.34");
    expect(formatInvestmentQuantity("1234567.00000001")).toBe(
      "1.234.567,00000001",
    );
    expect(formatInvestmentQuantity(1234.5)).toBe("1.234,5");
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
      investmentType: "crypto",
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

  it("maps account movements without treating capital redemption as performance", () => {
    expect(investmentEventTransactionType("contribution")).toBe("expense");
    expect(investmentEventTransactionType("redemption")).toBe("income");
    expect(investmentEventTransactionType("dividend")).toBe("income");

    const parsed = investmentAccountEntryFormSchema.safeParse({
      accountId: "5bca08ad-3663-4bf3-bec1-edceb86146d8",
      positionId: "67528771-faa2-4ec0-b0f1-bbb90795c514",
      eventType: "interest_on_capital",
      description: "JCP recebido",
      amountMinor: "123,45",
      quantity: "",
      transactionDate: "2026-09-01",
      notes: "",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amountMinor).toBe(12_345);

    const newPosition = investmentAccountEntryFormSchema.safeParse({
      accountId: "5bca08ad-3663-4bf3-bec1-edceb86146d8",
      positionId: "new",
      eventType: "contribution",
      description: "Primeiro aporte",
      amountMinor: "1.000,00",
      quantity: "10",
      transactionDate: "2026-09-01",
      notes: "",
      newInstitution: "Corretora",
      newInvestmentClass: "fixed_income",
      newInvestmentType: "cdb",
      newAssetName: "CDB 2028",
    });
    const invalidNewPosition = investmentAccountEntryFormSchema.safeParse({
      accountId: "5bca08ad-3663-4bf3-bec1-edceb86146d8",
      positionId: "new",
      eventType: "redemption",
      description: "Resgate sem posição",
      amountMinor: "1.000,00",
      quantity: "",
      transactionDate: "2026-09-01",
      notes: "",
      newInstitution: "Corretora",
      newInvestmentClass: "fixed_income",
      newInvestmentType: "cdb",
      newAssetName: "CDB 2028",
    });

    expect(newPosition.success).toBe(true);
    expect(invalidNewPosition.success).toBe(false);
  });

  it("suggests investment events from transfer direction and description", () => {
    expect(inferInvestmentTransferEvent("inflow", "LTN 2029")).toBe(
      "contribution",
    );
    expect(inferInvestmentTransferEvent("outflow", "Empiricus Selic FIRF")).toBe(
      "redemption",
    );
    expect(inferInvestmentTransferEvent("outflow", "Dividendos")).toBe(
      "dividend",
    );
    expect(inferInvestmentTransferEvent("outflow", "JCP recebido")).toBe(
      "interest_on_capital",
    );
  });

  it("accepts a transfer link and keeps legacy positions independent", () => {
    const linked = investmentTransferLinkFormSchema.safeParse({
      accountId: "5bca08ad-3663-4bf3-bec1-edceb86146d8",
      transferEntryId: "67528771-faa2-4ec0-b0f1-bbb90795c514",
      positionId: "eab58fd0-981e-44b7-8413-64b634130f9c",
      eventType: "redemption",
      quantity: "",
      notes: "",
    });
    const invalidNewPosition = investmentTransferLinkFormSchema.safeParse({
      accountId: "5bca08ad-3663-4bf3-bec1-edceb86146d8",
      transferEntryId: "67528771-faa2-4ec0-b0f1-bbb90795c514",
      positionId: "new",
      eventType: "dividend",
      quantity: "",
      notes: "",
      newInstitution: "BTG",
      newInvestmentClass: "fund",
      newInvestmentType: "variable_fund",
      newAssetName: "Alaska Black FIA",
    });

    expect(linked.success).toBe(true);
    expect(invalidNewPosition.success).toBe(false);
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
