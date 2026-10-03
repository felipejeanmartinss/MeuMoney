import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(...segments), "utf8");

describe("transaction to recurring-account handoff", () => {
  it("checks registered rules and pending forecasts in both entry points", () => {
    const accountPage = readSource("src", "app", "accounts", "[id]", "page.tsx");
    const newTransactionPage = readSource("src", "app", "transactions", "new", "page.tsx");
    const form = readSource("src", "components", "forms", "transaction-form.tsx");
    const action = readSource("src", "app", "actions", "transactions.ts");
    expect(accountPage).toContain("listCurrentUserRecurrenceMatches(id)");
    expect(newTransactionPage).toContain("listCurrentUserRecurrenceMatches()");
    expect(newTransactionPage).toContain("pendingRecurrences={recurrenceMatches.candidates}");
    expect(form).toContain('name="matchedRecurringRuleId"');
    expect(action).toContain("confirmCurrentUserRecurringRule");
  });

  it("offers recurrence for new and edited manual transactions", () => {
    const form = readSource("src", "components", "forms", "transaction-form.tsx");
    expect(form).toContain('name="createRecurring"');
    expect(form).toContain("Tornar recorrente");
    expect(form).toContain("Criar recorrência");
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
