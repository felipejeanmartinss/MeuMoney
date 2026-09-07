import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260907120000_account_currency_conversions.sql",
  ),
  "utf8",
);

describe("account currency conversions migration", () => {
  it("stores source and destination money separately", () => {
    expect(migration).toContain("add column destination_amount_minor bigint");
    expect(migration).toContain("add column destination_currency char(3)");
    expect(migration).toContain("source_amount_minor");
    expect(migration).toContain("destination_amount_minor");
  });

  it("creates both account entries atomically with their own currencies", () => {
    expect(migration).toContain("private.create_account_transfer");
    expect(migration).toContain("private.update_account_transfer");
    expect(migration).toContain("source_currency");
    expect(migration).toContain("target_currency");
    expect(migration).toContain("'outflow'");
    expect(migration).toContain("'inflow'");
  });

  it("keeps RPC execution restricted and investment links immutable", () => {
    expect(migration).toContain(
      "revoke all on function public.create_account_transfer",
    );
    expect(migration).toContain(
      "grant execute on function public.create_account_transfer",
    );
    expect(migration).toContain("destination_amount_minor, destination_currency");
    expect(migration).toContain("private.prevent_linked_investment_transfer_change");
  });
});
