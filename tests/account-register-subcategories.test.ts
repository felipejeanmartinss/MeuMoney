import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accountRegisterReconciliationSchema,
  buildAccountRegister,
  type AccountRegisterSourceEntry,
} from "../src/domain/account-register";
import {
  getAvailableCategoryParents,
  getCategoryDisplayName,
  type CategoryHierarchyItem,
} from "../src/domain/categories";

const migration = readFileSync(
  resolve(
    "supabase",
    "migrations",
    "20260731000100_account_register_subcategories_reconciliation.sql",
  ),
  "utf8",
);

function entry(
  input: Partial<AccountRegisterSourceEntry> &
    Pick<
      AccountRegisterSourceEntry,
      "id" | "transactionDate" | "direction" | "amountMinor"
    >,
): AccountRegisterSourceEntry {
  return {
    entryType: "transaction",
    transferId: null,
    createdAt: `${input.transactionDate}T12:00:00.000Z`,
    description: input.id,
    detail: "Teste",
    status: "completed",
    isActive: true,
    reconciledAt: null,
    editHref: null,
    ...input,
  };
}

const categories: CategoryHierarchyItem[] = [
  {
    id: "principal",
    group_id: "grupo-pessoal",
    parent_id: null,
    name: "Moradia",
    kind: "expense",
    context: "personal",
    archived_at: null,
  },
  {
    id: "subcategoria",
    group_id: "grupo-pessoal",
    parent_id: "principal",
    name: "Energia",
    kind: "expense",
    context: "personal",
    archived_at: null,
  },
  {
    id: "profissional",
    group_id: "grupo-profissional",
    parent_id: null,
    name: "Escritório",
    kind: "expense",
    context: "professional",
    archived_at: null,
  },
];

describe("account register and subcategories", () => {
  it("orders entries and calculates running realized balance", () => {
    const register = buildAccountRegister(
      [
        entry({
          id: "expense",
          transactionDate: "2026-07-03",
          direction: "expense",
          amountMinor: 2500,
        }),
        entry({
          id: "income",
          transactionDate: "2026-07-01",
          direction: "income",
          amountMinor: 10000,
        }),
        entry({
          id: "pending",
          transactionDate: "2026-07-02",
          direction: "expense",
          amountMinor: 3000,
          status: "pending",
        }),
        entry({
          id: "transfer",
          transactionDate: "2026-07-04",
          direction: "inflow",
          amountMinor: 1500,
          entryType: "transfer_entry",
        }),
      ],
      5000,
    );

    expect(register.map((item) => item.id)).toEqual([
      "income",
      "pending",
      "expense",
      "transfer",
    ]);
    expect(register.map((item) => item.runningBalanceMinor)).toEqual([
      15000, 15000, 12500, 14000,
    ]);
  });

  it("keeps inactive movements visible without changing the balance", () => {
    const [result] = buildAccountRegister(
      [
        entry({
          id: "inactive",
          transactionDate: "2026-07-01",
          direction: "expense",
          amountMinor: 1000,
          isActive: false,
        }),
      ],
      4000,
    );

    expect(result.signedAmountMinor).toBe(-1000);
    expect(result.runningBalanceMinor).toBe(4000);
  });

  it("renders the full category path and restricts eligible parents", () => {
    expect(getCategoryDisplayName(categories[1], categories)).toBe(
      "Moradia › Energia",
    );
    expect(
      getAvailableCategoryParents(categories, {
        groupId: "grupo-pessoal",
        kind: "expense",
        context: "personal",
      }).map((category) => category.id),
    ).toEqual(["principal"]);
  });

  it("enforces one-level ownership-compatible hierarchy in PostgreSQL", () => {
    expect(migration).toContain("create trigger categories_validate_hierarchy");
    expect(migration).toContain("parent_category.user_id <> new.user_id");
    expect(migration).toContain("parent_category.parent_id is not null");
    expect(migration).toContain("grant insert (parent_id)");
    expect(migration).toContain("grant update (parent_id)");
  });

  it("reconciles only owned active completed account entries", () => {
    expect(migration).toContain("add column reconciled_at timestamptz");
    expect(migration).toContain(
      "current_user_id uuid := (select auth.uid())",
    );
    expect(migration).toContain("and user_id = current_user_id");
    expect(migration).toContain("and status = 'completed'");
    expect(migration).toContain(
      "target_entry_type = 'transfer_entry'",
    );
    expect(migration).toContain(
      "transactions_clear_reconciliation_on_financial_change",
    );
  });

  it("keeps the current statement page in reconciliation submissions", () => {
    const parsed = accountRegisterReconciliationSchema.parse({
      accountId: "11111111-1111-4111-8111-111111111111",
      entryType: "transaction",
      entryId: "22222222-2222-4222-8222-222222222222",
      reconciled: "true",
      page: "4",
    });

    expect(parsed.page).toBe(4);
  });
});
