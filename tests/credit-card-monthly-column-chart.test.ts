import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreditCardMonthlyColumnChart } from "../src/components/reports/credit-card-monthly-column-chart";

describe("gráfico mensal dos cartões", () => {
  it("renders vertical columns with month and exact value", () => {
    const html = renderToStaticMarkup(createElement(CreditCardMonthlyColumnChart, {
      rows: [{ month: "2026-10", amountMinor: 12_345 }, { month: "2026-11", amountMinor: 6_789 }],
      currency: "BRL", label: "Gráfico de colunas: gastos por competência", color: "#059669",
    }));

    expect(html).toContain("Gráfico de colunas");
    expect(html).toContain("10/26");
    expect(html).toContain("R$ 123,45");
    expect(html.match(/<rect /g)).toHaveLength(2);
  });

  it("preserves signed credits below the zero line", () => {
    const html = renderToStaticMarkup(createElement(CreditCardMonthlyColumnChart, {
      rows: [{ month: "2026-10", amountMinor: -2_500 }],
      currency: "BRL", label: "Gastos por competência", color: "#059669",
    }));

    expect(html).toContain("#e11d48");
    expect(html).toContain("-R$");
  });
});
