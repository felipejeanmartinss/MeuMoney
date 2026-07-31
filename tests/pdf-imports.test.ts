import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSupportedPdf,
  PdfImportError,
  type PdfTextDocument,
} from "../src/domain/pdf-imports";
import {
  classifyPdfExtractionError,
  extractSearchablePdfText,
} from "../src/services/finance/pdf-text-extractor";

const pdfFixture = (name: string) =>
  new Uint8Array(
    readFileSync(resolve("tests", "fixtures", "imports", name)),
  );

describe("PDF imports", () => {
  it("extracts and parses the supported anonymous statement layout", async () => {
    const document = await extractSearchablePdfText(
      pdfFixture("anonymous-fixture-bank-statement-v1.pdf"),
    );
    const result = parseSupportedPdf(document);

    expect(document.pageCount).toBe(2);
    expect(result.adapter).toEqual({
      id: "fixture-bank-account-statement-v1",
      bankName: "Banco Exemplo (fixture)",
      documentType: "account_statement",
      layoutVersion: "1",
    });
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      sourceRowNumber: 1,
      transactionDate: "2026-03-01",
      description: "MERCADO EXEMPLO",
      sourceDescriptionOriginal: "MERCADO EXEMPLO",
      signedAmountMinor: -12345,
      sourcePages: [1],
      confidence: 0.98,
      validationCode: null,
    });
    expect(result.rows[1]).toMatchObject({
      signedAmountMinor: 125000,
      sourcePages: [1],
    });
    expect(result.rows[2]).toMatchObject({
      transactionDate: "2026-03-03",
      signedAmountMinor: -1590,
      sourcePages: [2],
    });
  });

  it("keeps the layout regression stable across pages", async () => {
    const result = parseSupportedPdf(
      await extractSearchablePdfText(
        pdfFixture("anonymous-fixture-bank-statement-v1.pdf"),
      ),
    );

    expect(
      result.rows.map((row) => [
        row.transactionDate,
        row.sourceDescriptionOriginal,
        row.signedAmountMinor,
        row.sourcePages,
      ]),
    ).toEqual([
      ["2026-03-01", "MERCADO EXEMPLO", -12345, [1]],
      ["2026-03-02", "PAGAMENTO CLIENTE", 125000, [1]],
      ["2026-03-03", "TARIFA EXEMPLO", -1590, [2]],
    ]);
  });

  it("parses the tested Bradesco statement columns without importing balances", async () => {
    const result = parseSupportedPdf(
      await extractSearchablePdfText(
        pdfFixture("anonymous-bradesco-account-statement-v1.pdf"),
      ),
    );

    expect(result.adapter).toMatchObject({
      id: "bradesco-account-statement-v1",
      bankName: "Bradesco",
      layoutVersion: "1",
    });
    expect(
      result.rows.map((row) => ({
        date: row.transactionDate,
        description: row.description,
        amount: row.signedAmountMinor,
        externalId: row.sourceExternalId,
      })),
    ).toEqual([
      {
        date: "2026-07-01",
        description: "TRANSFERENCIA RECEBIDA",
        amount: 125000,
        externalId: "100001",
      },
      {
        date: "2026-07-02",
        description: "PAGAMENTO DE CONTA",
        amount: -24590,
        externalId: "100002",
      },
    ]);
  });

  it("parses Nubank entries and exits using the current section direction", async () => {
    const result = parseSupportedPdf(
      await extractSearchablePdfText(
        pdfFixture("anonymous-nubank-account-statement-v1.pdf"),
      ),
    );

    expect(result.adapter).toMatchObject({
      id: "nubank-account-statement-v1",
      bankName: "Nubank",
      layoutVersion: "1",
    });
    expect(
      result.rows.map((row) => [
        row.transactionDate,
        row.description,
        row.signedAmountMinor,
        row.sourcePages,
      ]),
    ).toEqual([
      ["2026-07-01", "PIX RECEBIDO", 125000, [1]],
      [
        "2026-07-01",
        "TRANSFERENCIA ENVIADA VIA PIX DESTINATARIO ANONIMO",
        -9870,
        [1],
      ],
      ["2026-07-02", "TRANSFERENCIA RECEBIDA", 30000, [2]],
      ["2026-07-02", "PAGAMENTO DE BOLETO", -7590, [2]],
    ]);
  });

  it("rejects a PDF without searchable text as scanned", async () => {
    const document = await extractSearchablePdfText(
      pdfFixture("anonymous-scanned-placeholder.pdf"),
    );

    expect(() => parseSupportedPdf(document)).toThrowError(
      expect.objectContaining({ code: "scanned" }),
    );
  });

  it("rejects a searchable PDF with an unsupported layout", () => {
    const document: PdfTextDocument = {
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          lines: [
            "OUTRO DOCUMENTO FINANCEIRO COM TEXTO PESQUISAVEL",
            "SEM LAYOUT CADASTRADO",
          ],
        },
      ],
    };

    expect(() => parseSupportedPdf(document)).toThrowError(
      expect.objectContaining({ code: "unsupported_layout" }),
    );
  });

  it("returns a friendly incompatibility error for an invalid PDF", async () => {
    await expect(
      extractSearchablePdfText(pdfFixture("anonymous-incompatible.pdf")),
    ).rejects.toMatchObject({
      name: "PdfImportError",
      code: "incompatible",
    });
  });

  it("classifies password challenges without requesting or logging a password", () => {
    const error = classifyPdfExtractionError({
      name: "PasswordException",
      message: "No password given",
    });

    expect(error).toBeInstanceOf(PdfImportError);
    expect(error).toMatchObject({ code: "protected" });
    expect(error.message).toContain("protegido por senha");
  });
});
