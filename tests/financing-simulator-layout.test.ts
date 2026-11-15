import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AmortizationDecision, FinancingAmortizationSimulator } from "../src/components/financing/financing-amortization-simulator";
import { simulateFinancing } from "../src/domain/financing-imports";

describe("simulador de amortização", () => {
  it.each(["sac","price"] as const)("compares both choices for %s and recognizes an early payoff tie", method => {
    const input = { principalMinor: 120000, annualRatePercent: 12, termMonths: 12, method };
    const baseline = simulateFinancing(input);
    const render = (extraAmortizationMinor: number) => renderToStaticMarkup(createElement(AmortizationDecision, {
      currency:"BRL", comparison:[baseline, simulateFinancing({...input,extraAmortizationMinor,extraAmortizationMode:"term"}),
        simulateFinancing({...input,extraAmortizationMinor,extraAmortizationMode:"payment"})],
    }));
    expect(render(30000)).toContain("a menos em juros");
    const payoff = render(baseline.rows[0].balanceMinor);
    expect(payoff).toContain("mesmo custo estimado");
    expect(payoff).toContain("Sem próxima prestação");
  });
  it("asks for one extra amount at the next due date instead of a new financing schedule", () => {
    const html = renderToStaticMarkup(createElement(FinancingAmortizationSimulator, {
      currency: "BRL", principalMinor: 17_897_552, balanceDate: "2026-10-01",
      annualRate: 7.07, termMonths: 300, method: "sac", nextDueDate: "2026-11-01",
      nextPrincipalMinor: 49_000, nextInterestMinor: 105_000, nextTotalMinor: 160_000,
    }));

    expect(html).toContain("Amortização única no próximo vencimento");
    expect(html).toContain("01/11/2026");
    expect(html.match(/name="extraAmortization"/g)).toHaveLength(1);
    expect(html).not.toContain("Amortização extra mensal");
    expect(html).not.toContain("Primeiras parcelas");
  });
});
