import { describe, expect, it } from "vitest";
import { roundedAxisMaximumMinor } from "../src/domain/report-chart-axis";

describe("report chart axis", () => {
  it("uses round whole-unit labels without clipping the highest column", () => {
    expect(roundedAxisMaximumMinor(3_517_800)).toBe(4_000_000);
    expect(roundedAxisMaximumMinor(3_000_000)).toBe(4_000_000);
    expect(roundedAxisMaximumMinor(0)).toBe(400);
  });

  it("rejects fractional or negative money", () => {
    expect(() => roundedAxisMaximumMinor(1.5)).toThrow();
    expect(() => roundedAxisMaximumMinor(-1)).toThrow();
  });
});
