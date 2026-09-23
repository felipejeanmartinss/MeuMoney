import { describe, expect, it } from "vitest";
import { sumAmountsByCurrency } from "../src/domain/currency-totals";

describe("currency totals", () => {
  it("aggregates displayed charges by currency without converting or normalizing cadence", () => {
    expect(sumAmountsByCurrency([
      { currency: "BRL", amountMinor: 1_000 },
      { currency: "USD", amountMinor: 500 },
      { currency: "BRL", amountMinor: 250 },
    ])).toEqual([["BRL", 1_250], ["USD", 500]]);
  });

  it("keeps money in safe integer minor units", () => {
    expect(() => sumAmountsByCurrency([{ currency: "BRL", amountMinor: 1.5 }])).toThrow();
  });
});
