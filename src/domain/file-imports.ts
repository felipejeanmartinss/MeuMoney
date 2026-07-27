import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { parseMoneyInputToMinor } from "./money";

export const IMPORT_FILE_TYPES = ["csv", "ofx", "pdf"] as const;
export const IMPORT_ROW_STATUSES = [
  "needs_review",
  "valid",
  "duplicate",
  "ignored",
  "imported",
  "error",
] as const;
export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
export const CSV_DATE_FORMATS = [
  "DD/MM/YYYY",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
] as const;
export const CSV_DECIMAL_SEPARATORS = [",", "."] as const;

export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];
export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];
export type CsvDecimalSeparator =
  (typeof CSV_DECIMAL_SEPARATORS)[number];
export type ImportValidationCode =
  | "invalid_date"
  | "invalid_amount"
  | "missing_description"
  | "unsupported_record";

export type CsvImportConfig = {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  skipRows: number;
  dateColumn: number;
  descriptionColumn: number;
  amountColumn: number;
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
  invertAmountSign: boolean;
};

export type ParsedImportRow = {
  sourceRowNumber: number;
  sourceExternalId: string | null;
  sourceDateText: string;
  sourceAmountText: string;
  transactionDate: string | null;
  description: string | null;
  signedAmountMinor: number | null;
  validationCode: ImportValidationCode | null;
  sourceDescriptionOriginal?: string | null;
  sourcePages?: number[];
  confidence?: number | null;
  sourceAdapterId?: string | null;
  sourceDocumentType?: string | null;
};

export type ImportSignatureInput = {
  userId: string;
  accountId: string;
  transactionDate: string;
  signedAmountMinor: number;
  description: string;
};

export type ImportConfirmationCandidate = {
  id: string;
  signature: string | null;
  status: ImportRowStatus;
  isSelected: boolean;
};

const columnNumber = z.coerce
  .number()
  .int("Informe o número da coluna.")
  .min(1, "A primeira coluna é 1.")
  .max(100, "Use uma coluna entre 1 e 100.");

export const csvImportConfigSchema = z.object({
  delimiter: z.enum(CSV_DELIMITERS, {
    error: "Selecione o separador do arquivo.",
  }),
  hasHeader: z.boolean(),
  skipRows: z.coerce
    .number()
    .int()
    .min(0, "O número de linhas ignoradas não pode ser negativo.")
    .max(20, "Ignore no máximo 20 linhas antes do cabeçalho."),
  dateColumn: columnNumber,
  descriptionColumn: columnNumber,
  amountColumn: columnNumber,
  dateFormat: z.enum(CSV_DATE_FORMATS, {
    error: "Selecione o formato da data.",
  }),
  decimalSeparator: z.enum(CSV_DECIMAL_SEPARATORS, {
    error: "Selecione o separador decimal.",
  }),
  invertAmountSign: z.boolean(),
});

export const importFileTypeSchema = z.enum(IMPORT_FILE_TYPES, {
  error: "Selecione CSV, OFX ou PDF.",
});

export const importJobIdSchema = z.uuid("Importação inválida.");
export const importRowIdSchema = z.uuid("Linha de importação inválida.");

const signedAmountInput = z
  .string()
  .trim()
  .transform((value, context) => {
    try {
      const amount = parseMoneyInputToMinor(value);
      if (amount === 0) {
        context.addIssue({
          code: "custom",
          message: "O valor não pode ser zero.",
        });
        return z.NEVER;
      }
      return amount;
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Informe um valor válido.",
      });
      return z.NEVER;
    }
  });

export const importRowCorrectionSchema = z.object({
  rowId: importRowIdSchema,
  transactionDate: z
    .string()
    .refine(isValidIsoDate, "Informe uma data válida."),
  description: z
    .string()
    .trim()
    .min(1, "Informe a descrição.")
    .max(180, "Use até 180 caracteres."),
  signedAmountMinor: signedAmountInput,
  categoryId: z.uuid("Selecione uma categoria válida."),
});

export function normalizeImportDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildImportSignatureMaterial(
  input: ImportSignatureInput,
): string {
  if (!Number.isSafeInteger(input.signedAmountMinor)) {
    throw new Error("Import amount must use safe integer minor units.");
  }
  return [
    input.userId,
    input.accountId,
    input.transactionDate,
    String(input.signedAmountMinor),
    normalizeImportDescription(input.description),
  ].join("|");
}

export function markDuplicateSignatures(
  signatures: Array<string | null>,
  existingSignatures: ReadonlySet<string> = new Set(),
): boolean[] {
  const seen = new Set(existingSignatures);
  return signatures.map((signature) => {
    if (!signature) return false;
    if (seen.has(signature)) return true;
    seen.add(signature);
    return false;
  });
}

