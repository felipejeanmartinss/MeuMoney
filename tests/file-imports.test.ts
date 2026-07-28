import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAtomicImportPlan,
  buildImportSignatureMaterial,
  detectCsvImportConfig,
  markDuplicateSignatures,
  normalizeImportDescription,
  parseConfiguredCsv,
  parseDetectedCsv,
  parseImportAmountToMinor,
  parseImportDate,
  parseStructuredOfx,
} from "../src/domain/file-imports";

const fixture = (name: string) =>
  readFileSync(resolve("tests", "fixtures", "imports", name), "utf8");

describe("file imports", () => {
  it("parses configured CSV values without floating-point money", () => {
    const rows = parseConfiguredCsv(fixture("anonymous-bank.csv"), {
      delimiter: ";",
      hasHeader: true,
      skipRows: 0,
      dateColumn: 1,
      descriptionColumn: 2,
      amountColumn: 3,
      dateFormat: "DD/MM/YYYY",
      decimalSeparator: ",",
      invertAmountSign: false,
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      transactionDate: "2026-01-31",
      signedAmountMinor: 125075,
      description: "Pagamento serviço anônimo",
      validationCode: null,
    });
    expect(rows[1].signedAmountMinor).toBe(-24590);
    expect(rows[2]).toMatchObject({
      transactionDate: null,
      validationCode: "invalid_date",
    });
  });

  it("detects and parses the tested Bradesco CSV layout", () => {
    const content = fixture("anonymous-bradesco-account-statement-v1.csv");
    const detection = detectCsvImportConfig(content);
    const rows = parseConfiguredCsv(content, detection.config);

    expect(detection).toMatchObject({
      presetId: "bradesco-account-statement-v1",
      bankName: "Bradesco",
      confidence: 1,
      config: {
        delimiter: ";",
        dateColumn: 1,
        descriptionColumn: 2,
        amountColumn: 7,
        externalIdColumn: 3,
        decimalSeparator: ",",
      },
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      sourceExternalId: "100001",
      transactionDate: "2026-07-01",
      signedAmountMinor: 125000,
      validationCode: null,
    });
    expect(rows[1].signedAmountMinor).toBe(-24590);
    expect(rows[2].validationCode).toBe("invalid_amount");
    expect(parseDetectedCsv(content).rows).toHaveLength(2);
  });

  it("detects and parses the tested Nubank CSV layout", () => {
    const content = fixture("anonymous-nubank-account-statement-v1.csv");
    const detection = detectCsvImportConfig(content);
    const rows = parseConfiguredCsv(content, detection.config);

    expect(detection).toMatchObject({
      presetId: "nubank-account-statement-v1",
      bankName: "Nubank",
      confidence: 1,
      config: {
        delimiter: ",",
        descriptionColumn: 4,
        amountColumn: 2,
        externalIdColumn: 3,
        decimalSeparator: ".",
      },
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      sourceExternalId: "anon-nu-001",
      signedAmountMinor: 250000,
    });
    expect(rows[1].signedAmountMinor).toBe(-12345);
    expect(rows.every((row) => row.validationCode === null)).toBe(true);
  });

  it("parses valid dates and rejects impossible calendar dates", () => {
    expect(parseImportDate("29/02/2024", "DD/MM/YYYY")).toBe("2024-02-29");
    expect(parseImportDate("29/02/2025", "DD/MM/YYYY")).toBeNull();
    expect(parseImportDate("2026-04-31", "YYYY-MM-DD")).toBeNull();
    expect(parseImportDate("12/31/2026", "MM/DD/YYYY")).toBe("2026-12-31");
  });

  it("supports decimal comma, decimal point and accounting negatives", () => {
    expect(parseImportAmountToMinor("R$ 1.234,56", ",")).toBe(123456);
    expect(parseImportAmountToMinor("1,234.56", ".")).toBe(123456);
    expect(parseImportAmountToMinor("(98.70)", ".")).toBe(-9870);
    expect(parseImportAmountToMinor("1,234", ".")).toBe(123400);
  });

  it("parses structured OFX transaction blocks", () => {
    const rows = parseStructuredOfx(fixture("anonymous-bank.ofx"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceExternalId: "ANON-001",
      transactionDate: "2026-02-28",
      signedAmountMinor: -12345,
      description: "Estabelecimento exemplo — Compra anônima",
    });
    expect(rows[1]).toMatchObject({
      sourceExternalId: "ANON-002",
      transactionDate: "2026-03-01",
      signedAmountMinor: 250000,
    });
  });

  it("builds a stable signature material from normalized financial fields", () => {
    const material = buildImportSignatureMaterial({
      userId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      transactionDate: "2026-02-28",
      signedAmountMinor: -12345,
      description: "  Mercado   EXEMPLO ",
    });
    const signature = createHash("sha256").update(material).digest("hex");

    expect(normalizeImportDescription("  Mercado   EXEMPLO ")).toBe(
      "mercado exemplo",
    );
    expect(material).toBe(
      "11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|2026-02-28|-12345|mercado exemplo",
    );
    expect(signature).toHaveLength(64);
  });

  it("marks duplicates against history and inside the same upload", () => {
    expect(
      markDuplicateSignatures(
        ["signature-a", "signature-b", "signature-a", null],
        new Set(["signature-b"]),
      ),
    ).toEqual([false, true, true, false]);
  });

  it("builds an idempotent confirmation plan", () => {
    const candidates = [
      {
        id: "row-a",
        signature: "signature-a",
        status: "valid" as const,
        isSelected: true,
      },
      {
        id: "row-b",
        signature: "signature-b",
        status: "ignored" as const,
        isSelected: false,
      },
    ];
    const firstPlan = buildAtomicImportPlan(candidates);
    const secondPlan = buildAtomicImportPlan(candidates);
    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan).toHaveLength(1);
  });

  it("fails the plan before any mutation when one selected row is invalid", () => {
    const candidates = [
      {
        id: "row-ready",
        signature: "signature-a",
        status: "valid" as const,
        isSelected: true,
      },
      {
        id: "row-invalid",
        signature: null,
        status: "error" as const,
        isSelected: true,
      },
    ];
    const snapshot = structuredClone(candidates);

    expect(() => buildAtomicImportPlan(candidates)).toThrow(
      "contains an invalid row",
    );
    expect(candidates).toEqual(snapshot);
  });

  it("scopes cancelled import cleanup to the authenticated owner", () => {
    const migration = readFileSync(
      resolve(
        "supabase",
        "migrations",
        "20260728190232_cleanup_cancelled_imports.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "current_user_id uuid := (select auth.uid());",
    );
    expect(migration).toMatch(
      /delete from public\.import_jobs\s+where user_id = current_user_id\s+and status = 'cancelled';/,
    );
    expect(migration).toContain(
      "revoke all on function public.clear_cancelled_import_jobs()",
    );
    expect(migration).toContain(
      "grant execute on function public.clear_cancelled_import_jobs()",
    );
    expect(migration).not.toContain(
      "grant delete on table public.import_jobs",
    );
  });
});
