import { describe, expect, it } from "vitest";
import {
  assertMinorUnits,
  formatMoney,
  minorUnitsToInput,
  parseMoneyInputToMinor,
} from "../src/domain/money";

describe("money", () => {
  it("formats integer minor units", () => expect(formatMoney(12345)).toContain("123,45"));
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
});
