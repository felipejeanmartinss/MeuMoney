import { describe, expect, it } from "vitest";
import {
  boundedDayDate,
  buildCreditCardInvoiceForecast,
  calculateCreditCardCommitment,
  creditCardPurchaseFormSchema,
  effectiveInvoiceStatus,
  getInvoiceDueDate,
  getPurchaseReferenceMonth,
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
    },
    {
      id: "subscription",
      totalAmountMinor: 50_00,
      purchaseDate: "2026-09-07",
      isRecurring: true,
    },
  ];

  it("limits installments and subscriptions to the last registered invoice", () => {
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
    expect(result.committedMinor).toBe(350_00);
    expect(result.availableMinor).toBe(650_00);
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
});

describe("Brazilian card dates", () => {
  it("formats dates and invoice references without timezone conversion", () => {
    expect(formatIsoDatePtBr("2026-09-07")).toBe("07/09/2026");
    expect(formatReferenceMonthPtBr("2026-09-01")).toBe("09/2026");
  });
});
