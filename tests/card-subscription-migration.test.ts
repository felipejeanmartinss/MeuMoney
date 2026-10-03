import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase", "migrations",
  "20261003222200_fix_card_subscription_month_variable.sql"), "utf8");

describe("card subscription generator migration", () => {
  it("does not confuse the scheduled month with the invoice column", () => {
    expect(migration).toContain("scheduled_month date;");
    expect(migration).toContain("i.reference_month = scheduled_month");
    expect(migration).toContain("p.recurring_reference_month = scheduled_month");
    expect(migration).not.toMatch(/\breference_month date;/);
  });

  it("retains idempotent generated charges and owner-checked execution", () => {
    expect(migration).toContain("current_user_id uuid := (select auth.uid())");
    expect(migration).toContain("on conflict do nothing returning id into new_purchase_id");
    expect(migration).toContain("if new_purchase_id is null then continue; end if;");
  });
});
