import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCreditCardExpenseReportRows } from "../src/domain/credit-card-reports";

describe("card report competence", () => {
  it("recognizes October purchases and credits in October even when their invoice is in November", () => {
    const rows = buildCreditCardExpenseReportRows({
      selectedCardIds: new Set(["card-a"]),
      purchases: [
        { id: "purchase", entry_kind: "purchase", purchase_date: "2026-10-25", status: "active" },
        { id: "refund", entry_kind: "refund", purchase_date: "2026-10-26", status: "active" },
        { id: "cancelled", entry_kind: "purchase", purchase_date: "2026-10-27", status: "cancelled" },
      ],
      installments: [
        { purchase_id: "purchase", credit_card_id: "card-a", installment_number: 1, amount: 5_000, status: "pending" },
        { purchase_id: "purchase", credit_card_id: "card-a", installment_number: 2, amount: 5_000, status: "pending" },
        { purchase_id: "refund", credit_card_id: "card-a", installment_number: 1, amount: 1_000, status: "pending" },
        { purchase_id: "cancelled", credit_card_id: "card-a", installment_number: 1, amount: 2_000, status: "pending" },
        { purchase_id: "purchase", credit_card_id: "card-b", installment_number: 1, amount: 3_000, status: "pending" },
      ],
      payments: [{ credit_card_id: "card-a", payment_date: "2026-12-10", amount_minor: 9_000 }],
    });

    expect(rows).toEqual([
      { month: "2026-10", competenceMinor: 4_000, cashMinor: 0 },
      { month: "2026-11", competenceMinor: 5_000, cashMinor: 0 },
      { month: "2026-12", competenceMinor: 0, cashMinor: 9_000 },
    ]);
  });

  it("uses the same purchase-month rule for the consolidated report and its drilldown", () => {
    const sql = readFileSync("supabase/migrations/20261025052850_fix_card_report_purchase_competence.sql", "utf8");
    const formula = "make_interval(months => i.installment_number - 1))::date";
    expect(sql.split(formula)).toHaveLength(3);
    expect(sql).not.toContain("i.competence_date");
    expect(sql.match(/with \(security_invoker = true\)/g)).toHaveLength(2);
    expect(sql).toContain("tr.destination_credit_card_id is not null");
  });
});
