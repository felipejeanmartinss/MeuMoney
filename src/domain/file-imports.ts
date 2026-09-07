import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { parseMoneyInputToMinor } from "./money";

export const IMPORT_FILE_TYPES = ["csv", "ofx", "qif", "pdf"] as const;
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
  amountColumn?: number | null;
  creditColumn?: number | null;
  debitColumn?: number | null;
  externalIdColumn?: number | null;
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
  invertAmountSign: boolean;
};

export type CsvImportDetection = {
  presetId: string;
  bankName: string | null;
  confidence: number;
  config: CsvImportConfig;
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
  recordKind?: "transaction" | "transfer";
  sourceCategoryName?: string | null;
  transferAccountName?: string | null;
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
  amountColumn: columnNumber.nullable().optional(),
  creditColumn: columnNumber.nullable().optional(),
  debitColumn: columnNumber.nullable().optional(),
  externalIdColumn: columnNumber.nullable().optional(),
  dateFormat: z.enum(CSV_DATE_FORMATS, {
    error: "Selecione o formato da data.",
  }),
  decimalSeparator: z.enum(CSV_DECIMAL_SEPARATORS, {
    error: "Selecione o separador decimal.",
  }),
  invertAmountSign: z.boolean(),
}).superRefine((value, context) => {
  const hasSingleAmount = Boolean(value.amountColumn);
  const hasCreditAndDebit = Boolean(value.creditColumn && value.debitColumn);
  if (!hasSingleAmount && !hasCreditAndDebit) {
    context.addIssue({
      code: "custom",
      path: ["amountColumn"],
      message: "Informe a coluna do valor ou as colunas de crédito e débito.",
    });
  }
});

export const importFileTypeSchema = z.enum(IMPORT_FILE_TYPES, {
  error: "Selecione CSV, OFX, QIF ou PDF.",
});

export const importJobIdSchema = z.uuid("Importação inválida.");
export const importRowIdSchema = z.uuid("Linha de importação inválida.");

