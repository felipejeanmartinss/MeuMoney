import { describe, expect, it } from "vitest";
import { assertMinorUnits, formatMoney } from "../src/domain/money";

describe("money", () => {
  it("formats integer minor units", () => expect(formatMoney(12345)).toContain("123,45"));
  it("rejects floating point storage", () => expect(() => assertMinorUnits(10.5)).toThrow());
});
