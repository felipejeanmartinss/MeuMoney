import { describe, expect, it } from "vitest";
import {
  boundedDayDate,
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
    isRecurring: true,
    notes: "",
  };

  it("accepts a custom distribution that preserves the purchase total", () => {
    const parsed = creditCardPurchaseFormSchema.safeParse(purchase);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.installmentAmounts).toEqual([3333, 3333, 3334]);
      expect(parsed.data.isRecurring).toBe(true);
    }
  });

  it("rejects installment values whose sum differs from the purchase", () => {
    const parsed = creditCardPurchaseFormSchema.safeParse({
      ...purchase,
      installmentAmounts: ["33,33", "33,33", "33,33"],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("Brazilian card dates", () => {
  it("formats dates and invoice references without timezone conversion", () => {
    expect(formatIsoDatePtBr("2026-09-07")).toBe("07/09/2026");
    expect(formatReferenceMonthPtBr("2026-09-01")).toBe("09/2026");
  });
});
