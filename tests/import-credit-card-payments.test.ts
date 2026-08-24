import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260823090000_import_credit_card_payments.sql",
  ),
  "utf8",
);

describe("imported credit-card payments", () => {
  it("stores only one transfer target and validates card ownership", () => {
    expect(migration).toContain("transfer_credit_card_id uuid");
    expect(migration).toContain("import_staging_single_transfer_target_check");
    expect(migration).toContain("from public.credit_cards");
    expect(migration).toContain("user_id = current_user_id");
    expect(migration).toContain("currency = source_currency");
    expect(migration).toContain("and is_active");
  });

  it("accepts only a negative imported bank movement as card payment", () => {
    expect(migration).toContain("target_signed_amount_minor >= 0");
    expect(migration).toContain("invalid_import_credit_card_payment");
    expect(migration).toContain("staging.signed_amount_minor < 0");
  });

  it("uses a stable card payment signature and checks prior transfers", () => {
    expect(migration).toContain("private.import_credit_card_transfer_signature");
    expect(migration).toContain("'credit_card_payment'");
    expect(migration).toContain(
      "transfers.destination_credit_card_id\n          = computed.transfer_credit_card_id",
    );
    expect(migration).toContain("duplicate_inside_job");
  });

  it("confirms the payment through the existing atomic card transfer RPC", () => {
    const confirmation = migration.slice(
      migration.indexOf("create or replace function private.confirm_import_job"),
      migration.indexOf(
        "create or replace function public.update_import_credit_card_transfer_row",
      ),
    );

    expect(confirmation).toContain("private.create_credit_card_transfer");
    expect(confirmation).toContain("'completed'::public.transaction_status");
    expect(confirmation).toContain("insert into public.imported_transaction_signatures");
    expect(confirmation).toContain("delete from public.import_staging_rows");
  });

  it("exposes only the authenticated façade with a fixed search path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });
});
