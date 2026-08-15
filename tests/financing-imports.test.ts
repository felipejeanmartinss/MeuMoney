import { describe, expect, it } from "vitest";
import {
  calculateFinancingIndicators,
  FinancingImportError,
  parseSupportedFinancingPdf,
} from "../src/domain/financing-imports";
import type { PdfTextDocument } from "../src/domain/pdf-imports";

const anonymousBradescoFixture: PdfTextDocument = {
  pageCount: 2,
  pages: [
    {
      pageNumber: 1,
      lines: [
        "Extrato Financeiro CONTRATO ABC-1234",
        "Data do contrato 04/10/2021",
        "DADOS CADASTRAIS DADOS FINANCEIROS TAXAS SALDO DEVEDOR R$ 179.770,94",
        "Nome Valor Financiamento Indexador Carteira Nominal(a.a) Nominal(a.m)",
        "CLIENTE ANONIMO 234.000,00 TR SFH-901 7,07% 0,59%",
        "Sistema Amortização CET(a.a) CESH(a.a) Data da liberação Data Emissão",
        "SAC 7,92% 2,57% 22/12/2021 15/08/2026",
        "Prazo 93/360 POUPANCA",
        "BASE ANONIMA 7,30% 0,59% 14/08/2026",
        "ENCARGOS",
        "1 05/11/2021 2.148,06 650,00 1.378,65 1,000000 30,43 18,81 25,00 0,00 0,00 0,00 1,000000 233.350,00 Paga 05/11/2021 2.148,06",
        "2 05/12/2021 2.140,00 650,00 1.370,00 1,000000 30,00 18,00 25,00 0,00 0,00 0,00 1,000000 232.700,00 A Vencer - 0,00",
      ],
    },
    {
      pageNumber: 2,
      lines: [
        "EXTRATO FINANCEIRO CONTRATO ABC-1234 SALDO DEVEDOR ENCARGOS MIP DFI TSA",
        "AMORTIZAÇÃO REDUÇÃO QTDE PRESTAÇÕES",
        "1 26/04/2022 1.310,00 0,00 2",
      ],
    },
  ],
};

function rotatedAnonymousFixture(): PdfTextDocument {
  return {
    pageCount: anonymousBradescoFixture.pageCount,
    pages: anonymousBradescoFixture.pages.map((page) => {
      const items = page.lines.map((text, index) => ({
        text,
        x: 40 + index * 12,
        y: 100,
      }));
      return {
        pageNumber: page.pageNumber,
        lines: [page.lines.join(" ")],
        positionedLines: [
          {
            text: page.lines.join(" "),
            y: 100,
            items,
          },
        ],
      };
    }),
  };
}

describe("financing PDF imports", () => {
  it("parses the supported anonymous Bradesco layout in integer minor units", () => {
    const result = parseSupportedFinancingPdf(anonymousBradescoFixture);

    expect(result.adapter.id).toBe("bradesco-financing-statement-v1");
    expect(result.contract).toMatchObject({
      institution: "Bradesco",
      contractReference: "ABC-1234",
      originalPrincipalMinor: 23_400_000,
      currentBalanceMinor: 17_977_094,
      originalTermMonths: 360,
      contractDate: "2021-10-04",
      balanceDate: "2026-08-14",
    });
    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0]).toMatchObject({
      total_amount_minor: 214_806,
      principal_minor: 65_000,
      interest_minor: 137_865,
      payment_status: "paid",
      payment_date: "2021-11-05",
      source_pages: [1],
    });
    expect(result.schedule[1]).toMatchObject({
      payment_status: "scheduled",
      payment_date: null,
      paid_amount_minor: 0,
    });
    expect(result.extraAmortizations).toEqual([
      expect.objectContaining({
        reduction_type: "term",
        cash_amount_minor: 131_000,
        fgts_amount_minor: 0,
        installments_reduced: 2,
        source_pages: [2],
      }),
    ]);
  });

  it("calculates paid, interest, principal and extraordinary indicators", () => {
    const parsed = parseSupportedFinancingPdf(anonymousBradescoFixture);

    expect(
      calculateFinancingIndicators(parsed.schedule, parsed.extraAmortizations),
    ).toEqual({
      totalPaidMinor: 214_806,
      principalPaidMinor: 65_000,
      interestPaidMinor: 137_865,
      chargesPaidMinor: 7_424,
      extraCashMinor: 131_000,
      extraFgtsMinor: 0,
    });
  });

  it("reconstructs rows when the PDF exposes a rotated coordinate system", () => {
    const result = parseSupportedFinancingPdf(rotatedAnonymousFixture());

    expect(result.contract.contractReference).toBe("ABC-1234");
    expect(result.contract.currentBalanceMinor).toBe(17_977_094);
    expect(result.schedule).toHaveLength(2);
    expect(result.extraAmortizations).toHaveLength(1);
  });

  it("rejects banks and layouts without a representative adapter", () => {
    const unsupported: PdfTextDocument = {
      pageCount: 1,
      pages: [{ pageNumber: 1, lines: ["Extrato de outro banco"] }],
    };

    expect(() => parseSupportedFinancingPdf(unsupported)).toThrowError(
      FinancingImportError,
    );
  });
});
