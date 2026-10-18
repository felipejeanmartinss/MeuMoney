import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recurringOccurrenceEditSchema } from "../src/domain/transactions";

const migration = readFileSync("supabase/migrations/20261016043000_edit_recurring_occurrence.sql", "utf8");

describe("recurring occurrence edits", () => {
  it("validates the amount and posting date", () => {
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      description: "TV", amountMinor: "25,00", transactionDate: "2026-09-28", notes: "",
    };
    expect(recurringOccurrenceEditSchema.parse(base).amountMinor).toBe(2500);
    expect(recurringOccurrenceEditSchema.safeParse({ ...base, amountMinor: "0,00" }).success).toBe(false);
    expect(recurringOccurrenceEditSchema.safeParse({ ...base, transactionDate: "2026-02-30" }).success).toBe(false);
  });

  it("preserves the recurrence key and blocks partial investment-linked edits", () => {
    expect(migration).toContain("origin_type = 'system'");
    expect(migration).toContain("recurring_transaction_id is not null");
    expect(migration).toContain("flow.source_transaction_id = target_transaction_id");
    expect(migration).not.toContain("set scheduled_date");
  });
});
