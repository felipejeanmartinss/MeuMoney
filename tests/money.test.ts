import { describe, expect, it } from "vitest";
import {
  assertMinorUnits,
  coerceMinorUnits,
  formatMoney,
  minorUnitsToInput,
  parseMoneyInputToMinor,
} from "../src/domain/money";
import {
  formatFinancialAmount,
  formatFinancialDate,
} from "../src/utils/financial-formatters";

describe("money", () => {
  it("formats integer minor units", () => expect(formatMoney(12345)).toContain("123,45"));
  it("normalizes integer strings returned by database adapters", () => {
    expect(coerceMinorUnits("12345")).toBe(12345);
    expect(formatMoney("12345")).toContain("123,45");
  });
  it("rejects non-integer database values", () => {
    expect(() => coerceMinorUnits("123,45")).toThrow();
    expect(() => coerceMinorUnits("10.5")).toThrow();
  });
  it("rejects floating point storage", () => expect(() => assertMinorUnits(10.5)).toThrow());
  it("parses Brazilian and decimal input without floating point", () => {
    expect(parseMoneyInputToMinor("1.234,56")).toBe(123456);
    expect(parseMoneyInputToMinor("-10.25")).toBe(-1025);
    expect(minorUnitsToInput(-1025)).toBe("-10,25");
  });
  it("rejects malformed and unsafe monetary values", () => {
    expect(() => parseMoneyInputToMinor("12,345")).toThrow();
    expect(() => parseMoneyInputToMinor("999999999999999999")).toThrow();
  });
  it("keeps financial lists renderable when persisted data is malformed", () => {
    expect(formatFinancialAmount(null, "BRL")).toBe("Valor indisponível");
    expect(formatFinancialAmount("invalid", "BRL")).toBe("Valor indisponível");
    expect(formatFinancialDate(null)).toBe("Data indisponível");
    expect(formatFinancialDate("invalid")).toBe("Data indisponível");
  });
});
