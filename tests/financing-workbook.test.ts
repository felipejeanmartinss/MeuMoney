import { describe, expect, it } from "vitest";
import { mergeFinancingWorkbookRows, type FinancingWorkbookRow } from "../src/domain/financing-workbook";
import { exportFinancingWorkbook, importFinancingWorkbook } from "../src/utils/financing-xlsx";

function row(number: number): FinancingWorkbookRow {
  return { id: `id-${number}`, installmentNumber: number, dueDate: `2026-${String(number).padStart(2, "0")}-10`,
    principalMinor: 10_000, interestMinor: 1000, totalAmountMinor: 11_000, chargesMinor: 0,
    extraAmortizationMinor: 0, outstandingBalanceMinor: 30_000 - number * 10_000,
    correctionFactor: "", installmentsReduced: 0, paymentStatus: "scheduled", paymentDate: "",
    paidAmountMinor: 0, linkedTransactionId: null };
}

describe("financing Excel merge", () => {
  it("preserves paid and linked history and updates only future rows", () => {
    const first = { ...row(1), paymentStatus: "paid" as const, paymentDate: "2026-01-10", paidAmountMinor: 11_000 };
    const second = { ...row(2), linkedTransactionId: "transaction-2" };
    const third = { ...row(3), installmentNumber: 3, dueDate: "2026-03-10" };
    const imported = [first, second, third].map((item) => ({ ...item, totalAmountMinor: 9000, dueDate: "2026-04-10" }));
    const result = mergeFinancingWorkbookRows([first, second, third], imported);
    expect(result.preserved).toBe(2);
    expect(result.rows[0]).toEqual(first);
    expect(result.rows[1]).toEqual(second);
    expect(result.rows[2].totalAmountMinor).toBe(9000);
    expect(result.rows[2].dueDate).toBe("2026-04-10");
  });
  it("keeps omitted rows, appends new scheduled rows and rejects foreign IDs", () => {
    const result = mergeFinancingWorkbookRows([row(1), row(2)], [row(1), { ...row(3), id: undefined, paymentStatus: "scheduled" }]);
    expect(result.rows.map((item) => item.installmentNumber)).toEqual([1, 2, 3]);
    expect(result.added).toBe(1);
    expect(() => mergeFinancingWorkbookRows([row(1)], [{ ...row(1), id: "foreign" }])).toThrow(/não pertence/);
  });
  it("rejects duplicate installments and invalid dates", () => {
    expect(() => mergeFinancingWorkbookRows([], [{ ...row(1), id: undefined }, { ...row(1), id: undefined }])).toThrow(/repetida/);
    expect(() => mergeFinancingWorkbookRows([], [{ ...row(1), id: undefined, dueDate: "2026-02-30" }])).toThrow(/Vencimento/);
  });
  it("round-trips the exported Excel base with cents, dates and IDs", async () => {
    const original = [row(1), row(2)];
    const bytes = await exportFinancingWorkbook(original, "Contrato de teste");
    const imported = await importFinancingWorkbook(new File([bytes], "contrato.xlsx"));
    expect(imported).toEqual(original);
  });
});
