import { describe, expect, it } from "vitest";
import {
  buildCategorySelectionOptions,
  buildTransferSelectionOptions,
  filterSelectionOptions,
} from "../src/domain/category-selection";
import { importClassificationCorrectionSchema } from "../src/domain/file-imports";

const categoryId = "11111111-1111-4111-8111-111111111111";
const subcategoryId = "22222222-2222-4222-8222-222222222222";
const sourceAccountId = "33333333-3333-4333-8333-333333333333";
const investmentAccountId = "44444444-4444-4444-8444-444444444444";

describe("searchable financial classification", () => {
  const categories = [
    {
      id: categoryId,
      parent_id: null,
      name: "Transporte",
      kind: "expense" as const,
      context: "personal" as const,
    },
    {
      id: subcategoryId,
      parent_id: categoryId,
      name: "Álcool e combustível",
      kind: "expense" as const,
      context: "personal" as const,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      parent_id: null,
      name: "Educação",
      kind: "expense" as const,
      context: "professional" as const,
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      parent_id: null,
      name: "Salário",
      kind: "income" as const,
      context: "personal" as const,
    },
  ];

  it("sorts compatible categories alphabetically by their specific name", () => {
    const options = buildCategorySelectionOptions(categories, "expense");

    expect(options.map((option) => option.value)).toEqual([
      subcategoryId,
      "55555555-5555-4555-8555-555555555555",
      categoryId,
    ]);
    expect(options[0].label).toContain("Transporte › Álcool e combustível");
  });

  it("filters category and subcategory names without accent sensitivity", () => {
    const options = buildCategorySelectionOptions(categories, "expense");

    expect(filterSelectionOptions(options, "alcool")).toHaveLength(1);
    expect(filterSelectionOptions(options, "TRANSPORTE")).toHaveLength(2);
    expect(filterSelectionOptions(options, "profissional educação")).toHaveLength(1);
  });

  it("offers only same-currency destination accounts and excludes the source", () => {
    const options = buildTransferSelectionOptions(
      [
        {
          id: sourceAccountId,
          name: "Conta corrente",
          type: "checking",
          currency: "BRL",
        },
        {
          id: investmentAccountId,
          name: "Investimentos",
          type: "investment",
          currency: "BRL",
        },
        {
          id: "77777777-7777-4777-8777-777777777777",
          name: "Conta exterior",
          type: "checking",
          currency: "USD",
        },
      ],
      sourceAccountId,
    );

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      value: `transfer:${investmentAccountId}`,
      group: "Transferências entre contas",
    });
  });

  it("parses category and transfer corrections into explicit classifications", () => {
    const common = {
      rowId: "88888888-8888-4888-8888-888888888888",
      transactionDate: "2026-08-14",
      description: "Movimentação importada",
      signedAmountMinor: "1.000,00",
    };

    expect(
      importClassificationCorrectionSchema.parse({
        ...common,
        classification: `category:${categoryId}`,
      }).classification,
    ).toEqual({ kind: "category", id: categoryId });
    expect(
      importClassificationCorrectionSchema.parse({
        ...common,
        classification: `transfer:${investmentAccountId}`,
      }).classification,
    ).toEqual({ kind: "transfer", id: investmentAccountId });
  });
});
