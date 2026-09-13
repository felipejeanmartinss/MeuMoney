import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateFinancingIndicators,
  FinancingImportError,
  manualFinancingContractSchema,
  parseSupportedFinancingPdf,
  simulateFinancing,
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

  it("ships the staging tables and authenticated RPC required by the preview", () => {
    const migration = readFileSync(
      resolve(
        "supabase",
        "migrations",
        "20260815135005_card_cash_financing_imports.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("create table public.financing_import_jobs");
    expect(migration).toContain(
      "create table public.financing_import_schedule_rows",
    );
    expect(migration).toContain(
      "create or replace function public.create_financing_import_job",
    );
    expect(migration).toContain("grant execute on function public.create_financing_import_job");

    const indexes = readFileSync(
      resolve(
        "supabase",
        "migrations",
        "20260815161500_card_financing_fk_indexes.sql",
      ),
      "utf8",
    );
    expect(indexes).toContain("financing_contracts_net_worth_owner_fk_idx");
    expect(indexes).toContain("financing_schedule_contract_owner_fk_idx");
  });

  it("validates a manual financing history using integer minor units", () => {
    const parsed = manualFinancingContractSchema.parse({
      name: "Imóvel",
      institution: "Bradesco",
      contractReference: "ABC-1234",
      productType: "financing",
      context: "personal",
      currency: "BRL",
      amortizationSystem: "SAC",
      indexer: "TR",
      originalPrincipalMinor: "234.000,00",
      originalTermMonths: "360",
      contractDate: "2021-10-04",
      releaseDate: "2021-12-22",
      currentBalanceMinor: "179.770,94",
      balanceDate: "2026-08-14",
      nominalAnnualRate: "7,07",
      effectiveAnnualRate: "7,30",
      cetAnnualRate: "7,92",
      schedule: JSON.stringify([
        {
          installmentNumber: "1",
          dueDate: "2021-11-05",
          totalAmountMinor: "2.148,06",
          principalMinor: "650,00",
          interestMinor: "1.378,65",
          correctionFactor: "1,000000",
          chargesMinor: "119,41",
          outstandingBalanceMinor: "233.350,00",
          paymentStatus: "paid",
          paymentDate: "2021-11-05",
          paidAmountMinor: "2.148,06",
        },
      ]),
    });

    expect(parsed.originalPrincipalMinor).toBe(23_400_000);
    expect(parsed.currentBalanceMinor).toBe(17_977_094);
    expect(parsed.schedule[0]).toMatchObject({
      principalMinor: 65_000,
      interestMinor: 137_865,
      chargesMinor: 11_941,
      correctionFactor: "1.000000",
    });
  });

  it("ships an authenticated RPC for atomic manual financing creation", () => {
    const migration = readFileSync(
      resolve(
        "supabase",
        "migrations",
        "20260912214419_card_commitment_and_manual_financing.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "create or replace function public.create_manual_financing_contract",
    );
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain(
      "grant execute on function public.create_manual_financing_contract",
    );
  });

  it("keeps the native PDF canvas runtime in the production server bundle", () => {
    const nextConfig = readFileSync(resolve("next.config.ts"), "utf8");
    const extractor = readFileSync(
      resolve("src", "services", "finance", "pdf-text-extractor.ts"),
      "utf8",
    );

    expect(nextConfig).toContain('"@napi-rs/canvas"');
    expect(nextConfig).toContain('"pdfjs-dist"');
    expect(extractor).toContain('import("@napi-rs/canvas")');
  });

  it("simulates SAC with a decreasing balance and optional extra amortization", () => {
    const result = simulateFinancing({
      principalMinor: 120_000,
      annualRatePercent: 12,
      termMonths: 12,
      method: "sac",
      extraAmortizationMinor: 10_000,
      extraAmortizationMode: "term",
    });

    expect(result.rows.length).toBeLessThan(12);
    expect(result.rows[0].interestMinor).toBeGreaterThan(
      result.rows.at(-1)?.interestMinor ?? 0,
    );
    expect(result.rows.at(-1)?.balanceMinor).toBe(0);
    expect(result.totalExtraAmortizationMinor).toBeGreaterThan(0);
    expect(result.totalPrincipalMinor).toBe(120_000);
  });

  it("simulates PRICE with stable payments when no extra is applied", () => {
    const result = simulateFinancing({
      principalMinor: 100_000,
      annualRatePercent: 12,
      termMonths: 12,
      method: "price",
    });

    expect(result.rows).toHaveLength(12);
    expect(result.rows[0].paymentMinor).toBe(result.rows[1].paymentMinor);
    expect(result.rows.at(-1)?.balanceMinor).toBe(0);
    expect(result.totalPrincipalMinor).toBe(100_000);
  });
});
