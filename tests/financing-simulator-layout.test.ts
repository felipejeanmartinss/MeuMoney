import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinancingAmortizationSimulator } from "../src/components/financing/financing-amortization-simulator";

describe("simulador de amortização", () => {
  it("asks for one extra amount at the next due date instead of a new financing schedule", () => {
    const html = renderToStaticMarkup(createElement(FinancingAmortizationSimulator, {
      currency: "BRL", principalMinor: 17_897_552, balanceDate: "2026-10-01",
      annualRate: "7.07", termMonths: 300, method: "sac", nextDueDate: "2026-11-01",
      nextPrincipalMinor: 49_000, nextInterestMinor: 105_000, nextTotalMinor: 160_000,
    }));

    expect(html).toContain("Amortização única no próximo vencimento");
    expect(html).toContain("01/11/2026");
    expect(html.match(/name="extraAmortization"/g)).toHaveLength(1);
    expect(html).not.toContain("Amortização extra mensal");
    expect(html).not.toContain("Primeiras parcelas");
  });
});
