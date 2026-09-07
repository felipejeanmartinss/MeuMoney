import { describe, expect, it } from "vitest";
import {
  convertMinorUnits,
  type CurrencyConversionSample,
} from "../src/domain/currency-conversion";

const samples: CurrencyConversionSample[] = [
  {
    sourceCurrency: "BRL",
    destinationCurrency: "EUR",
    sourceAmountMinor: 100_000,
    destinationAmountMinor: 16_000,
    transactionDate: "2026-01-10",
  },
  {
    sourceCurrency: "BRL",
    destinationCurrency: "EUR",
    sourceAmountMinor: 100_000,
    destinationAmountMinor: 18_000,
    transactionDate: "2026-07-10",
  },
  {
    sourceCurrency: "BRL",
    destinationCurrency: "USD",
    sourceAmountMinor: 100_000,
    destinationAmountMinor: 20_000,
    transactionDate: "2026-01-10",
  },
];

describe("report currency conversion", () => {
  it("uses the latest completed sample available on the reference date", () => {
    expect(convertMinorUnits(250_000, "BRL", "EUR", "2026-06-30", samples)).toBe(
      40_000,
    );
    expect(convertMinorUnits(250_000, "BRL", "EUR", "2026-08-31", samples)).toBe(
      45_000,
    );
  });

  it("supports inverse rates and preserves the sign", () => {
    expect(convertMinorUnits(16_000, "EUR", "BRL", "2026-06-30", samples)).toBe(
      100_000,
    );
    expect(convertMinorUnits(-16_000, "EUR", "BRL", "2026-06-30", samples)).toBe(
      -100_000,
    );
  });

  it("uses the earliest later sample when no historical rate exists", () => {
    expect(convertMinorUnits(100_000, "BRL", "EUR", "2025-12-31", samples)).toBe(
      16_000,
    );
  });

  it("converts through one supported bridge and reports a missing route", () => {
    expect(convertMinorUnits(16_000, "EUR", "USD", "2026-06-30", samples)).toBe(
      20_000,
    );
    expect(convertMinorUnits(10_000, "EUR", "USD", "2026-06-30", [])).toBeNull();
  });
});
