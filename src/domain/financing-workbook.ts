import { assertMinorUnits } from "./money";
import { isValidIsoDate } from "./dates";

export type FinancingWorkbookRow = {
  id?: string;
  installmentNumber: number;
  dueDate: string;
  principalMinor: number;
  interestMinor: number;
  totalAmountMinor: number;
  chargesMinor: number;
  extraAmortizationMinor: number;
  extraFgtsMinor: number;
  outstandingBalanceMinor: number;
  paymentStatus: "paid" | "scheduled";
  paymentDate: string;
  paidAmountMinor: number;
  installmentsReduced: number;
  correctionFactor: string;
  linkedTransactionId: string | null;
};

const moneyFields = [
  "principalMinor", "interestMinor", "totalAmountMinor", "chargesMinor",
  "extraAmortizationMinor", "extraFgtsMinor", "outstandingBalanceMinor", "paidAmountMinor",
] as const;
const editableFields = [
  "dueDate", "principalMinor", "interestMinor", "totalAmountMinor", "chargesMinor",
  "extraAmortizationMinor", "extraFgtsMinor", "outstandingBalanceMinor", "paymentStatus", "paymentDate",
  "paidAmountMinor", "installmentsReduced", "correctionFactor",
] as const;

export function validateFinancingWorkbookRow(row: FinancingWorkbookRow) {
  if (!Number.isInteger(row.installmentNumber) || row.installmentNumber < 0 || row.installmentNumber > 10_000) {
    throw new Error("Número da parcela inválido.");
  }
  if (!isValidIsoDate(row.dueDate)) throw new Error(`Vencimento inválido na parcela ${row.installmentNumber}.`);
  if (!Number.isInteger(row.installmentsReduced) || row.installmentsReduced < 0 || row.installmentsReduced > 1200) {
    throw new Error(`Parcelas reduzidas inválidas na parcela ${row.installmentNumber}.`);
  }
  for (const field of moneyFields) {
    if (assertMinorUnits(row[field]) < 0) throw new Error(`Valor negativo na parcela ${row.installmentNumber}.`);
  }
  if (row.extraFgtsMinor > row.extraAmortizationMinor) throw new Error(`FGTS maior que a amortização extra na parcela ${row.installmentNumber}.`);
  if (row.paymentStatus === "paid" && !isValidIsoDate(row.paymentDate)) {
    throw new Error(`Informe a data de pagamento da parcela ${row.installmentNumber}.`);
  }
  if (row.paymentStatus === "scheduled" && (row.paymentDate || row.paidAmountMinor !== 0)) {
    throw new Error(`A parcela ${row.installmentNumber} a vencer não pode ter pagamento registrado.`);
  }
  if (row.correctionFactor && !/^\d+(?:[.,]\d{1,10})?$/.test(row.correctionFactor)) {
    throw new Error(`Fator de correção inválido na parcela ${row.installmentNumber}.`);
  }
}

/** The workbook is the editable schedule; paid or linked history in the app is immutable. */
export function mergeFinancingWorkbookRows(
  existing: readonly FinancingWorkbookRow[],
  imported: readonly FinancingWorkbookRow[],
) {
  if (!imported.length || imported.length > 1200 || existing.length + imported.length > 2400) {
    throw new Error("A planilha deve conter de 1 a 1.200 parcelas.");
  }
  const existingById = new Map(existing.filter((row) => row.id).map((row) => [row.id, row]));
  const existingByNumber = new Map(existing.map((row) => [row.installmentNumber, row]));
  const merged = new Map<number, FinancingWorkbookRow>();
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();
  let updated = 0;
  let added = 0;
  let preserved = 0;
  let removed = 0;

  for (const row of imported) {
    validateFinancingWorkbookRow(row);
    if (seenNumbers.has(row.installmentNumber)) throw new Error(`Parcela ${row.installmentNumber} repetida na planilha.`);
    seenNumbers.add(row.installmentNumber);
    if (row.id) {
      if (seenIds.has(row.id)) throw new Error("A planilha repete o identificador de uma parcela.");
      seenIds.add(row.id);
      if (!existingById.has(row.id)) throw new Error(`A parcela ${row.installmentNumber} não pertence a este contrato.`);
    }
    const matched = row.id ? existingById.get(row.id) : existingByNumber.get(row.installmentNumber);
    if (matched && matched.installmentNumber !== row.installmentNumber) {
      throw new Error(`Não altere o número da parcela ${matched.installmentNumber}; ajuste apenas seus valores ou vencimento.`);
    }
    if (matched && (matched.paymentStatus === "paid" || matched.linkedTransactionId)) {
      merged.set(matched.installmentNumber, { ...matched });
      preserved += 1;
      continue;
    }
    if (matched) {
      merged.set(matched.installmentNumber, {
        ...row, id: matched.id, linkedTransactionId: matched.linkedTransactionId,
      });
      if (editableFields.some((field) => row[field] !== matched[field])) updated += 1;
    } else {
      if (merged.has(row.installmentNumber)) throw new Error(`Parcela ${row.installmentNumber} duplicada.`);
      merged.set(row.installmentNumber, { ...row, id: undefined, linkedTransactionId: null });
      added += 1;
    }
  }
  for (const row of existing) {
    if (seenNumbers.has(row.installmentNumber)) continue;
    if (row.paymentStatus === "paid" || row.linkedTransactionId) {
      merged.set(row.installmentNumber, { ...row });
      preserved += 1;
    } else {
      removed += 1;
    }
  }
  const rows = [...merged.values()].sort((left, right) => left.installmentNumber - right.installmentNumber);
  if (rows.length > 1200) throw new Error("O fluxo não pode exceder 1.200 parcelas.");
  return { rows, updated, added, preserved, removed };
}
