import { describe, expect, it } from "vitest";
import {
  calculateExecutiveNetWorthByCurrency,
  kindForNetWorthItemType,
  netWorthItemFormSchema,
  summarizeNetWorthByCurrency,
} from "../src/domain/net-worth";

describe("net worth rules", () => {
  it("classifies supported assets and liabilities", () => {
    expect(kindForNetWorthItemType("real_estate")).toBe("asset");
    expect(kindForNetWorthItemType("vehicle")).toBe("asset");
    expect(kindForNetWorthItemType("other_asset")).toBe("asset");
    expect(kindForNetWorthItemType("financing")).toBe("liability");
    expect(kindForNetWorthItemType("loan")).toBe("liability");
    expect(kindForNetWorthItemType("other_debt")).toBe("liability");
  });

  it("parses a non-negative monetary value into integer minor units", () => {
    const result = netWorthItemFormSchema.safeParse({
      itemType: "real_estate",
      name: "Apartamento",
      currency: "BRL",
      currentValueMinor: "750.000,50",
      valuationDate: "2026-07-25",
      context: "personal",
      notes: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currentValueMinor).toBe(75_000_050);
      expect(result.data.notes).toBeNull();
    }
  });

  it("rejects negative values and future evaluation dates", () => {
    const base = {
      itemType: "vehicle",
      name: "Veículo",
      currency: "BRL",
      context: "personal",
      notes: "",
    };

    expect(
      netWorthItemFormSchema.safeParse({
        ...base,
        currentValueMinor: "-1,00",
        valuationDate: "2026-07-25",
      }).success,
    ).toBe(false);
    expect(
      netWorthItemFormSchema.safeParse({
        ...base,
        currentValueMinor: "1,00",
        valuationDate: "2999-01-01",
      }).success,
    ).toBe(false);
  });

  it("calculates assets minus liabilities without mixing currencies", () => {
    const summaries = summarizeNetWorthByCurrency(
      [
        {
          userId: "user-a",
          kind: "asset",
          currency: "BRL",
          currentValueMinor: 50_000_000,
          isActive: true,
        },
        {
          userId: "user-a",
          kind: "liability",
          currency: "BRL",
          currentValueMinor: 12_000_000,
          isActive: true,
        },
        {
          userId: "user-a",
          kind: "asset",
          currency: "USD",
          currentValueMinor: 40_000,
          isActive: true,
        },
      ],
      "user-a",
    );

    expect(summaries).toEqual([
      {
        currency: "BRL",
        assetsMinor: 50_000_000,
        liabilitiesMinor: 12_000_000,
        netWorthMinor: 38_000_000,
      },
      {
        currency: "USD",
        assetsMinor: 40_000,
        liabilitiesMinor: 0,
        netWorthMinor: 40_000,
      },
    ]);
  });

  it("excludes archived items and data owned by another user", () => {
    const summaries = summarizeNetWorthByCurrency(
      [
        {
          userId: "user-a",
          kind: "asset",
          currency: "EUR",
          currentValueMinor: 10_000,
          isActive: true,
        },
        {
          userId: "user-a",
          kind: "liability",
          currency: "EUR",
          currentValueMinor: 2_000,
          isActive: false,
        },
        {
          userId: "user-b",
          kind: "liability",
          currency: "EUR",
          currentValueMinor: 99_000,
          isActive: true,
        },
      ],
      "user-a",
    );

    expect(summaries).toEqual([
      {
        currency: "EUR",
        assetsMinor: 10_000,
        liabilitiesMinor: 0,
        netWorthMinor: 10_000,
      },
    ]);
  });

  it("rejects amounts that would leave the safe integer boundary", () => {
    expect(() =>
      summarizeNetWorthByCurrency(
        [
          {
            userId: "user-a",
            kind: "asset",
            currency: "BRL",
            currentValueMinor: Number.MAX_SAFE_INTEGER,
            isActive: true,
          },
          {
            userId: "user-a",
            kind: "asset",
            currency: "BRL",
            currentValueMinor: 1,
            isActive: true,
          },
        ],
        "user-a",
      ),
    ).toThrow("safe integer");
  });

  it("consolidates every component once and isolates users", () => {
    const result = calculateExecutiveNetWorthByCurrency({
      currentUserId: "user-a",
      accounts: [
        {
          userId: "user-a",
          currency: "BRL",
          currentBalanceMinor: 20_000,
          active: true,
        },
        {
          userId: "user-a",
          currency: "BRL",
          currentBalanceMinor: -5_000,
          active: true,
        },
        {
          userId: "user-b",
          currency: "BRL",
          currentBalanceMinor: 999_000,
          active: true,
        },
      ],
      summaries: [
        {
          userId: "user-a",
          currency: "BRL",
          manualAssetsMinor: 100_000,
          investmentsMinor: 30_000,
          liabilitiesMinor: 40_000,
        },
      ],
      invoices: [
        {
          userId: "user-a",
          currency: "BRL",
          outstandingMinor: 10_000,
        },
      ],
    });

    expect(result).toEqual([
      {
        currency: "BRL",
        transactionalAssetsMinor: 20_000,
        transactionalLiabilitiesMinor: 5_000,
        manualAssetsMinor: 100_000,
        investmentsMinor: 30_000,
        pendingInvoicesMinor: 10_000,
        otherLiabilitiesMinor: 40_000,
        assetsMinor: 150_000,
        liabilitiesMinor: 55_000,
        netWorthMinor: 95_000,
      },
    ]);
  });
});