export function buildAtomicImportPlan(
  candidates: ImportConfirmationCandidate[],
): ImportConfirmationCandidate[] {
  const selected = candidates.filter((candidate) => candidate.isSelected);
  if (selected.length === 0) {
    throw new Error("Import confirmation requires at least one selected row.");
  }
  if (
    selected.some(
      (candidate) =>
        candidate.status !== "valid" || candidate.signature === null,
    )
  ) {
    throw new Error("Import confirmation contains an invalid row.");
  }
  if (
    markDuplicateSignatures(selected.map((candidate) => candidate.signature))
      .some(Boolean)
  ) {
    throw new Error("Import confirmation contains duplicate signatures.");
  }
  return selected.map((candidate) => ({ ...candidate }));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildIsoDate(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

export function parseImportDate(
  rawValue: string,
  format: CsvDateFormat,
): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (format === "YYYY-MM-DD") {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
    return match
      ? buildIsoDate(Number(match[1]), Number(match[2]), Number(match[3]))
      : null;
  }

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  return format === "DD/MM/YYYY"
    ? buildIsoDate(year, second, first)
    : buildIsoDate(year, first, second);
}

export function parseImportAmountToMinor(
  rawValue: string,
  decimalSeparator: CsvDecimalSeparator,
): number {
  let value = rawValue
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/[A-Za-z$€£¥]/g, "");

  if (!value) throw new Error("Valor vazio.");

  const isParenthesized = value.startsWith("(") && value.endsWith(")");
  if (isParenthesized) value = `-${value.slice(1, -1)}`;
  value = value.replace(/^\+/, "");

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const thousandsSeparator = decimalSeparator === "," ? "." : ",";
  const normalized = unsigned
    .split(thousandsSeparator)
    .join("")
    .replace(decimalSeparator, ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Valor monetário inválido.");
  }

  const [unitsPart, decimalPart = ""] = normalized.split(".");
  const absoluteMinor =
    BigInt(unitsPart) * 100n + BigInt(decimalPart.padEnd(2, "0"));
  const signedMinor = negative ? -absoluteMinor : absoluteMinor;

  if (
    signedMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
    signedMinor < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("Valor monetário acima do limite seguro.");
  }

  return Number(signedMinor);
}

export function parseDelimitedText(
  content: string,
  delimiter: CsvDelimiter,
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (quoted && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (quoted) throw new Error("CSV com aspas não finalizadas.");
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function validationCodeFor(
  transactionDate: string | null,
  signedAmountMinor: number | null,
  description: string | null,
): ImportValidationCode | null {
  if (!transactionDate) return "invalid_date";
  if (signedAmountMinor === null || signedAmountMinor === 0) {
    return "invalid_amount";
  }
  if (!description) return "missing_description";
  return null;
}

export function parseConfiguredCsv(
  content: string,
  config: CsvImportConfig,
): ParsedImportRow[] {
  const allRows = parseDelimitedText(content.replace(/^\uFEFF/, ""), config.delimiter);
  const dataStart = config.skipRows + (config.hasHeader ? 1 : 0);
  const dataRows = allRows.slice(dataStart);
  const dateIndex = config.dateColumn - 1;
  const descriptionIndex = config.descriptionColumn - 1;
  const amountIndex = config.amountColumn - 1;

  return dataRows.map((columns, rowIndex) => {
    const sourceDateText = columns[dateIndex]?.trim() ?? "";
    const sourceAmountText = columns[amountIndex]?.trim() ?? "";
    const rawDescription = columns[descriptionIndex]?.trim() ?? "";
    const description = rawDescription
      ? rawDescription.replace(/\s+/g, " ").slice(0, 180)
      : null;
    const transactionDate = parseImportDate(
      sourceDateText,
      config.dateFormat,
    );
    let signedAmountMinor: number | null = null;
    try {
      signedAmountMinor = parseImportAmountToMinor(
        sourceAmountText,
        config.decimalSeparator,
      );
      if (config.invertAmountSign) signedAmountMinor *= -1;
    } catch {
      signedAmountMinor = null;
    }

    return {
      sourceRowNumber: dataStart + rowIndex + 1,
      sourceExternalId: null,
      sourceDateText: sourceDateText.slice(0, 80),
      sourceAmountText: sourceAmountText.slice(0, 80),
      transactionDate,
      description,
      signedAmountMinor,
      validationCode: validationCodeFor(
        transactionDate,
        signedAmountMinor,
        description,
      ),
    };
  });
}

function ofxField(block: string, tag: string) {
  const match = new RegExp(
    `<${tag}>\\s*([^<\\r\\n]+)`,
    "i",
  ).exec(block);
  return match?.[1]?.trim() ?? "";
}

function parseOfxDate(rawValue: string) {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(rawValue.trim());
  return match
    ? buildIsoDate(Number(match[1]), Number(match[2]), Number(match[3]))
    : null;
}

export function parseStructuredOfx(content: string): ParsedImportRow[] {
  const blocks = [
    ...content.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi),
  ];
  if (blocks.length === 0) {
    throw new Error("O arquivo OFX não contém movimentações estruturadas.");
  }

  return blocks.map((match, index) => {
    const block = match[1];
    const sourceDateText = ofxField(block, "DTPOSTED");
    const sourceAmountText = ofxField(block, "TRNAMT");
    const externalId = ofxField(block, "FITID");
    const name = ofxField(block, "NAME");
    const memo = ofxField(block, "MEMO");
    const rawDescription =
      name && memo && normalizeImportDescription(name) !== normalizeImportDescription(memo)
        ? `${name} — ${memo}`
        : name || memo;
    const description = rawDescription
      ? rawDescription.replace(/\s+/g, " ").slice(0, 180)
      : null;
    const transactionDate = parseOfxDate(sourceDateText);
    let signedAmountMinor: number | null = null;
    try {
      signedAmountMinor = parseImportAmountToMinor(sourceAmountText, ".");
    } catch {
      signedAmountMinor = null;
    }

    return {
      sourceRowNumber: index + 1,
      sourceExternalId: externalId ? externalId.slice(0, 180) : null,
      sourceDateText: sourceDateText.slice(0, 80),
      sourceAmountText: sourceAmountText.slice(0, 80),
      transactionDate,
      description,
      signedAmountMinor,
      validationCode: validationCodeFor(
        transactionDate,
        signedAmountMinor,
        description,
      ),
    };
  });
}
