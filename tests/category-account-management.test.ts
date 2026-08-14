import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { archivedAccountDeletionSchema } from "../src/domain/accounts";
import { categoryDeletionSchema } from "../src/domain/categories";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260813234307_category_account_deletion.sql",
  ),
  "utf8",
);
const transactionForm = readFileSync(
  resolve("src", "components", "forms", "transaction-form.tsx"),
  "utf8",
);
const importRowForm = readFileSync(
  resolve("src", "components", "forms", "import-staging-row-form.tsx"),
  "utf8",
);
const categoriesPage = readFileSync(
  resolve("src", "app", "categories", "page.tsx"),
  "utf8",
);

describe("category and archived-account management", () => {
  it("requires explicit destructive confirmation", () => {
    expect(
      categoryDeletionSchema.safeParse({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        replacementCategoryId: "",
        confirmation: "EXCLUIR",
      }).success,
    ).toBe(true);
    expect(
      archivedAccountDeletionSchema.safeParse({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        confirmation: "sim",
      }).success,
    ).toBe(false);
  });

  it("reassigns every supported category dependency before deletion", () => {
    expect(migration).toContain("category_replacement_required");
    expect(migration).toContain("invalid_replacement_category");
    expect(migration).toContain("update public.transactions");
    expect(migration).toContain("update public.recurring_transactions");
    expect(migration).toContain("update public.credit_card_purchases");
    expect(migration).toContain("update public.import_staging_rows");
    expect(migration).toContain("insert into public.monthly_budgets");
    expect(migration).toContain("on conflict (user_id, reference_month, currency, category_id)");
  });

  it("keeps destructive RPCs owner scoped and least privileged", () => {
    expect(migration).toContain("current_user_id uuid := (select auth.uid())");
    expect(migration).toContain("and user_id = current_user_id");
    expect(migration).toContain("account_must_be_archived");
    expect(migration).toContain(
      "revoke all on function public.delete_archived_account(uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.delete_archived_account(uuid)",
    );
    expect(migration).not.toContain("grant delete on table");
  });

  it("offers quick creation in transactions and import review", () => {
    expect(transactionForm).toContain("QuickCategoryCreate");
    expect(transactionForm).toContain("Criar categoria ou subcategoria");
    expect(importRowForm).toContain("QuickCategoryCreate");
    expect(importRowForm).toContain("+ Criar categoria");
  });

  it("uses a compact table for category administration", () => {
    expect(categoriesPage).toContain("border-collapse");
    expect(categoriesPage).toContain("Editar / excluir");
    expect(categoriesPage).toContain("Sem categorias");
  });
});
