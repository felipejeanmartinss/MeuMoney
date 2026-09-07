import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260906235000_delete_investment_position_snapshots.sql",
  ),
  "utf8",
);

describe("investment position snapshot deletion", () => {
  it("allows only the owner to delete a non-initial snapshot", () => {
    expect(migration).toContain("snapshot_row.user_id = current_user_id");
    expect(migration).toContain("for update");
    expect(migration).toContain("investment_initial_snapshot_cannot_be_deleted");
  });

  it("restores the previous snapshot when the current update is removed", () => {
    expect(migration).toContain("new.position_date < old.position_date");
    expect(migration).toContain("from public.investment_position_snapshots");
    expect(migration).toContain("snapshot_row.quantity = new.quantity");
    expect(migration).toContain("quantity = previous_snapshot.quantity");
    expect(migration).toContain(
      "accumulated_cost_minor = previous_snapshot.accumulated_cost_minor",
    );
    expect(migration).toContain(
      "current_value_minor = previous_snapshot.current_value_minor",
    );
  });

  it("does not roll a position behind later cash flows", () => {
    expect(migration).toContain("investment_snapshot_has_later_cash_flows");
    expect(migration).toContain("flow_row.created_at > target_snapshot.created_at");
  });

  it("uses a public invoker facade over an owner-scoped private function", () => {
    expect(migration).toContain(
      "create or replace function private.delete_investment_position_snapshot",
    );
    expect(migration).toContain(
      "create or replace function public.delete_investment_position_snapshot",
    );
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon");
  });
});
