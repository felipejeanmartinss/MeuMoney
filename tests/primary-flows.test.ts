import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const flows = [
  ["cadastro", "src/app/register/page.tsx", "src/services/auth/auth-service.ts"],
  ["contas", "src/app/accounts/page.tsx", "src/app/actions/accounts.ts"],
  ["lançamentos", "src/app/transactions/page.tsx", "src/app/actions/transactions.ts"],
  ["transferências", "src/app/transfers/page.tsx", "src/app/actions/transfers.ts"],
  ["cartões", "src/app/credit-cards/page.tsx", "src/app/actions/credit-cards.ts"],
  ["orçamento", "src/app/budgets/page.tsx", "src/app/actions/budgets.ts"],
  ["patrimônio", "src/app/net-worth/page.tsx", "src/app/actions/net-worth.ts"],
  ["importações", "src/app/imports/page.tsx", "src/app/actions/file-imports.ts"],
] as const;

describe("primary beta flows", () => {
  it.each(flows)("%s keeps its page and server mutation boundary", (_, page, action) => {
    expect(existsSync(resolve(page))).toBe(true);
    expect(existsSync(resolve(action))).toBe(true);
    const source = readFileSync(resolve(action), "utf8");
    if (action.includes("auth-service")) {
      expect(source).toContain("supabase.auth.signUp");
    } else {
      expect(source).toContain('"use server"');
    }
  });

  it("keeps Supabase access out of client forms", () => {
    const clientForms = [
      "register-form.tsx",
      "account-form.tsx",
      "transaction-form.tsx",
      "transfer-form.tsx",
      "credit-card-form.tsx",
      "monthly-budget-form.tsx",
      "net-worth-item-form.tsx",
      "file-import-form.tsx",
    ];
    for (const form of clientForms) {
      const source = readFileSync(resolve("src", "components", "forms", form), "utf8");
      expect(source).not.toContain("@supabase/");
      expect(source).not.toContain("createClient(");
    }
  });
});
