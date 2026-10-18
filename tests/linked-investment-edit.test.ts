import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { investmentCashFlowFormSchema } from "../src/domain/investments";

const sql = readFileSync("supabase/migrations/20261016044500_edit_linked_investment_movements.sql", "utf8");
const dateGuard = readFileSync("supabase/migrations/20261016050500_guard_investment_flow_dates.sql", "utf8");

describe("editing linked investment movements", () => {
  it("reverses the previous position effect before applying the new amount", () => {
    expect(sql).toContain("current_value_minor = current_value_minor - flow_record.position_value_delta_minor");
    expect(sql).toContain("private.apply_investment_position_effect(");
    expect(sql).toContain("source_transaction_id = null");
    expect(sql).toContain("source_transaction_id = flow_record.source_transaction_id");
    expect(sql).toContain("perform private.update_account_transfer(");
    expect(sql).toContain("linked_investment_transfer_accounts_immutable");
    expect(dateGuard).toContain("before update of cash_flow_date");
  });

  it("rejects invalid dates and zero-value edits at the form boundary", () => {
    const base = {
      positionId: "11111111-1111-4111-8111-111111111111",
      cashFlowType: "contribution", amountMinor: "250,00",
      quantity: "", cashFlowDate: "2026-09-28", notes: "",
    };
    expect(investmentCashFlowFormSchema.safeParse(base).success).toBe(true);
    expect(investmentCashFlowFormSchema.safeParse({ ...base, amountMinor: "0,00" }).success).toBe(false);
    expect(investmentCashFlowFormSchema.safeParse({ ...base, cashFlowDate: "2026-02-30" }).success).toBe(false);
  });
});
