import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260907101500_credit_card_purchase_imports.sql",
  ),
  "utf8",
);
const stagingForm = readFileSync(
  resolve("src", "components", "forms", "import-staging-row-form.tsx"),
  "utf8",
);
const ignoredRowsMigration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260908000555_preserve_ignored_credit_card_import_rows.sql",
  ),
  "utf8",
);

describe("credit-card purchase imports", () => {
  it("keeps account and card targets mutually exclusive", () => {
    expect(migration).toContain("credit_card_id uuid");
    expect(migration).toContain("foreign key (credit_card_id, user_id)");
    expect(migration).toContain("num_nonnulls(account_id, credit_card_id) <= 1");
    expect(migration).toContain("set account_id = null");
    expect(migration).toContain("set credit_card_id = null");
  });

  it("validates ownership, active card and expense category", () => {
    expect(migration).toContain("user_id = current_user_id");
    expect(migration).toContain("and is_active");
    expect(migration).toContain("and kind = 'expense'");
    expect(migration).toContain("and categories.archived_at is null");
  });

  it("detects duplicate purchases by card, date, value and description", () => {
    expect(migration).toContain("private.import_credit_card_purchase_signature");
    expect(migration).toContain("'credit_card_purchase'");
    expect(migration).toContain("purchases.credit_card_id = target_credit_card_id");
    expect(migration).toContain("purchases.purchase_date = computed.transaction_date");
    expect(migration).toContain("duplicate_inside_job");
  });

  it("confirms through the canonical purchase routine in one transaction", () => {
    expect(migration).toContain("perform private.create_credit_card_purchase(");
    expect(migration).toMatch(/staging_record\.transaction_date,\s*1,/);
    expect(migration).toContain("delete from public.import_staging_rows");
    expect(migration).toContain("imported_row_count = imported_count");
  });

  it("exposes invoker facades and keeps implementation functions private", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to authenticated");
  });

  it("submits a raw category UUID in the card-purchase correction flow", () => {
    expect(stagingForm).toContain(
      "prefixCategoryValue={!isCreditCardPurchaseImport}",
    );
    expect(stagingForm).toContain(
      'isCreditCardPurchaseImport ? "categoryId" : "classification"',
    );
  });

  it("keeps explicitly ignored card rows ignored after later classifications", () => {
    const capturePosition = ignoredRowsMigration.indexOf(
      "array_agg(staging.id order by staging.source_row_number)",
    );
    const refreshPosition = ignoredRowsMigration.indexOf(
      "perform private.refresh_import_job_before_persistent_credit_card_ignored_rows(",
    );
    const restorePosition = ignoredRowsMigration.indexOf(
      "and id = any(ignored_row_ids)",
    );

    expect(ignoredRowsMigration).toContain("and staging.status = 'ignored'");
    expect(ignoredRowsMigration).toContain("and not staging.is_selected");
    expect(capturePosition).toBeGreaterThan(-1);
    expect(refreshPosition).toBeGreaterThan(capturePosition);
    expect(restorePosition).toBeGreaterThan(refreshPosition);
    expect(ignoredRowsMigration).toContain("set status = 'ignored'");
    expect(ignoredRowsMigration).toContain("is_selected = false");
  });
});
