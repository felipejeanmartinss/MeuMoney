import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MonthlyCheckIn } from "../src/components/check-in/monthly-check-in";
import type { MonthlyCheckinData } from "../src/services/finance/monthly-checkins-service";

vi.mock("../src/app/actions/monthly-checkins", () => ({
  closeMonthlyCheckin: vi.fn(),
}));

const fixture: MonthlyCheckinData = {
  referenceMonth: "2026-09-01",
  checkin: null,
  hasError: false,
  checklist: {
    unclassifiedCount: 0,
    unreconciledCount: 0,
    upcomingRecurrencesCount: 1,
    upcomingInvoices: [],
    overBudget: [],
    staleQuotes: [],
  },
};

function render(data = fixture) {
  return renderToStaticMarkup(createElement(MonthlyCheckIn, { data, month: "2026-09" }));
}

describe("monthly check-in presentation", () => {
  it("counts recurrence-only attention and links to each review module", () => {
    const html = render();
    expect(html).toContain("1 etapa para revisar");
    for (const route of ["/transactions", "/accounts", "/budgets", "/investments/prices"]) {
      expect(html).toContain(`href="${route}"`);
    }
  });

  it("keeps guidance and the optional observation collapsed", () => {
    const html = render();
    expect(html.match(/<details>/g)).toHaveLength(1);
    expect(html).not.toContain("<details open");
    expect(html).toContain('id="check-in-observation"');
    expect(html).toContain("A nota fica salva no check-in deste mês.");
    expect(html).toContain('maxLength="2000"');
  });

  it("does not show a clean result when some checks failed", () => {
    const html = render({ ...fixture, hasError: true });
    expect(html).toContain("Resultado parcial");
    expect(html).not.toContain("Nenhuma pendência encontrada");
  });

  it("does not sum invoices of different currencies into a false total", () => {
    const html = render({
      ...fixture,
      checklist: {
        ...fixture.checklist,
        upcomingInvoices: [
          { id: "brl", credit_card_name: "BRL", due_date: "2026-09-30", outstanding_amount_minor: 10000, currency: "BRL" },
          { id: "usd", credit_card_name: "USD", due_date: "2026-09-30", outstanding_amount_minor: 10000, currency: "USD" },
        ],
      },
    });
    expect(html).toContain("2 faturas · 1 recorrência");
    expect(html).not.toContain("R$");
    expect(html).not.toContain("US$");
  });
});
