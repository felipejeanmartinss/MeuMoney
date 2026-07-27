import {
  parseImportAmountToMinor,
  parseImportDate,
  type ParsedImportRow,
} from "./file-imports";

export const PDF_IMPORT_ERROR_CODES = [
  "protected",
  "scanned",
  "incompatible",
  "unsupported_layout",
] as const;

export type PdfImportErrorCode = (typeof PDF_IMPORT_ERROR_CODES)[number];

export class PdfImportError extends Error {
  constructor(
    public readonly code: PdfImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfImportError";
  }
}

export type PdfTextPage = {
  pageNumber: number;
  lines: string[];
};

export type PdfTextDocument = {
  pageCount: number;
  pages: PdfTextPage[];
};

export type PdfImportAdapterInfo = {
  id: string;
  bankName: string;
  documentType: string;
  layoutVersion: string;
};

export type PdfImportResult = {
  adapter: PdfImportAdapterInfo;
  rows: ParsedImportRow[];
};

export interface PdfImportAdapter {
  readonly info: PdfImportAdapterInfo;
  detect(document: PdfTextDocument): number;
  parse(document: PdfTextDocument): ParsedImportRow[];
}

const EXAMPLE_BANK_ADAPTER_INFO: PdfImportAdapterInfo = {
  id: "fixture-bank-account-statement-v1",
  bankName: "Banco Exemplo (fixture)",
  documentType: "account_statement",
  layoutVersion: "1",
};

const statementRowPattern =
  /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([+-]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/;

function documentText(document: PdfTextDocument) {
  return document.pages
    .flatMap((page) => page.lines)
    .join("\n")
    .toUpperCase();
}

function validationCodeForPdfRow(
  transactionDate: string | null,
  signedAmountMinor: number | null,
  description: string | null,
) {
  if (!transactionDate) return "invalid_date" as const;
  if (signedAmountMinor === null || signedAmountMinor === 0) {
    return "invalid_amount" as const;
  }
  if (!description) return "missing_description" as const;
  return null;
}

export const fixtureBankStatementAdapter: PdfImportAdapter = {
  info: EXAMPLE_BANK_ADAPTER_INFO,

  detect(document) {
    const text = documentText(document);
    const hasBankMarker = text.includes("BANCO EXEMPLO");
    const hasDocumentMarker = text.includes("EXTRATO DE CONTA");
    const hasColumns =
      text.includes("DATA") &&
      text.includes("DESCRICAO") &&
      text.includes("VALOR");

    if (hasBankMarker && hasDocumentMarker && hasColumns) return 1;
    if (hasBankMarker && hasDocumentMarker) return 0.7;
    return 0;
  },

  parse(document) {
    const rows: ParsedImportRow[] = [];

    for (const page of document.pages) {
      for (const line of page.lines) {
        const match = statementRowPattern.exec(line.trim());
        if (!match) continue;

        const sourceDateText = match[1];
        const originalDescription = match[2].trim();
        const sourceAmountText = match[3];
        const transactionDate = parseImportDate(
          sourceDateText,
          "DD/MM/YYYY",
        );
        let signedAmountMinor: number | null = null;

        try {
          signedAmountMinor = parseImportAmountToMinor(
            sourceAmountText,
            ",",
          );
        } catch {
          signedAmountMinor = null;
        }

        const description =
          originalDescription.replace(/\s+/g, " ").slice(0, 180) || null;

        rows.push({
          sourceRowNumber: rows.length + 1,
          sourceExternalId: null,
          sourceDateText,
          sourceAmountText,
          transactionDate,
          description,
          signedAmountMinor,
          validationCode: validationCodeForPdfRow(
            transactionDate,
            signedAmountMinor,
            description,
          ),
          sourceDescriptionOriginal: originalDescription,
          sourcePages: [page.pageNumber],
          confidence: 0.98,
          sourceAdapterId: EXAMPLE_BANK_ADAPTER_INFO.id,
          sourceDocumentType: EXAMPLE_BANK_ADAPTER_INFO.documentType,
        });
      }
    }

    if (rows.length === 0) {
      throw new PdfImportError(
        "incompatible",
        "O layout foi reconhecido, mas nenhuma movimentação pôde ser lida.",
      );
    }

    return rows;
  },
};

export const PDF_IMPORT_ADAPTERS: readonly PdfImportAdapter[] = [
  fixtureBankStatementAdapter,
];

export function parseSupportedPdf(
  document: PdfTextDocument,
  adapters: readonly PdfImportAdapter[] = PDF_IMPORT_ADAPTERS,
): PdfImportResult {
  const searchableTextLength = document.pages
    .flatMap((page) => page.lines)
    .join("")
    .replace(/\s/g, "").length;

  if (searchableTextLength < 20) {
    throw new PdfImportError(
      "scanned",
      "O PDF não possui texto pesquisável. OCR ainda não está disponível.",
    );
  }

  const matches = adapters
    .map((adapter) => ({ adapter, score: adapter.detect(document) }))
    .sort((left, right) => right.score - left.score);
  const selected = matches[0];

  if (!selected || selected.score < 0.8) {
    throw new PdfImportError(
      "unsupported_layout",
      "O PDF tem texto, mas o banco ou layout ainda não é suportado.",
    );
  }

  return {
    adapter: selected.adapter.info,
    rows: selected.adapter.parse(document),
  };
}