export const importTargetSchema = z
  .string()
  .trim()
  .regex(
    /^(account|credit-card):[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Selecione uma conta ou cartão válido.",
  )
  .transform((value) => {
    const [kind, id] = value.split(":") as [
      "account" | "credit-card",
      string,
    ];
    return { kind, id };
  });

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

export const importTransferRowCorrectionSchema = z.object({
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
  transferAccountId: z.uuid("Selecione a outra conta da transferência."),
});

const importClassificationSelectionSchema = z
  .string()
  .trim()
  .regex(
    /^(category|transfer|credit-card):[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Selecione uma categoria, conta ou cartão válido.",
  )
  .transform((value) => {
    const [kind, id] = value.split(":") as [
      "category" | "transfer" | "credit-card",
      string,
    ];
    return { kind, id };
  });

export const importClassificationCorrectionSchema = z.object({
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
  classification: importClassificationSelectionSchema,
});

export const qifCategoryMappingSchema = z.object({
  jobId: importJobIdSchema,
  sourceCategoryName: z.string().trim().min(1).max(180),
  transactionType: z.enum(["income", "expense"]),
  categoryId: z.uuid("Selecione uma categoria válida."),
});

export const qifTransferAccountMappingSchema = z.object({
  jobId: importJobIdSchema,
  sourceAccountName: z.string().trim().min(1).max(180),
  accountId: z.uuid("Selecione uma conta válida."),
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
  const amountIndex = config.amountColumn ? config.amountColumn - 1 : null;
  const creditIndex = config.creditColumn ? config.creditColumn - 1 : null;
  const debitIndex = config.debitColumn ? config.debitColumn - 1 : null;
  const externalIdIndex = config.externalIdColumn
    ? config.externalIdColumn - 1
    : null;

  return dataRows.map((columns, rowIndex) => {
    const sourceDateText = columns[dateIndex]?.trim() ?? "";
    const rawAmount = amountIndex === null ? "" : columns[amountIndex]?.trim() ?? "";
    const rawCredit = creditIndex === null ? "" : columns[creditIndex]?.trim() ?? "";
    const rawDebit = debitIndex === null ? "" : columns[debitIndex]?.trim() ?? "";
    const sourceAmountText = rawAmount || rawCredit || rawDebit;
    const rawDescription = columns[descriptionIndex]?.trim() ?? "";
    const rawExternalId =
      externalIdIndex === null ? "" : columns[externalIdIndex]?.trim() ?? "";
    const description = rawDescription
      ? rawDescription.replace(/\s+/g, " ").slice(0, 180)
      : null;
    const transactionDate = parseImportDate(
      sourceDateText,
      config.dateFormat,
    );
    let signedAmountMinor: number | null = null;
    try {
      if (amountIndex !== null) {
        signedAmountMinor = parseImportAmountToMinor(
          rawAmount,
          config.decimalSeparator,
        );
      } else if (rawCredit && !rawDebit) {
        signedAmountMinor = Math.abs(
          parseImportAmountToMinor(rawCredit, config.decimalSeparator),
        );
      } else if (rawDebit && !rawCredit) {
        signedAmountMinor = -Math.abs(
          parseImportAmountToMinor(rawDebit, config.decimalSeparator),
        );
      } else {
        throw new Error("Informe apenas crédito ou débito.");
      }
      if (config.invertAmountSign) signedAmountMinor *= -1;
    } catch {
      signedAmountMinor = null;
    }

    return {
      sourceRowNumber: dataStart + rowIndex + 1,
      sourceExternalId: rawExternalId
        ? rawExternalId.slice(0, 180)
        : null,
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

function normalizeCsvHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const HEADER_ALIASES = new Set([
  "data",
  "date",
  "historico",
  "descricao",
  "lancamento",
  "memo",
  "valor",
  "amount",
  "credito",
  "debito",
  "saldo",
  "docto",
  "documento",
  "identificador",
]);

function bestDelimitedRows(content: string) {
  const candidates = CSV_DELIMITERS.flatMap((delimiter) => {
    try {
      const rows = parseDelimitedText(content.replace(/^\uFEFF/, ""), delimiter);
      if (rows.length < 2) return [];

      return rows
        .slice(0, 20)
        .flatMap((row, headerIndex) => {
          if (row.length < 2) return [];
          const normalized = row.map(normalizeCsvHeader);
          const headerMatches = normalized.filter((header) =>
            HEADER_ALIASES.has(header),
          ).length;
          const hasDate = normalized.includes("data") || normalized.includes("date");
          const hasDescription = normalized.some((header) =>
            ["historico", "descricao", "lancamento", "memo"].includes(header),
          );
          const hasAmount = normalized.some((header) =>
            ["valor", "amount"].includes(header),
          ) || (normalized.includes("credito") && normalized.includes("debito"));
          if (!hasDate || !hasDescription || !hasAmount) return [];

          const expectedColumns = row.length;
          const sample = rows.slice(headerIndex + 1, headerIndex + 21);
          const consistentRows = sample.filter(
            (candidateRow) => candidateRow.length === expectedColumns,
          ).length;
          return [{
            delimiter,
            rows,
            headerIndex,
            score:
              headerMatches * 2 +
              (sample.length ? consistentRows / sample.length : 0) +
              expectedColumns / 100,
          }];
        });
    } catch {
      return [];
    }
  });

  return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
}

function inferCsvDateFormat(values: string[]): CsvDateFormat {
  if (values.some((value) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(value.trim()))) {
    return "YYYY-MM-DD";
  }
  return "DD/MM/YYYY";
}

function inferCsvDecimalSeparator(values: string[]): CsvDecimalSeparator {
  const commaScore = values.filter((value) =>
    /,\d{2}\s*$/.test(value.trim()),
  ).length;
  const dotScore = values.filter((value) =>
    /\.\d{2}\s*$/.test(value.trim()),
  ).length;
  return commaScore >= dotScore ? "," : ".";
}

function headerColumn(
  headers: string[],
  aliases: readonly string[],
): number | null {
  const index = headers.findIndex((header) => aliases.includes(header));
  return index === -1 ? null : index + 1;
}

export function detectCsvImportConfig(content: string): CsvImportDetection {
  const candidate = bestDelimitedRows(content);
  if (!candidate) {
    throw new Error("Não foi possível identificar as colunas deste CSV.");
  }

  const headers = candidate.rows[candidate.headerIndex].map(normalizeCsvHeader);
  const dataRows = candidate.rows.slice(candidate.headerIndex + 1, candidate.headerIndex + 21);
  const isBradescoStatement =
    headers.includes("data") &&
    headers.includes("historico") &&
    headers.includes("docto") &&
    headers.includes("credito") &&
    headers.includes("debito") &&
    headers.includes("saldo") &&
    (headers.includes("valor") ||
      (headers.includes("credito") && headers.includes("debito")));
  const isNubankStatement =
    headers.length === 4 &&
    headers.includes("data") &&
    headers.includes("valor") &&
    headers.includes("identificador") &&
    headers.includes("descricao");

  if (isBradescoStatement) {
    return {
      presetId: "bradesco-account-statement-v1",
      bankName: "Bradesco",
      confidence: 1,
      config: {
        delimiter: candidate.delimiter,
        hasHeader: true,
        skipRows: candidate.headerIndex,
        dateColumn: headers.indexOf("data") + 1,
        descriptionColumn: headers.indexOf("historico") + 1,
        amountColumn: headers.includes("valor")
          ? headers.indexOf("valor") + 1
          : null,
        creditColumn: headers.includes("credito")
          ? headers.indexOf("credito") + 1
          : null,
        debitColumn: headers.includes("debito")
          ? headers.indexOf("debito") + 1
          : null,
        externalIdColumn: headers.indexOf("docto") + 1,
        dateFormat: "DD/MM/YYYY",
        decimalSeparator: ",",
        invertAmountSign: false,
      },
    };
  }

  if (isNubankStatement) {
    return {
      presetId: "nubank-account-statement-v1",
      bankName: "Nubank",
      confidence: 1,
      config: {
        delimiter: candidate.delimiter,
        hasHeader: true,
        skipRows: candidate.headerIndex,
        dateColumn: headers.indexOf("data") + 1,
        descriptionColumn: headers.indexOf("descricao") + 1,
        amountColumn: headers.indexOf("valor") + 1,
        externalIdColumn: headers.indexOf("identificador") + 1,
        dateFormat: "DD/MM/YYYY",
        decimalSeparator: ".",
        invertAmountSign: false,
      },
    };
  }

  const dateColumn = headerColumn(headers, [
    "data",
    "date",
    "data lancamento",
    "data da transacao",
  ]);
  const descriptionColumn = headerColumn(headers, [
    "descricao",
    "historico",
    "memo",
    "lancamento",
    "detalhes",
  ]);
  const amountColumn = headerColumn(headers, [
    "valor",
    "amount",
    "quantia",
  ]);
  const externalIdColumn = headerColumn(headers, [
    "identificador",
    "fitid",
    "id",
    "documento",
    "docto",
  ]);

  if (!dateColumn || !descriptionColumn || !amountColumn) {
    throw new Error(
      "Não foi possível identificar data, descrição e valor neste CSV.",
    );
  }

  const dateValues = dataRows.map((row) => row[dateColumn - 1] ?? "");
  const amountValues = dataRows.map((row) => row[amountColumn - 1] ?? "");
  const config: CsvImportConfig = {
    delimiter: candidate.delimiter,
    hasHeader: true,
    skipRows: candidate.headerIndex,
    dateColumn,
    descriptionColumn,
    amountColumn,
    externalIdColumn,
    dateFormat: inferCsvDateFormat(dateValues),
    decimalSeparator: inferCsvDecimalSeparator(amountValues),
    invertAmountSign: false,
  };
  const parsed = parseConfiguredCsv(content, config);
  const validRatio =
    parsed.length === 0
      ? 0
      : parsed.filter((row) => row.validationCode === null).length /
        parsed.length;

  if (validRatio < 0.6) {
    throw new Error(
      "O layout foi reconhecido, mas os valores precisam de configuração manual.",
    );
  }

  return {
    presetId: "generic-header-v1",
    bankName: null,
    confidence: Math.min(0.95, 0.7 + validRatio * 0.25),
    config,
  };
}

export function parseDetectedCsv(content: string) {
  const detection = detectCsvImportConfig(content);
  const parsedRows = parseConfiguredCsv(content, detection.config);
  let usableRows = parsedRows;

  if (detection.presetId === "bradesco-account-statement-v1") {
    let validMovements = 0;
    let consecutiveInvalidRows = 0;
    for (let index = 0; index < parsedRows.length; index += 1) {
      const row = parsedRows[index];
      if (row.validationCode === null && row.signedAmountMinor !== 0) {
        validMovements += 1;
        consecutiveInvalidRows = 0;
        continue;
      }
      if (row.validationCode !== null) consecutiveInvalidRows += 1;
      if (validMovements > 0 && consecutiveInvalidRows >= 2) {
        usableRows = parsedRows.slice(0, index - 1);
        break;
      }
    }
  }

  return {
    detection,
    rows: usableRows.filter(
      (row) => row.signedAmountMinor !== 0,
    ),
  };
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

type QifDateOrder = "DMY" | "MDY";

function qifDateOrder(records: Map<string, string[]>[]): QifDateOrder {
  for (const record of records) {
    const value = record.get("D")?.[0]?.trim() ?? "";
    const match = /^(\d{1,2})\s*[/-]\s*(\d{1,2})/.exec(value);
    if (!match) continue;
    if (Number(match[1]) > 12) return "DMY";
    if (Number(match[2]) > 12) return "MDY";
  }
  return "DMY";
}

function parseQifDate(rawValue: string, order: QifDateOrder) {
  const match =
    /^(\d{1,2})\s*[/-]\s*(\d{1,2})\s*(?:['/-])\s*(\d{4}|\d{2})/.exec(
      rawValue.trim(),
    );
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const rawYear = Number(match[3]);
  const year =
    match[3].length === 2
      ? rawYear >= 70
        ? 1900 + rawYear
        : 2000 + rawYear
      : rawYear;
  return buildIsoDate(
    year,
    order === "DMY" ? second : first,
    order === "DMY" ? first : second,
  );
}

function qifDecimalSeparator(value: string): CsvDecimalSeparator {
  const comma = value.lastIndexOf(",");
  const dot = value.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) return comma > dot ? "," : ".";
  if (comma >= 0 && /,\d{1,2}\s*$/.test(value)) return ",";
  return ".";
}

function qifDescription(record: Map<string, string[]>) {
  const descriptiveFields = [record.get("P")?.[0], record.get("M")?.[0]];
  const values = descriptiveFields.some((value) => value?.trim())
    ? descriptiveFields
    : [record.get("N")?.[0]];
  const parts = values
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .filter(
      (value, index, values) =>
        values.findIndex(
          (candidate) =>
            normalizeImportDescription(candidate) ===
            normalizeImportDescription(value),
        ) === index,
    );
  return parts.length > 0
    ? parts.join(" — ").replace(/\s+/g, " ").slice(0, 180)
    : null;
}

function qifTransferAccount(value: string) {
  const match = /^\[([^\]]+)\](?:\/.*)?$/.exec(value.trim());
  return match?.[1]?.trim().slice(0, 180) || null;
}

/**
 * Parses account transaction sections exported by Microsoft Money and other
 * QIF producers. Split transactions stay visible as unsupported in staging
 * instead of being silently flattened.
 */
export function parseStructuredQif(content: string): ParsedImportRow[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const records: Map<string, string[]>[] = [];
  let currentType: string | null = null;
  let current = new Map<string, string[]>();

  const finishRecord = () => {
    if (current.size > 0) records.push(current);
    current = new Map<string, string[]>();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith("!Type:")) {
      finishRecord();
      currentType = line.slice("!Type:".length).trim().toLowerCase();
      continue;
    }
    if (line.startsWith("!")) {
      finishRecord();
      currentType = null;
      continue;
    }
    if (line === "^") {
      finishRecord();
      continue;
    }
    if (!currentType || !["bank", "cash", "ccard"].includes(currentType)) {
      continue;
    }

    const field = line[0];
    const value = line.slice(1);
    current.set(field, [...(current.get(field) ?? []), value]);
  }
  finishRecord();

  if (records.length === 0) {
    throw new Error(
      "O arquivo QIF não contém movimentações de conta compatíveis.",
    );
  }

  const dateOrder = qifDateOrder(records);
  return records.map((record, index) => {
    const sourceDateText = record.get("D")?.[0]?.trim() ?? "";
    const sourceAmountText = record.get("T")?.[0]?.trim() ?? "";
    const sourceCategoryName = record.get("L")?.[0]?.trim().slice(0, 180) ?? "";
    const transferAccountName = qifTransferAccount(sourceCategoryName);
    const description = qifDescription(record);
    const transactionDate = parseQifDate(sourceDateText, dateOrder);
    const hasSplitFields = ["S", "E", "$"].some((field) => record.has(field));
    let signedAmountMinor: number | null = null;
    try {
      signedAmountMinor = parseImportAmountToMinor(
        sourceAmountText,
        qifDecimalSeparator(sourceAmountText),
      );
      // Money exports balance/opening markers with T0.00. Staging rejects
      // persisted zero amounts, so keep the row reviewable as invalid instead.
      if (signedAmountMinor === 0) signedAmountMinor = null;
    } catch {
      signedAmountMinor = null;
    }

    return {
      sourceRowNumber: index + 1,
      sourceExternalId: record.get("N")?.[0]?.trim().slice(0, 180) || null,
      sourceDateText: sourceDateText.slice(0, 80),
      sourceAmountText: sourceAmountText.slice(0, 80),
      transactionDate,
      description,
      signedAmountMinor,
      validationCode: hasSplitFields
        ? "unsupported_record"
        : validationCodeFor(
            transactionDate,
            signedAmountMinor,
            description,
          ),
      sourceDescriptionOriginal: description,
      recordKind: transferAccountName ? "transfer" : "transaction",
      sourceCategoryName: transferAccountName
        ? null
        : sourceCategoryName || null,
      transferAccountName,
    };
  });
}
