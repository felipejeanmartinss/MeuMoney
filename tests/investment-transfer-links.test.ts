import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260906193000_link_existing_investment_transfers.sql",
  ),
  "utf8",
);

describe("investment transfer links", () => {
  it("creates the position operation and link in one database transaction", () => {
    const privateFunction = migration.slice(
      migration.indexOf(
        "create or replace function private.link_investment_transfer_entry",
      ),
      migration.indexOf(
        "create or replace function public.link_investment_transfer_entry",
      ),
    );

    expect(privateFunction).toContain(
      "private.create_investment_account_entry",
    );
    expect(privateFunction).toContain("source_transfer_id = transfer_record.id");
    expect(privateFunction).toContain("source_account_id = target_account_id");
    expect(privateFunction).toContain("for update");
  });

  it("prevents duplicate links and enforces the cash direction", () => {
    expect(migration).toContain(
      "investment_cash_flows_source_transfer_unique_idx",
    );
    expect(migration).toContain("investment_transfer_direction_mismatch");
    expect(migration).toContain("entry_record.direction <> 'inflow'");
    expect(migration).toContain("entry_record.direction <> 'outflow'");
  });

  it("keeps the candidate view owner-isolated", () => {
    expect(migration).toContain(
      "create or replace view public.investment_transfer_candidates",
    );
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain(
      "grant select on table public.investment_transfer_candidates to authenticated",
    );
  });
});
