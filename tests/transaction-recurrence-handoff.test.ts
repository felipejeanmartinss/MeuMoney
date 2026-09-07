import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(...segments), "utf8");

describe("transaction to recurring-account handoff", () => {
  it("offers recurrence for new and edited manual transactions", () => {
    const form = readSource("src", "components", "forms", "transaction-form.tsx");
    expect(form).toContain('name="createRecurring"');
    expect(form).toContain("Tornar recorrente em Contas a Pagar");
    expect(form).toContain("Criar recorrência em Contas a Pagar");
  });

  it("creates the transaction first and forwards its validated fields", () => {
    const action = readSource("src", "app", "actions", "transactions.ts");
    const createCall = action.indexOf("createCurrentUserTransaction(parsed.data)");
    const recurringRedirect = action.indexOf(
      "redirect(recurringTransactionHref(parsed.data))",
      createCall,
    );
    expect(createCall).toBeGreaterThan(-1);
    expect(recurringRedirect).toBeGreaterThan(createCall);
    expect(action).toContain("accountId: input.accountId");
    expect(action).toContain("categoryId: input.categoryId");
    expect(action).toContain("startDate: input.transactionDate");
    expect(action).toContain('frequency: "monthly"');
    expect(action).toMatch(
      /updateCurrentUserTransaction[\s\S]+formData\.get\("createRecurring"\)[\s\S]+redirect\(recurringTransactionHref\(parsed\.data\)\)/,
    );
  });
});
