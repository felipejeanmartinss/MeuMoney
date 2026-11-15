import { expect, it } from "vitest";
import { financingPaymentReport, financingPaymentsByYear } from "../src/domain/financing-payment-report";

it("counts paid installments and separate extras once, regardless of statement links", () => {
  const paid = { payment_status: "paid" as const, paid_amount_minor: 13500, principal_minor: 8000, interest_minor: 2000,
    extra_amortization_minor: 3000, extra_fgts_minor: 2500, insurance_mip_minor: 150, insurance_dfi_minor: 100,
    service_fee_minor: 200, penalty_minor: 30, late_interest_minor: 20 };
  const report = financingPaymentReport([paid, { ...paid, payment_status: "scheduled" }], [{ cash_amount_minor: 700, fgts_amount_minor: 900 }]);
  expect(report.total).toBe(15100);
  expect(report.paidCount).toBe(1);
  expect(report.lines.map(([, amount]) => amount)).toEqual([8000,1200,3400,2000,250,200,50]);
  const difference = financingPaymentReport([{ ...paid, paid_amount_minor: 13000 }], []);
  expect(difference.lines.at(-1)?.[1]).toBe(-500);
  expect(difference.lines.reduce((total,[,amount]) => total + amount,0)).toBe(difference.total);
});

it("has no paid amounts without history", () => {
  expect(financingPaymentReport([], [])).toMatchObject({ total: 0, paidCount: 0 });
});

it("reconciles years by actual payment and event date without guessing undated history", () => {
  const paid = { payment_status: "paid" as const, paid_amount_minor: 110, principal_minor: 100, interest_minor: 10,
    insurance_mip_minor: 0, insurance_dfi_minor: 0, service_fee_minor: 0, penalty_minor: 0, late_interest_minor: 0,
    due_date: "2024-12-31", payment_date: "2025-01-02" };
  const schedule = [paid, { ...paid, payment_date: null }, { ...paid, payment_status: "scheduled" as const }];
  const extras = [{ event_date: "2024-12-19", fgts_amount_minor: 300, cash_amount_minor: 25 }];
  const groups = financingPaymentsByYear(schedule, extras);
  expect(groups.map(g => [g.year, g.report.total])).toEqual([["2025", 110], ["2024", 325], ["Sem data de pagamento", 110]]);
  expect(groups[1].report.lines.slice(1, 3).map(line => line[1])).toEqual([25, 300]);
  expect(groups.reduce((sum, g) => sum + g.report.total, 0)).toBe(financingPaymentReport(schedule, extras).total);
});
