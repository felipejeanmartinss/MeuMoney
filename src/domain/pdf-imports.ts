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
  positionedLines?: PdfPositionedTextLine[];
};

export type PdfPositionedTextItem = {
  text: string;
  x: number;
  y: number;
};

export type PdfPositionedTextLine = {
  text: string;
  y: number;
  items: PdfPositionedTextItem[];
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

const BRADESCO_ADAPTER_INFO: PdfImportAdapterInfo = {
  id: "bradesco-account-statement-v1",
  bankName: "Bradesco",
  documentType: "account_statement",
  layoutVersion: "1",
};

const NUBANK_ADAPTER_INFO: PdfImportAdapterInfo = {
  id: "nubank-account-statement-v1",
  bankName: "Nubank",
  documentType: "account_statement",
  layoutVersion: "1",
};

const brazilianAmountPattern =
  /^[+-]?(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
const numericDatePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

function foldPdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedPdfDescription(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180) || null;
}

function buildPdfRow(input: {
  rows: ParsedImportRow[];
  info: PdfImportAdapterInfo;
  pageNumber: number;
  sourceDateText: string;
  sourceAmountText: string;
  transactionDate: string | null;
  originalDescription: string;
  signedAmountMinor: number | null;
  confidence: number;
  sourceExternalId?: string | null;
}) {
  const description = normalizedPdfDescription(input.originalDescription);
  input.rows.push({
    sourceRowNumber: input.rows.length + 1,
    sourceExternalId: input.sourceExternalId?.slice(0, 180) ?? null,
    sourceDateText: input.sourceDateText.slice(0, 80),
    sourceAmountText: input.sourceAmountText.slice(0, 80),
    transactionDate: input.transactionDate,
    description,
    signedAmountMinor: input.signedAmountMinor,
    validationCode: validationCodeForPdfRow(
      input.transactionDate,
      input.signedAmountMinor,
      description,
    ),
    sourceDescriptionOriginal:
      input.originalDescription.replace(/\s+/g, " ").trim().slice(0, 1000) ||
      null,
    sourcePages: [input.pageNumber],
    confidence: input.confidence,
    sourceAdapterId: input.info.id,
    sourceDocumentType: input.info.documentType,
  });
}

function bradescoHeaderIsPresent(document: PdfTextDocument) {
  const firstPage = document.pages[0];
  if (!firstPage) return false;
  const headerText = firstPage.lines.slice(0, 12).join("\n");
  const foldedHeader = foldPdfText(headerText);
  const fullText = foldPdfText(documentText(document));
  return (
    firstPage.lines
      .slice(0, 4)
      .some((line) => foldPdfText(line).startsWith("bradesco")) &&
    foldedHeader.includes("extrato") &&
    fullText.includes("data historico") &&
    fullText.includes("credito") &&
    fullText.includes("debito") &&
    fullText.includes("saldo")
  );
}

export const bradescoAccountStatementAdapter: PdfImportAdapter = {
  info: BRADESCO_ADAPTER_INFO,

  detect(document) {
    if (!bradescoHeaderIsPresent(document)) return 0;
    return document.pages.some((page) => page.positionedLines?.length)
      ? 1
      : 0.72;
  },

  parse(document) {
    const rows: ParsedImportRow[] = [];
    let currentDateText = "";
    let currentDate: string | null = null;

    for (const page of document.pages) {
      const lines = page.positionedLines;
      if (!lines) {
        throw new PdfImportError(
          "incompatible",
          "O layout do Bradesco exige um PDF com colunas posicionadas.",
        );
      }

      for (const line of lines) {
        const explicitDate = line.items.find(
          (item) => item.x < 90 && numericDatePattern.test(item.text.trim()),
        );
        if (explicitDate) {
          currentDateText = explicitDate.text.trim();
          currentDate = parseImportDate(currentDateText, "DD/MM/YYYY");
        }

        const amountItems = line.items
          .filter((item) => brazilianAmountPattern.test(item.text.trim()))
          .sort((left, right) => left.x - right.x);
        if (amountItems.length < 2) continue;

        const transactionAmountItem = amountItems.at(-2);
        if (!transactionAmountItem || transactionAmountItem.x >= 500) {
          continue;
        }

        const nearbyDescription = lines
          .filter((candidate) => Math.abs(candidate.y - line.y) <= 8)
          .flatMap((candidate) => candidate.items)
          .filter((item) => item.x >= 90 && item.x < 295)
          .map((item) => item.text.trim())
          .filter(Boolean)
          .join(" ");
        const foldedDescription = foldPdfText(nearbyDescription);
        if (
          !nearbyDescription ||
          foldedDescription.includes("saldo c/") ||
          foldedDescription.startsWith("saldo ")
        ) {
          continue;
        }

        let absoluteAmount: number | null = null;
        try {
          absoluteAmount = Math.abs(
            parseImportAmountToMinor(transactionAmountItem.text, ","),
          );
        } catch {
          absoluteAmount = null;
        }
        const isCreditColumn = transactionAmountItem.x < 440;
        const signedAmountMinor =
          absoluteAmount === null
            ? null
            : isCreditColumn
              ? absoluteAmount
              : -absoluteAmount;
        if (signedAmountMinor === 0) continue;
        const documentItem = line.items.find(
          (item) => item.x >= 295 && item.x < 380,
        );
        const sourceAmountText = `${isCreditColumn ? "" : "-"}${transactionAmountItem.text.trim()}`;

        buildPdfRow({
          rows,
          info: BRADESCO_ADAPTER_INFO,
          pageNumber: page.pageNumber,
          sourceDateText: currentDateText,
          sourceAmountText,
          transactionDate: currentDate,
          originalDescription: nearbyDescription,
          signedAmountMinor,
          confidence: currentDate && nearbyDescription ? 0.97 : 0.75,
          sourceExternalId: documentItem?.text.trim() || null,
        });
      }
    }

    if (rows.length === 0) {
      throw new PdfImportError(
        "incompatible",
        "O extrato do Bradesco foi reconhecido, mas nenhuma movimentação pôde ser lida.",
      );
    }
    return rows;
  },
};

const portugueseMonths: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
};

