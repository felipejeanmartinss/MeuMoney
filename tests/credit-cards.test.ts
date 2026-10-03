import { describe, expect, it } from "vitest";
import {
  boundedDayDate,
  buildCreditCardInvoiceForecast,
  calculateCreditCardCommitment,
  creditCardPurchaseFormSchema,
  effectiveInvoiceStatus,
  getInvoiceDueDate,
  getInvoiceBillingMonth,
  getPurchaseReferenceMonth,
  remainingCreditCardInvoiceAmount,
  selectNextCreditCardInvoice,
  summarizeNextCreditCardInvoices,
  splitInstallments,
} from "../src/domain/credit-cards";
import {
  formatIsoDatePtBr,
  formatReferenceMonthPtBr,
} from "../src/utils/dates";

describe("credit card cycles", () => {
  it("keeps purchases through closing day in the current competence", () => {
    expect(getPurchaseReferenceMonth("2026-07-20", 20)).toBe("2026-07-01");
  });

  it("moves a purchase after closing to the next competence", () => {
    expect(getPurchaseReferenceMonth("2026-07-21", 20)).toBe("2026-08-01");
  });

  it("bounds closing and due days in short and leap-year months", () => {
    expect(boundedDayDate(2026, 2, 31)).toBe("2026-02-28");
    expect(boundedDayDate(2028, 2, 31)).toBe("2028-02-29");
    expect(getInvoiceDueDate("2026-01-01", 20, 31)).toBe("2026-01-31");
    expect(getInvoiceDueDate("2026-01-01", 20, 10)).toBe("2026-02-10");
  });

  it("labels a statement by the month before its due date", () => {
    expect(getInvoiceBillingMonth("2026-01-11")).toBe("2025-12-01");
  });
});

