import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectDueRecurrenceDates,
  nextRecurrenceDate,
  recurringTransactionFormSchema,
} from "../src/domain/recurring-transactions";

const recurringService = readFileSync(
  resolve("src", "services", "finance", "recurring-transactions-service.ts"),
  "utf8",
);
const accountsService = readFileSync(
  resolve("src", "services", "finance", "accounts-service.ts"),
  "utf8",
);

describe("recurring transaction calendar", () => {
  it("advances weekly, monthly and yearly frequencies", () => {
    expect(
      nextRecurrenceDate({
        startDate: "2026-07-26",
        currentOccurrence: "2026-07-26",
        frequency: "weekly",
      }),
    ).toBe("2026-08-02");
    expect(
      nextRecurrenceDate({
        startDate: "2026-07-26",
        currentOccurrence: "2026-07-26",
        frequency: "monthly",
      }),
    ).toBe("2026-08-26");
    expect(
      nextRecurrenceDate({
        startDate: "2026-07-26",
        currentOccurrence: "2026-07-26",
        frequency: "yearly",
      }),
    ).toBe("2027-07-26");
  });

  it("anchors monthly schedules across short months", () => {
    const february = nextRecurrenceDate({
      startDate: "2027-01-31",
      currentOccurrence: "2027-01-31",
      frequency: "monthly",
    });
    const march = nextRecurrenceDate({
      startDate: "2027-01-31",
      currentOccurrence: february,
      frequency: "monthly",
    });

    expect(february).toBe("2027-02-28");
    expect(march).toBe("2027-03-31");
  });

  it("keeps leap-day yearly schedules bounded to the target year", () => {
    const nextNonLeap = nextRecurrenceDate({
      startDate: "2024-02-29",
      currentOccurrence: "2024-02-29",
      frequency: "yearly",
    });
    const nextLeap = nextRecurrenceDate({
      startDate: "2024-02-29",
      currentOccurrence: "2027-02-28",
      frequency: "yearly",
    });

    expect(nextNonLeap).toBe("2025-02-28");
    expect(nextLeap).toBe("2028-02-29");
  });
});

describe("recurring transaction generation", () => {
  it("is idempotent when occurrence dates already exist", () => {
    const result = collectDueRecurrenceDates({
      startDate: "2026-07-01",
      nextOccurrence: "2026-07-01",
      endDate: null,
      frequency: "monthly",
      targetDate: "2026-09-01",
      existingDates: new Set([
        "2026-07-01",
        "2026-08-01",
        "2026-09-01",
      ]),
    });

    expect(result.dueDates).toEqual([]);
    expect(result.nextOccurrence).toBe("2026-10-01");
    expect(result.ended).toBe(false);
  });

  it("stops at the inclusive end date and marks the schedule ended", () => {
    const result = collectDueRecurrenceDates({
      startDate: "2027-01-31",
      nextOccurrence: "2027-01-31",
      endDate: "2027-03-31",
      frequency: "monthly",
      targetDate: "2027-12-31",
    });

    expect(result.dueDates).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
    ]);
    expect(result.nextOccurrence).toBe("2027-04-30");
    expect(result.ended).toBe(true);
  });

  it("validates monetary values and schedule order", () => {
    const validBase = {
      accountId: "11111111-1111-4111-8111-111111111111",
      categoryId: "22222222-2222-4222-8222-222222222222",
      transactionType: "expense",
      description: "Aluguel",
      amountMinor: "1.500,00",
      frequency: "monthly",
      startDate: "2026-07-26",
      endDate: "",
      nextOccurrence: "2026-07-26",
      notes: "",
    };

    const parsed = recurringTransactionFormSchema.safeParse(validBase);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amountMinor).toBe(150000);

    expect(
      recurringTransactionFormSchema.safeParse({
        ...validBase,
        endDate: "2026-07-25",
      }).success,
    ).toBe(false);
    expect(
      recurringTransactionFormSchema.safeParse({
        ...validBase,
        nextOccurrence: "2026-07-25",
      }).success,
    ).toBe(false);
  });
});

describe("recurring transaction operational lists", () => {
  it("keeps ended schedules out of global and account agendas", () => {
    expect(recurringService).toContain('.is("ended_at", null)');
    expect(accountsService).toContain('.is("ended_at", null)');
  });
});
