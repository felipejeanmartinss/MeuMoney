import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260815160729_card_account_transfers.sql",
  ),
  "utf8",
);

describe("account-to-credit-card transfer migration", () => {
  it("requires exactly one destination and validates card ownership in the RPC", () => {
    expect(migration).toContain("transfers_exactly_one_destination");
    expect(migration).toContain("destination_credit_card_id uuid");
    expect(migration).toContain("and user_id = current_user_id");
    expect(migration).toContain("and is_active");
    expect(migration).toContain("transfer_currency_mismatch");
  });

  it("creates only the account outflow for a card payment", () => {
    const cardTransferFunction = migration.slice(
      migration.indexOf("create or replace function private.create_credit_card_transfer"),
      migration.indexOf("create or replace function private.update_credit_card_transfer"),
    );

    expect(cardTransferFunction).toContain("'outflow'");
    expect(cardTransferFunction).not.toContain("'inflow'");
  });

  it("deducts completed active card transfers from the card balance", () => {
    expect(migration).toContain("as current_balance_minor");
    expect(migration).toContain("transfers.destination_credit_card_id = cards.id");
    expect(migration).toContain("transfers.status = 'completed'");
    expect(migration).toContain("and transfers.is_active");
  });

  it("recognizes card transfers only in the cash reporting branch", () => {
    const monthlyView = migration.slice(
      migration.indexOf(
        "create or replace view public.financial_dashboard_monthly_basis",
      ),
      migration.indexOf(
        "create or replace view public.financial_dashboard_expense_categories_basis",
      ),
    );
    const competenceExpense = monthlyView.slice(
      monthlyView.indexOf("competence_expense as"),
      monthlyView.indexOf("cash_expense_components as"),
    );
    const cashExpense = monthlyView.slice(
      monthlyView.indexOf("cash_expense_components as"),
      monthlyView.indexOf("monthly_plan as"),
    );

    expect(migration).toContain("'competence'::text as basis");
    expect(migration).toContain("'cash'::text");
    expect(migration).toContain("'Pagamentos de cartões'::text");
    expect(competenceExpense).not.toContain("destination_credit_card_id");
    expect(cashExpense).toContain("destination_credit_card_id is not null");
  });

  it("keeps privileged functions behind authenticated public façades", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });
});
