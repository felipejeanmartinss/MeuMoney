import { describe, expect, it } from "vitest";
import { transactionFormSchema } from "../src/domain/transactions";
import {
  accountTransferDestinationValue,
  creditCardTransferDestinationValue,
  creditCardTransferFormSchema,
  parseTransferDestinationTarget,
  transferFiltersSchema,
  transferFormSchema,
} from "../src/domain/transfers";

const accountA = "11111111-1111-4111-8111-111111111111";
const accountB = "22222222-2222-4222-8222-222222222222";
const category = "33333333-3333-4333-8333-333333333333";

describe("Sprint 3 financial movement validation", () => {
  it("normalizes a positive transaction amount to minor units", () => {
    const result = transactionFormSchema.safeParse({
      accountId: accountA,
      categoryId: category,
      transactionType: "expense",
      description: "Mercado",
      amountMinor: "1.234,56",
      transactionDate: "2026-07-23",
      status: "completed",
      notes: "",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amountMinor).toBe(123456);
  });

  it("rejects zero, negative values, impossible dates and invalid statuses", () => {
    const base = {
      accountId: accountA,
      categoryId: category,
      transactionType: "income",
      description: "Receita",
      transactionDate: "2026-07-23",
      status: "completed",
      notes: "",
    };

    expect(
      transactionFormSchema.safeParse({ ...base, amountMinor: "0,00" }).success,
    ).toBe(false);
    expect(
      transactionFormSchema.safeParse({ ...base, amountMinor: "-10,00" })
        .success,
    ).toBe(false);
    expect(
      transactionFormSchema.safeParse({
        ...base,
        amountMinor: "10,00",
        transactionDate: "2026-02-31",
      }).success,
    ).toBe(false);
    expect(
      transactionFormSchema.safeParse({
        ...base,
        amountMinor: "10,00",
        status: "cancelled",
      }).success,
    ).toBe(false);
  });

  it("accepts transfers only between different accounts", () => {
    const base = {
      sourceAccountId: accountA,
      amountMinor: "250,00",
      transactionDate: "2026-07-23",
      status: "pending",
      description: "",
      notes: "",
    };

    expect(
      transferFormSchema.safeParse({
        ...base,
        destinationAccountId: accountB,
      }).success,
    ).toBe(true);
    expect(
      transferFormSchema.safeParse({
        ...base,
        destinationAccountId: accountA,
      }).success,
    ).toBe(false);
  });

  it("distinguishes account transfers from transfers to credit cards", () => {
    expect(
      parseTransferDestinationTarget(
        accountTransferDestinationValue(accountB),
      ),
    ).toEqual({ kind: "account", id: accountB });
    expect(
      parseTransferDestinationTarget(
        creditCardTransferDestinationValue(category),
      ),
    ).toEqual({ kind: "credit_card", id: category });
    expect(parseTransferDestinationTarget("card:invalid")).toBeNull();
  });

  it("validates a positive transfer to an active credit-card destination", () => {
    const result = creditCardTransferFormSchema.safeParse({
      sourceAccountId: accountA,
      destinationCreditCardId: category,
      amountMinor: "480,35",
      transactionDate: "2026-08-15",
      status: "completed",
      description: "Pagamento do cartão",
      notes: "",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.amountMinor).toBe(48_035);
  });

  it("sanitizes transfer filters and defaults to active records", () => {
    const result = transferFiltersSchema.parse({
      status: "completed",
      accountId: accountA,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    expect(result).toEqual({
      status: "completed",
      accountId: accountA,
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      activity: "active",
    });
  });
});
