import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAvailableCategoryParents,
  getCategoryQualifiedName,
  type CategoryGroupItem,
  type CategoryHierarchyItem,
} from "../src/domain/categories";
import {
  getInvestmentFamily,
  investmentPositionFormSchema,
} from "../src/domain/investments";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260802030024_account_centric_finance_ux.sql",
  ),
  "utf8",
);

const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherGroupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const groups: CategoryGroupItem[] = [
  {
    id: groupId,
    name: "Custos fixos",
    kind: "expense",
    context: "personal",
    archived_at: null,
  },
];
const categories: CategoryHierarchyItem[] = [
  {
    id: "moradia",
    group_id: groupId,
    parent_id: null,
    name: "Moradia",
    kind: "expense",
    context: "personal",
    archived_at: null,
  },
  {
    id: "energia",
    group_id: groupId,
    parent_id: "moradia",
    name: "Energia",
    kind: "expense",
    context: "personal",
    archived_at: null,
  },
  {
    id: "lazer",
    group_id: otherGroupId,
    parent_id: null,
    name: "Lazer",
    kind: "expense",
    context: "personal",
    archived_at: null,
  },
];

describe("account-centric finance UX", () => {
  it("renders group, category and subcategory as one qualified path", () => {
    expect(getCategoryQualifiedName(categories[1], categories, groups)).toBe(
      "Custos fixos › Moradia › Energia",
    );
  });

  it("only offers parent categories from the selected reporting group", () => {
    expect(
      getAvailableCategoryParents(categories, {
        groupId,
        kind: "expense",
        context: "personal",
      }).map((category) => category.id),
    ).toEqual(["moradia"]);
  });

  it("separates investment families and rejects incompatible products", () => {
    expect(getInvestmentFamily("fixed_income")).toBe("fixed_income");
    expect(getInvestmentFamily("real_estate_fund")).toBe("variable_income");
    expect(
      investmentPositionFormSchema.safeParse({
        institution: "Corretora",
        investmentClass: "fixed_income",
        investmentType: "stock",
        assetName: "Produto incompatível",
        currency: "BRL",
        quantity: "1",
        accumulatedCostMinor: "100,00",
        currentValueMinor: "100,00",
        positionDate: "2026-07-25",
        context: "personal",
        historyIsComplete: false,
        notes: "",
      }).success,
    ).toBe(false);
  });

  it("protects category groups with owner RLS and compatible foreign keys", () => {
    expect(migration).toContain("alter table public.category_groups enable row level security");
    expect(migration).toContain("category_groups_owner_select");
    expect(migration).toContain(
      "category_groups_owner_normalized_name_unique_idx",
    );
    expect(migration).toContain("foreign key (group_id, user_id)");
    expect(migration).toContain("references public.category_groups(id, user_id)");
    expect(migration).toContain("investment_positions_type_class_consistent");
    expect(migration).toContain("kind public.transaction_kind");
    expect(migration).not.toContain("public.category_kind");
    expect(migration).toContain("new.group_id is null");
    expect(migration).toContain("default_investment_position_type");
  });
});
