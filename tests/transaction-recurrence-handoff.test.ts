import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...segments: string[]) =>
  readFileSync(resolve(...segments), "utf8");

describe("transaction to recurring-account handoff", () => {
  it("offers recurrence only for new transactions", () => {
    const form = readSource("src", "components", "forms", "transaction-form.tsx");
    expect(form).toContain("!values.id");
    expect(form).toContain('name="createRecurring"');
    expect(form).toContain("Tornar recorrente em Contas a Pagar");
  });

  it("creates the transaction first and forwards its validated fields", () => {
    const action = readSource("src", "app", "actions", "transactions.ts");
    const createCall = action.indexOf("createCurrentUserTransaction(parsed.data)");
    const recurringRedirect = action.indexOf("/recurring-transactions/new?");
    expect(createCall).toBeGreaterThan(-1);
    expect(recurringRedirect).toBeGreaterThan(createCall);
    expect(action).toContain("accountId: parsed.data.accountId");
    expect(action).toContain("categoryId: parsed.data.categoryId");
    expect(action).toContain("startDate: parsed.data.transactionDate");
    expect(action).toContain('frequency: "monthly"');
  });
});