describe("account card summary", () => {
  it("uses exactly one next invoice per card in the total shown above the rows", () => {
    const cards = [
      { id: "bradesco", currency: "BRL" as const },
      { id: "nubank", currency: "BRL" as const },
    ];
    const invoices = [
      { credit_card_id: "bradesco", status: "open" as const, total_amount: 55309, paid_amount: 0, due_date: "2026-10-01" },
      { credit_card_id: "bradesco", status: "open" as const, total_amount: 60000, paid_amount: 0, due_date: "2026-11-01" },
      { credit_card_id: "nubank", status: "closed" as const, total_amount: 80274, paid_amount: 10000, due_date: "2026-10-02" },
    ];
    const rows = summarizeNextCreditCardInvoices(cards, invoices);
    expect(rows.map((row) => row.amountMinor)).toEqual([55309, 70274]);
    expect(rows.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(125583);
  });
});

describe("credit card installment split", () => {
  it("preserves the exact total and puts the remainder in the last parcel", () => {
    const installments = splitInstallments(10_00, 3, "2026-07-10", 20);
    expect(installments.map((item) => item.amountMinor)).toEqual([
      333, 333, 334,
    ]);
    expect(
      installments.reduce((sum, item) => sum + item.amountMinor, 0),
    ).toBe(10_00);
    expect(installments.map((item) => item.competenceDate)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
  });

  it("rejects a parcel count that would create zero-value parcels", () => {
    expect(() => splitInstallments(2, 3, "2026-07-10", 20)).toThrow();
  });

  it("supports the maximum configured number of installments", () => {
    expect(splitInstallments(240, 240, "2026-07-10", 20)).toHaveLength(240);
  });
});

describe("invoice presentation status", () => {
  it("derives overdue only for a closed invoice past due", () => {
    expect(effectiveInvoiceStatus("closed", "2026-07-10", "2026-07-11")).toBe(
      "overdue",
    );
    expect(effectiveInvoiceStatus("paid", "2026-07-10", "2026-07-11")).toBe(
      "paid",
    );
  });

  it("skips an old empty invoice when a later open invoice has value", () => {
    const selected = selectNextCreditCardInvoice([
      {
        id: "old-empty",
        status: "open",
        total_amount: 0,
        due_date: "2026-01-22",
      },
      {
        id: "current",
        status: "open",
        total_amount: 70_274,
        due_date: "2026-10-22",
      },
    ]);

    expect(selected?.id).toBe("current");
  });
});

describe("editable installment purchases", () => {
  const purchase = {
    categoryId: "d9428888-122b-11e1-b85c-61cd3cbb3210",
    description: "Assinatura",
    totalAmount: "100,00",
    purchaseDate: "2026-09-07",
    installmentCount: "3",
    installmentAmounts: ["33,33", "33,33", "33,34"],
    isRecurring: false,
    entryKind: "purchase",
    targetInvoiceId: "",
    notes: "",
  };

  it("accepts a custom distribution that preserves the purchase total", () => {
    const parsed = creditCardPurchaseFormSchema.safeParse(purchase);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.installmentAmounts).toEqual([3333, 3333, 3334]);
      expect(parsed.data.isRecurring).toBe(false);
    }
  });

  it("rejects installment values whose sum differs from the purchase", () => {
    const parsed = creditCardPurchaseFormSchema.safeParse({
      ...purchase,
      installmentAmounts: ["33,33", "33,33", "33,33"],
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps subscriptions without a fixed installment count", () => {
    expect(
      creditCardPurchaseFormSchema.safeParse({
        ...purchase,
        installmentCount: "1",
        installmentAmounts: ["100,00"],
        isRecurring: true,
      }).success,
    ).toBe(true);
    expect(
      creditCardPurchaseFormSchema.safeParse({ ...purchase, isRecurring: true })
        .success,
    ).toBe(false);
  });

  it("accepts only one-off refund and cashback credits", () => {
    expect(
      creditCardPurchaseFormSchema.safeParse({
        ...purchase,
        entryKind: "refund",
        categoryId: "",
        installmentCount: "1",
        installmentAmounts: ["100,00"],
      }).success,
    ).toBe(true);
    expect(
      creditCardPurchaseFormSchema.safeParse({
        ...purchase,
        entryKind: "cashback",
        categoryId: "",
        installmentCount: "2",
        installmentAmounts: ["50,00", "50,00"],
      }).success,
    ).toBe(false);
  });
});

describe("credit card invoice forecast", () => {
  it("keeps fixed installments and projects subscriptions for six months", () => {
    const rows = buildCreditCardInvoiceForecast({
      referenceMonth: "2026-09-01",
      invoices: [
        { id: "invoice", referenceMonth: "2026-09-01", totalAmountMinor: 150_00 },
        { id: "installment", referenceMonth: "2026-10-01", totalAmountMinor: 50_00 },
      ],
      subscriptions: [{ amountMinor: 100_00, firstReferenceMonth: "2026-09-01" }],
    });
    expect(rows.map((row) => row.amountMinor)).toEqual([
      150_00,
      150_00,
      100_00,
      100_00,
      100_00,
      100_00,
    ]);
  });
});

describe("credit card commitment horizon", () => {
  const purchases = [
    {
      id: "fixed",
      totalAmountMinor: 300_00,
      purchaseDate: "2026-09-07",
      isRecurring: false,
      entryKind: "purchase" as const,
    },
    {
      id: "subscription",
      totalAmountMinor: 50_00,
      purchaseDate: "2026-09-07",
      isRecurring: true,
      entryKind: "purchase" as const,
    },
  ];

  it("includes future installments even beyond the last registered invoice", () => {
    const result = calculateCreditCardCommitment({
      creditLimitMinor: 1_000_00,
      closingDay: 20,
      invoices: [
        { referenceMonth: "2026-09-01" },
        { referenceMonth: "2026-11-01" },
      ],
      purchases,
      installments: [
        { purchaseId: "fixed", amountMinor: 100_00, competenceDate: "2026-09-01", status: "paid" },
        { purchaseId: "fixed", amountMinor: 100_00, competenceDate: "2026-10-01", status: "pending" },
        { purchaseId: "fixed", amountMinor: 100_00, competenceDate: "2026-11-01", status: "pending" },
        { purchaseId: "subscription", amountMinor: 50_00, competenceDate: "2026-09-01", status: "pending" },
        { purchaseId: "fixed", amountMinor: 100_00, competenceDate: "2026-12-01", status: "pending" },
      ],
    });

    expect(result.lastInvoiceMonth).toBe("2026-11-01");
    expect(result.committedMinor).toBe(450_00);
    expect(result.availableMinor).toBe(550_00);
  });

  it("does not project a paid subscription month again", () => {
    const result = calculateCreditCardCommitment({
      creditLimitMinor: 500_00,
      closingDay: 20,
      invoices: [{ referenceMonth: "2026-10-01" }],
      purchases: [purchases[1]],
      installments: [
        { purchaseId: "subscription", amountMinor: 50_00, competenceDate: "2026-09-01", status: "paid" },
        { purchaseId: "subscription", amountMinor: 50_00, competenceDate: "2026-10-01", status: "paid" },
      ],
    });

    expect(result.committedMinor).toBe(0);
    expect(result.availableMinor).toBe(500_00);
  });

  it("returns the full limit when no invoice horizon exists", () => {
    const result = calculateCreditCardCommitment({
      creditLimitMinor: 210_00,
      closingDay: 20,
      invoices: [],
      purchases,
      installments: [],
    });

    expect(result.committedMinor).toBe(0);
    expect(result.availableMinor).toBe(210_00);
  });

  it("counts registered installments without any invoice and nets partial invoice payments", () => {
    const result = calculateCreditCardCommitment({
      creditLimitMinor: 500_00, closingDay: 20, invoices: [],
      purchases: [{ id: "purchase", totalAmountMinor: 200_00, purchaseDate: "2026-09-01", isRecurring: false, entryKind: "purchase" }],
      installments: [{ purchaseId: "purchase", amountMinor: 200_00, competenceDate: "2026-10-01", status: "pending" }],
    });
    expect(result.committedMinor).toBe(200_00);
    expect(remainingCreditCardInvoiceAmount({ status: "open", total_amount: 200_00, paid_amount: 50_00 })).toBe(150_00);
    expect(remainingCreditCardInvoiceAmount({ status: "paid", total_amount: 200_00, paid_amount: 200_00 })).toBe(0);
  });

  it("subtracts statement credits from the committed limit", () => {
    const result = calculateCreditCardCommitment({
      creditLimitMinor: 1_000_00,
      closingDay: 20,
      invoices: [{ referenceMonth: "2026-09-01" }],
      purchases: [
        {
          id: "expense",
          totalAmountMinor: 300_00,
          purchaseDate: "2026-09-01",
          isRecurring: false,
          entryKind: "purchase",
        },
        {
          id: "refund",
          totalAmountMinor: 80_00,
          purchaseDate: "2026-09-02",
          isRecurring: false,
          entryKind: "refund",
        },
      ],
      installments: [
        {
          purchaseId: "expense",
          amountMinor: 300_00,
          competenceDate: "2026-09-01",
          status: "pending",
        },
        {
          purchaseId: "refund",
          amountMinor: 80_00,
          competenceDate: "2026-09-01",
          status: "pending",
        },
      ],
    });

    expect(result.committedMinor).toBe(220_00);
    expect(result.availableMinor).toBe(780_00);
  });
});

describe("Brazilian card dates", () => {
  it("formats dates and invoice references without timezone conversion", () => {
    expect(formatIsoDatePtBr("2026-09-07")).toBe("07/09/2026");
    expect(formatReferenceMonthPtBr("2026-09-01")).toBe("09/2026");
  });
});
