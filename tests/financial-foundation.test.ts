import { describe, expect, it } from "vitest";
import { accountFormSchema } from "../src/domain/accounts";
import { categoryFormSchema } from "../src/domain/categories";

describe("financial foundation validation", () => {
  it("accepts a supported account with integer opening balance output", () => {
    const result = accountFormSchema.safeParse({
      name: "Conta principal",
      type: "checking",
      context: "personal",
      currency: "BRL",
      openingBalanceMinor: "1.234,56",
      openingBalanceDate: "2026-07-23",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.openingBalanceMinor).toBe(123456);
  });

  it("accepts investment accounts while keeping credit cards in their own module", () => {
    const account = {
      name: "Conta de investimentos",
      context: "personal",
      currency: "BRL",
      openingBalanceMinor: "0,00",
      openingBalanceDate: "2026-07-23",
    };

    expect(accountFormSchema.safeParse({ ...account, type: "investment" }).success).toBe(
      true,
    );
    expect(accountFormSchema.safeParse({ ...account, type: "credit_card" }).success).toBe(
      false,
    );
  });

  it("rejects impossible reference dates", () => {
    expect(
      accountFormSchema.safeParse({
        name: "Conta",
        type: "checking",
        context: "personal",
        currency: "BRL",
        openingBalanceMinor: "0,00",
        openingBalanceDate: "2026-02-31",
      }).success,
    ).toBe(false);
  });

  it("validates custom category nature and context", () => {
    expect(
      categoryFormSchema.safeParse({
        name: "Cuidados com pets",
        kind: "expense",
        context: "personal",
        groupId: "9f560c10-ebca-4b65-952d-e7b27c3ed1ac",
      }).success,
    ).toBe(true);
    expect(
      categoryFormSchema.safeParse({
        name: "Inválida",
        kind: "transfer",
        context: "personal",
        groupId: "9f560c10-ebca-4b65-952d-e7b27c3ed1ac",
      }).success,
    ).toBe(false);
  });

  it("allows fixed-expense classification only for expense subcategories", () => {
    const base = {
      name: "Energia elétrica",
      kind: "expense",
      context: "personal",
      groupId: "9f560c10-ebca-4b65-952d-e7b27c3ed1ac",
      isFixedExpense: "on",
    };
    expect(
      categoryFormSchema.safeParse({
        ...base,
        parentId: "d4d27d69-49c0-4d3d-a192-3f3e5124975e",
      }).success,
    ).toBe(true);
    expect(
      categoryFormSchema.safeParse({ ...base, parentId: "" }).success,
    ).toBe(false);
  });
});