function parsePortuguesePdfDate(value: string) {
  const folded = foldPdfText(value);
  const match = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s|$)/.exec(folded);
  if (!match) return null;
  const month = portugueseMonths[match[2]];
  if (!month) return null;
  return parseImportDate(
    `${match[1].padStart(2, "0")}/${String(month).padStart(2, "0")}/${match[3]}`,
    "DD/MM/YYYY",
  );
}

function portuguesePdfDateText(value: string) {
  const match = /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})(?:\s|$)/.exec(
    value.trim(),
  );
  return match ? `${match[1]} ${match[2]} ${match[3]}` : value.trim();
}

function textAfterPortuguesePdfDate(value: string) {
  return value
    .trim()
    .replace(/^\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4}\s*/, "")
    .trim();
}

function nubankHeaderIsPresent(document: PdfTextDocument) {
  const text = foldPdfText(documentText(document));
  return (
    text.includes("nubank.com.br") &&
    text.includes("saldo inicial") &&
    text.includes("total de entradas") &&
    text.includes("total de saidas")
  );
}

export const nubankAccountStatementAdapter: PdfImportAdapter = {
  info: NUBANK_ADAPTER_INFO,

  detect(document) {
    if (!nubankHeaderIsPresent(document)) return 0;
    return document.pages.some((page) => page.positionedLines?.length)
      ? 1
      : 0.72;
  },

  parse(document) {
    const rows: ParsedImportRow[] = [];
    let currentDateText = "";
    let currentDate: string | null = null;
    let direction: 1 | -1 | null = null;

    for (const page of document.pages) {
      const lines = page.positionedLines;
      if (!lines) {
        throw new PdfImportError(
          "incompatible",
          "O layout do Nubank exige um PDF com texto posicionado.",
        );
      }

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const dateItem = line.items.find(
          (item) => item.x < 100 && parsePortuguesePdfDate(item.text),
        );
        if (dateItem) {
          currentDateText = portuguesePdfDateText(dateItem.text);
          currentDate = parsePortuguesePdfDate(currentDateText);
        }

        const foldedLine = foldPdfText(line.text);
        if (foldedLine.includes("total de entradas")) {
          direction = 1;
          continue;
        }
        if (foldedLine.includes("total de saidas")) {
          direction = -1;
          continue;
        }
        if (
          foldedLine.includes("saldo inicial") ||
          foldedLine.includes("saldo final") ||
          foldedLine.includes("saldo no periodo")
        ) {
          continue;
        }

        const amountItem = line.items.find(
          (item) =>
            item.x >= 470 && brazilianAmountPattern.test(item.text.trim()),
        );
        const mainDescriptionItems = line.items.filter(
          (item) =>
            item.x >= 100 &&
            item.x < 470 &&
            !brazilianAmountPattern.test(item.text.trim()),
        );
        const datedDescription = dateItem
          ? textAfterPortuguesePdfDate(dateItem.text)
          : "";
        if (
          !amountItem ||
          (mainDescriptionItems.length === 0 && !datedDescription) ||
          !direction
        ) {
          continue;
        }

        const continuationItems: string[] = [];
        for (
          let nextIndex = lineIndex + 1;
          nextIndex < lines.length;
          nextIndex += 1
        ) {
          const candidate = lines[nextIndex];
          if (line.y - candidate.y > 55) break;
          const candidateFolded = foldPdfText(candidate.text);
          const beginsAnotherBlock =
            candidateFolded.includes("total de entradas") ||
            candidateFolded.includes("total de saidas") ||
            candidate.items.some((item) =>
              parsePortuguesePdfDate(item.text),
            ) ||
            candidate.items.some(
              (item) =>
                item.x >= 470 &&
                brazilianAmountPattern.test(item.text.trim()),
            );
          if (beginsAnotherBlock) break;
          continuationItems.push(
            ...candidate.items
              .filter((item) => item.x >= 100 && item.x < 470)
              .map((item) => item.text.trim())
              .filter(Boolean),
          );
        }

        const originalDescription = [
          datedDescription,
          ...mainDescriptionItems.map((item) => item.text.trim()),
          ...continuationItems,
        ]
          .filter(Boolean)
          .join(" ");
        let absoluteAmount: number | null = null;
        try {
          absoluteAmount = Math.abs(
            parseImportAmountToMinor(amountItem.text, ","),
          );
        } catch {
          absoluteAmount = null;
        }
        const signedAmountMinor =
          absoluteAmount === null ? null : direction * absoluteAmount;
        const sourceAmountText = `${direction < 0 ? "-" : ""}${amountItem.text.trim()}`;

        buildPdfRow({
          rows,
          info: NUBANK_ADAPTER_INFO,
          pageNumber: page.pageNumber,
          sourceDateText: currentDateText,
          sourceAmountText,
          transactionDate: currentDate,
          originalDescription,
          signedAmountMinor,
          confidence: currentDate && originalDescription ? 0.96 : 0.72,
        });
      }
    }

    if (rows.length === 0) {
      throw new PdfImportError(
        "incompatible",
        "O extrato do Nubank foi reconhecido, mas nenhuma movimentação pôde ser lida.",
      );
    }
    return rows;
  },
};

export const PDF_IMPORT_ADAPTERS: readonly PdfImportAdapter[] = [
  bradescoAccountStatementAdapter,
  nubankAccountStatementAdapter,
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
