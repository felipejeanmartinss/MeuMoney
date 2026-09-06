import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260906223812_reconcile_financial_movements.sql",
  ),
  "utf8",
);
const cashCompatibilityMigration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260906223900_preserve_investment_account_cash_entries.sql",
  ),
  "utf8",
);

describe("financial movement reconciliation", () => {
  it("stores exact investment deltas and applies them atomically", () => {
    expect(migration).toContain("position_value_delta_minor");
    expect(migration).toContain("position_cost_delta_minor");
    expect(migration).toContain("position_quantity_delta");
    expect(migration).toContain("private.apply_investment_position_effect");
    expect(migration).toContain("investment_redemption_exceeds_position");
  });

  it("keeps transfer cash separate from invested principal", () => {
    expect(cashCompatibilityMigration).toContain(
      "private.create_investment_account_entry",
    );
    expect(cashCompatibilityMigration).toContain(
      "source_transfer_id = transfer_record.id",
    );
    expect(cashCompatibilityMigration).toContain(
      "source_account_id = target_account_id",
    );
  });

  it("keeps destructive operations owner-scoped", () => {
    expect(migration).toContain("private.delete_investment_cash_flow");
    expect(migration).toContain("private.delete_investment_position");
    expect(migration).toContain("private.delete_net_worth_valuation");
    expect(migration).toContain("private.delete_net_worth_item");
    expect(migration).toContain("(select auth.uid()) = user_id");
  });
});
