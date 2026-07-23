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

  it("keeps credit cards and investments outside Sprint 2 account forms", () => {
    for (const type of ["credit_card", "investment"]) {
      expect(
        accountFormSchema.safeParse({
          name: "Fora do escopo",
          type,
          context: "personal",
          currency: "BRL",
          openingBalanceMinor: "0,00",
          openingBalanceDate: "2026-07-23",
        }).success,
      ).toBe(false);
    }
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
      }).success,
    ).toBe(true);
    expect(
      categoryFormSchema.safeParse({
        name: "Inválida",
        kind: "transfer",
        context: "personal",
      }).success,
    ).toBe(false);
  });
});
