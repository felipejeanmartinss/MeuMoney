import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isMissingSubscriptionColumn,
  withSubscriptionDefaults,
  withoutSubscriptionFlag,
} from "../src/services/finance/subscription-schema";

describe("subscription column compatibility", () => {
  it("recognizes only the missing subscription column", () => {
    expect(isMissingSubscriptionColumn({ code: "42703", message: "column recurring_transactions.is_subscription does not exist" })).toBe(true);
    expect(isMissingSubscriptionColumn({ code: "PGRST204", message: "Could not find the 'is_subscription' column in the schema cache" })).toBe(true);
    expect(isMissingSubscriptionColumn({ code: "42703", message: "column amount_minor does not exist" })).toBe(false);
    expect(isMissingSubscriptionColumn({ code: "42501", message: "permission denied for is_subscription" })).toBe(false);
  });

  it("shows existing rows without inventing subscriptions", () => {
    expect(withSubscriptionDefaults([{ id: "old" }, { id: "new", is_subscription: true }])).toEqual([
      { id: "old", is_subscription: false },
      { id: "new", is_subscription: true },
    ]);
  });

  it("removes only the unavailable flag from a legacy write", () => {
    expect(withoutSubscriptionFlag({ description: "Juros sobre Capital", amount_minor: 1200, is_subscription: false })).toEqual({
      description: "Juros sobre Capital",
      amount_minor: 1200,
    });
  });

  it("loads lists regardless of the optional column and retries unmarked writes", () => {
    const transactions = readFileSync(resolve("src/services/finance/transactions-service.ts"), "utf8");
    const recurrences = readFileSync(resolve("src/services/finance/recurring-transactions-service.ts"), "utf8");
    for (const service of [transactions, recurrences]) {
      expect(service).toContain('.select("*")');
      expect(service).toContain("withSubscriptionDefaults");
      expect(service).toContain("isMissingSubscriptionColumn(error)");
      expect(service).toContain("if (input.isSubscription)");
      expect(service).toContain("withoutSubscriptionFlag(values)");
    }
  });

  it("keeps the inline statement form compact without hiding required fields", () => {
    const form = readFileSync(resolve("src/components/forms/transaction-form.tsx"), "utf8");
    expect(form).toContain("{!fixedType ? <Field");
    expect(form).toContain("Mais opções");
    expect(form).toContain('name="description"');
    expect(form).toContain('name="amountMinor"');
    expect(form).toContain('name="accountId"');
  });
});
