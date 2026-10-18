import type { FinancingWorkbookRow } from "@/domain/financing-workbook";
import { validateFinancingWorkbookRow } from "@/domain/financing-workbook";
import { parseMoneyInputToMinor } from "@/domain/money";

const MARKER = "MEUMONEY_FINANCING_V1";
const HEADERS = ["Parcela", "Vencimento", "Principal (R$)", "Juros (R$)", "Valor total (R$)",
  "Taxas/multas (R$)", "Amortização extra (R$)", "Saldo devedor (R$)", "Fator de correção",
  "Parcelas reduzidas", "Situação (histórico)", "Pagamento (histórico)", "Valor pago (histórico)", "ID interno"];
const moneyKeys = ["principalMinor", "interestMinor", "totalAmountMinor", "chargesMinor", "extraAmortizationMinor", "outstandingBalanceMinor"] as const;

function excelDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateValue(value: unknown) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Data inválida na planilha.");
    return value.toISOString().slice(0, 10);
  }
  return String(cellValue(value)).trim();
}

function cellValue(value: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
  if (value === null || value === undefined) return "";
  throw new Error("A planilha contém fórmulas ou tipos de célula não permitidos.");
}

function moneyToMinor(value: unknown) {
  const raw = cellValue(value);
  if (typeof raw === "number") {
    const cents = Math.round(raw * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(raw * 100 - cents) > 0.00001) throw new Error("Valor monetário com mais de duas casas decimais.");
    return cents;
  }
  return raw.trim() ? parseMoneyInputToMinor(raw) : 0;
}

function integer(value: unknown, label: string) {
  const raw = cellValue(value);
  if (raw === "") return 0;
  const number = Number(raw);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} inválido na planilha.`);
  return number;
}

export async function exportFinancingWorkbook(rows: readonly FinancingWorkbookRow[], contractName: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MeuMoney";
  const sheet = workbook.addWorksheet("Parcelas", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.getCell("A1").value = MARKER;
  sheet.getCell("A2").value = `Fluxo de financiamento · ${contractName}`;
  sheet.getCell("A3").value = "Parcelas pagas/vinculadas na aplicação são preservadas. Linhas sem pagamento/vínculo removidas serão excluídas após conferir a prévia e salvar.";
  sheet.getRow(4).values = HEADERS;
  sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
  sheet.columns.forEach((column, index) => { column.width = index === 1 ? 17 : index >= 2 && index <= 7 ? 21 : 19; });
  sheet.getColumn(14).hidden = true;
  for (const row of rows) {
    // An unsaved contract starts with a blank installment: export it as a fillable template.
    if (row.dueDate) validateFinancingWorkbookRow(row);
    const excelRow = sheet.addRow([row.installmentNumber, excelDate(row.dueDate),
      ...moneyKeys.map((key) => row[key] / 100), row.correctionFactor, row.installmentsReduced,
      row.paymentStatus === "paid" ? "Paga" : "A vencer", excelDate(row.paymentDate), row.paidAmountMinor / 100, row.id ?? ""]);
    excelRow.getCell(2).numFmt = "dd/mm/yyyy";
    excelRow.getCell(12).numFmt = "dd/mm/yyyy";
    for (let column = 3; column <= 8; column += 1) excelRow.getCell(column).numFmt = '#,##0.00';
    excelRow.getCell(13).numFmt = '#,##0.00';
  }
  sheet.autoFilter = { from: "A4", to: "M4" };
  return workbook.xlsx.writeBuffer();
}

export async function importFinancingWorkbook(file: File): Promise<FinancingWorkbookRow[]> {
  if (file.size > 2_000_000) throw new Error("A planilha deve ter até 2 MB.");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Selecione uma planilha .xlsx exportada pelo MeuMoney.");
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet("Parcelas");
  if (!sheet || sheet.getCell("A1").value !== MARKER || HEADERS.some((header, index) => sheet.getRow(4).getCell(index + 1).value !== header)) {
    throw new Error("Use a base Excel exportada pelo MeuMoney, sem alterar os cabeçalhos.");
  }
  if (sheet.rowCount > 1204) throw new Error("A planilha excede 1.200 parcelas.");
  const rows: FinancingWorkbookRow[] = [];
  for (let number = 5; number <= sheet.rowCount; number += 1) {
    const cells = sheet.getRow(number);
    if (cells.getCell(1).value === null && cells.getCell(2).value === null) continue;
    try {
      const get = (index: number) => cellValue(cells.getCell(index).value);
      const status = get(11);
      if (status !== "Paga" && status !== "A vencer") throw new Error("Situação inválida.");
      const row: FinancingWorkbookRow = {
        id: String(get(14)).trim() || undefined,
        installmentNumber: integer(cells.getCell(1).value, "Parcela"),
        dueDate: dateValue(cells.getCell(2).value),
        principalMinor: moneyToMinor(cells.getCell(3).value), interestMinor: moneyToMinor(cells.getCell(4).value),
        totalAmountMinor: moneyToMinor(cells.getCell(5).value), chargesMinor: moneyToMinor(cells.getCell(6).value),
        extraAmortizationMinor: moneyToMinor(cells.getCell(7).value), outstandingBalanceMinor: moneyToMinor(cells.getCell(8).value),
        correctionFactor: String(get(9)).trim(), installmentsReduced: integer(cells.getCell(10).value, "Parcelas reduzidas"),
        paymentStatus: status === "Paga" ? "paid" : "scheduled", paymentDate: dateValue(cells.getCell(12).value),
        paidAmountMinor: moneyToMinor(cells.getCell(13).value), linkedTransactionId: null,
      };
      validateFinancingWorkbookRow(row);
      rows.push(row);
    } catch (error) {
      throw new Error(`Linha ${number}: ${error instanceof Error ? error.message : "dados inválidos."}`);
    }
  }
  if (!rows.length) throw new Error("A planilha não contém parcelas.");
  return rows;
}
