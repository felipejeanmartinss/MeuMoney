import { describe, expect, it } from "vitest";
import { mergeFinancingWorkbookRows, type FinancingWorkbookRow } from "../src/domain/financing-workbook";
import { exportFinancingWorkbook, importFinancingWorkbook } from "../src/utils/financing-xlsx";

function row(number: number): FinancingWorkbookRow {
  return { id: `id-${number}`, installmentNumber: number, dueDate: `2026-${String(number).padStart(2, "0")}-10`,
    principalMinor: 10_000, interestMinor: 1000, totalAmountMinor: 11_000, chargesMinor: 0,
    extraAmortizationMinor: 0, extraFgtsMinor: 0, outstandingBalanceMinor: 30_000 - number * 10_000,
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
  it("removes omitted future rows, appends new paid rows and rejects foreign IDs", () => {
    const result = mergeFinancingWorkbookRows([row(1), row(2)], [row(1), { ...row(3), id: undefined, paymentStatus: "scheduled" }]);
    expect(result.rows.map((item) => item.installmentNumber)).toEqual([1, 3]);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(() => mergeFinancingWorkbookRows([row(1)], [{ ...row(1), id: "foreign" }])).toThrow(/não pertence/);
  });
  it("imports paid dates and amounts for editable rows while keeping existing paid history", () => {
    const paid = { ...row(1), paymentStatus: "paid" as const, paymentDate: "2026-01-10", paidAmountMinor: 11_000 };
    const importedPaid = { ...row(2), paymentStatus: "paid" as const, paymentDate: "2026-02-12", paidAmountMinor: 13_000 };
    const result = mergeFinancingWorkbookRows([paid, row(2), row(3)], [
      { ...paid, paidAmountMinor: 100 }, importedPaid,
      { ...row(4), id: undefined, outstandingBalanceMinor: 0, paymentStatus: "paid", paymentDate: "2026-04-12", paidAmountMinor: 15_000 },
    ]);
    expect(result.rows.find((item) => item.installmentNumber === 1)).toEqual(paid);
    expect(result.rows.find((item) => item.installmentNumber === 2)).toEqual(importedPaid);
    expect(result.rows.find((item) => item.installmentNumber === 4)?.paidAmountMinor).toBe(15_000);
    expect(result.removed).toBe(1);
    expect(result.preserved).toBe(1);
  });
  it("preserves paid or linked entries even if the workbook omits them", () => {
    const paid = { ...row(1), paymentStatus: "paid" as const, paymentDate: "2026-01-10", paidAmountMinor: 11_000 };
    const linked = { ...row(2), linkedTransactionId: "transaction-2" };
    const result = mergeFinancingWorkbookRows([paid, linked, row(3)], [row(3)]);
    expect(result.rows).toEqual([paid, linked, row(3)]);
    expect(result.preserved).toBe(2);
    expect(result.removed).toBe(0);
  });
  it("rejects duplicate installments and invalid dates", () => {
    expect(() => mergeFinancingWorkbookRows([], [{ ...row(1), id: undefined }, { ...row(1), id: undefined }])).toThrow(/repetida/);
    expect(() => mergeFinancingWorkbookRows([], [{ ...row(1), id: undefined, dueDate: "2026-02-30" }])).toThrow(/Vencimento/);
    expect(() => mergeFinancingWorkbookRows([], [{ ...row(1), id: undefined, extraAmortizationMinor: 1000, extraFgtsMinor: 1001 }])).toThrow(/FGTS/);
  });
  it("round-trips the exported Excel base with cents, dates and IDs", async () => {
    const original = [{ ...row(1), paymentStatus: "paid" as const, paymentDate: "2026-01-12", paidAmountMinor: 11_000, extraAmortizationMinor: 2500, extraFgtsMinor: 2500 }, row(2)];
    const bytes = await exportFinancingWorkbook(original, "Contrato de teste");
    const imported = await importFinancingWorkbook(new File([bytes], "contrato.xlsx"));
    expect(imported).toEqual(original);
  });
  it("continues to read dates as text from older exported bases", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const original = { ...row(1), paymentStatus: "paid" as const, paymentDate: "2026-01-12", paidAmountMinor: 11_000 };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportFinancingWorkbook([original], "Contrato legado"));
    const sheet = workbook.getWorksheet("Parcelas")!;
    sheet.getCell("B5").value = original.dueDate;
    sheet.getCell("L5").value = original.paymentDate;
    const imported = await importFinancingWorkbook(new File([await workbook.xlsx.writeBuffer()], "legado.xlsx"));
    expect(imported).toEqual([original]);
  });
  it("accepts the older Excel model without an FGTS column", async () => {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportFinancingWorkbook([row(1)], "Contrato legado"));
    const sheet = workbook.getWorksheet("Parcelas")!;
    sheet.getCell("O4").value = null;
    sheet.getCell("O5").value = null;
    const imported = await importFinancingWorkbook(new File([await workbook.xlsx.writeBuffer()], "legado.xlsx"));
    expect(imported).toEqual([row(1)]);
  });
});
