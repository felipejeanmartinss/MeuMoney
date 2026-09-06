import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(...segments), "utf8");

describe("inline account entry and manual transaction deletion", () => {
  it("restricts permanent deletion to manual transactions owned by the user", () => {
    const migration = readSource(
      "supabase",
      "migrations",
      "20260905233224_allow_manual_transaction_deletion.sql",
    );
    const service = readSource(
      "src",
      "services",
      "finance",
      "transactions-service.ts",
    );

    expect(migration).toContain('for delete\nto authenticated');
    expect(migration).toContain("(select auth.uid()) = user_id");
    expect(migration).toContain("origin_type::text = 'manual'");
    expect(migration).toContain(
      "grant delete on table public.transactions to authenticated",
    );
    expect(service).toContain('.from("transactions")\n    .delete()');
    expect(service).toContain('.eq("user_id", user.id)');
    expect(service).toContain('.eq("origin_type", "manual")');
  });

  it("opens the unchanged account entry flow inside the account register", () => {
    const register = readSource(
      "src",
      "components",
      "accounts",
      "account-register.tsx",
    );
    const composer = readSource(
      "src",
      "components",
      "accounts",
      "account-register-entry-composer.tsx",
    );

    expect(register).toContain("AccountRegisterEntryComposer");
    expect(register).not.toContain(
      "`/transactions/new?accountId=${accountId}`",
    );
    expect(composer).toContain("<AccountEntryForm");
    expect(composer).toContain("initialMode={mode}");
    expect(composer).toContain("returnAccountId={accountId}");
    expect(composer).toContain("aria-expanded");
  });

  it("replaces transaction activity actions with inline deletion", () => {
    const transactionsPage = readSource(
      "src",
      "app",
      "transactions",
      "page.tsx",
    );
    const accountRegister = readSource(
      "src",
      "components",
      "accounts",
      "account-register.tsx",
    );

    expect(transactionsPage).toContain("action={deleteTransaction}");
    expect(transactionsPage).not.toContain("toggleTransactionActivity");
    expect(accountRegister).toContain("action={deleteTransaction}");
    expect(accountRegister).toContain("ConfirmSubmitButton");
  });
});
