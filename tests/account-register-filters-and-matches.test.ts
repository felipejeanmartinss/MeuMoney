import { describe, expect, it } from "vitest";
import {
  buildAccountRegister,
  filterAccountRegisterEntries,
  findSimilarPendingRecurrence,
  type AccountRegisterSourceEntry,
} from "../src/domain/account-register";

function source(id: string, date: string, description: string, detail: string, direction: "income" | "expense", amountMinor: number): AccountRegisterSourceEntry {
  return {
    id, entryType: "transaction", transferId: null, transactionDate: date,
    createdAt: `${date}T12:00:00Z`, description, detail, direction,
    amountMinor, status: "completed", isActive: true, reconciledAt: null,
    editHref: null,
  };
}

describe("account statement filters", () => {
  const register = buildAccountRegister([
    source("one", "2026-09-10", "Dividendos AUVP", "Rendimentos › Dividendos", "income", 280_00),
    source("two", "2026-09-11", "Mercado", "Alimentação › Mercado", "expense", 95_00),
  ], 0, "2026-09-24");

  it("filters by date, accent-insensitive description/category and exact inflow/outflow", () => {
    expect(filterAccountRegisterEntries(register, { dateFrom: "2026-09-11" }).map((entry) => entry.id)).toEqual(["two"]);
    expect(filterAccountRegisterEntries(register, { description: "DIVIDENDOS", category: "rendimentos", income: "280,00" }).map((entry) => entry.id)).toEqual(["one"]);
    expect(filterAccountRegisterEntries(register, { expense: "95,00" }).map((entry) => entry.id)).toEqual(["two"]);
    expect(filterAccountRegisterEntries(register, { income: "95,00" })).toEqual([]);
  });
});

describe("recurring forecast matching", () => {
  const candidates = [{ id: "forecast", accountId: "account", categoryId: "energy", transactionType: "expense" as const, description: "Conta de energia", amountMinor: 150_00, transactionDate: "2026-09-20" }];

  it("suggests a similar forecast within the date and amount tolerance", () => {
    expect(findSimilarPendingRecurrence(candidates, {
      accountId: "account", categoryId: "energy", transactionType: "expense", description: "Energia conta setembro",
      amountMinor: 155_00, transactionDate: "2026-09-23",
    })?.id).toBe("forecast");
  });

  it("does not suggest another account or an unrelated merchant", () => {
    expect(findSimilarPendingRecurrence(candidates, {
      accountId: "other", categoryId: "energy", transactionType: "expense", description: "Conta de energia",
      amountMinor: 150_00, transactionDate: "2026-09-20",
    })).toBeNull();
    expect(findSimilarPendingRecurrence(candidates, {
      accountId: "account", categoryId: "energy", transactionType: "expense", description: "Restaurante",
      amountMinor: 150_00, transactionDate: "2026-09-20",
    })).toBeNull();
  });
});
