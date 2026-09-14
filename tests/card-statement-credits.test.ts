import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260913165927_card_statement_credits_and_import_cleanup.sql",
  ),
  "utf8",
);
const cardPage = fs.readFileSync(
  path.join(root, "src/app/credit-cards/[id]/page.tsx"),
  "utf8",
);
const accountsPage = fs.readFileSync(
  path.join(root, "src/app/accounts/page.tsx"),
  "utf8",
);
const importsPage = fs.readFileSync(
  path.join(root, "src/app/imports/page.tsx"),
  "utf8",
);
const reportsMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260913235156_flexible_card_dates_and_saved_reports.sql",
  ),
  "utf8",
);

describe("credit-card statement refinements", () => {
  it("supports only purchases, refunds and cashback", () => {
    expect(migration).toContain("'purchase', 'refund', 'cashback'");
    expect(migration).toContain("and installment_count = 1");
    expect(migration).toContain("and not is_recurring");
    expect(migration).toContain("else -installments.amount");
  });

  it("keeps new entries inline and opens installment review only when needed", () => {
    expect(cardPage).toContain("<CreditCardPurchaseForm");
    expect(cardPage).toContain("compact");
    expect(cardPage).toContain("Novo lançamento");
  });

  it("shows next invoice and commitment in the accounts hub", () => {
    expect(accountsPage).toContain("Próxima fatura");
    expect(accountsPage).toContain("card.used_limit");
    expect(accountsPage).not.toContain("Saldo do cartão");
  });

  it("clears the complete import history without deleting confirmed records", () => {
    expect(importsPage).toContain("Limpar histórico");
    expect(migration).toContain("clear_all_import_jobs");
    expect(migration).toContain("delete from public.import_jobs");
  });

  it("adds card credits as income only in competence reports", () => {
    const viewStart = reportsMigration.indexOf(
      "create view public.financial_report_entries_by_source",
    );
    const cardFrom = reportsMigration.indexOf(
      "from public.credit_card_installments installments",
      viewStart,
    );
    const cardEntries = reportsMigration.slice(
      reportsMigration.lastIndexOf("select", cardFrom),
      reportsMigration.indexOf("union all", cardFrom),
    );
    expect(cardEntries).toContain("'competence'::text");
    expect(cardEntries).toContain("'income'::public.transaction_kind");
    expect(cardEntries).toContain("'Créditos de cartão'");
  });
});
