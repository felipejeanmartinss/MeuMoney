import { describe, expect, it } from "vitest";
import {
  calculateFinancialDashboardMonth,
  calculateExecutiveDashboardNetWorth,
  calculateSavingsRatePercentage,
  fillMonthlyEvolution,
  limitExpenseCategories,
  referenceMonthsEndingAt,
  sumAccountBalancesByCurrency,
  type DashboardEntry,
} from "../src/domain/financial-dashboard";

const baseExpense = {
  source: "transaction" as const,
  userId: "user-a",
  currency: "BRL" as const,
  amountMinor: 10_000,
  categoryId: "food",
  categoryName: "Alimentação",
  context: "personal" as const,
  transactionDate: "2026-07-10",
  transactionType: "expense" as const,
  status: "completed" as const,
  isActive: true,
  originType: "manual" as const,
};

describe("financial dashboard aggregations", () => {
  it("calculates income, consumption, result and budget percentage", () => {
    const result = calculateFinancialDashboardMonth({
      userId: "user-a",
      referenceMonth: "2026-07",
      budgets: [
        {
          userId: "user-a",
          currency: "BRL",
          referenceMonth: "2026-07-01",
          plannedAmountMinor: 40_000,
        },
      ],
      entries: [
        baseExpense,
        {
          ...baseExpense,
          categoryId: "salary",
          categoryName: "Salário",
          amountMinor: 100_000,
          transactionType: "income",
        },
      ],
    });

    expect(result).toMatchObject([
      {
        currency: "BRL",
        incomeAmountMinor: 100_000,
        expenseAmountMinor: 10_000,
        resultAmountMinor: 90_000,
        plannedAmountMinor: 40_000,
        budgetPercentageConsumed: 25,
      },
    ]);
  });

  it("excludes transfers, invoice payments, pending and inactive entries", () => {
    const entries: DashboardEntry[] = [
      { ...baseExpense, status: "pending" },
      { ...baseExpense, isActive: false },
      {
        ...baseExpense,
        categoryId: null,
        categoryName: null,
        context: null,
        originType: "credit_card_invoice_payment",
      },
      {
        source: "transfer",
        userId: "user-a",
        currency: "BRL",
        amountMinor: 50_000,
        transactionDate: "2026-07-10",
      },
    ];

    expect(
      calculateFinancialDashboardMonth({
        userId: "user-a",
        referenceMonth: "2026-07",
        budgets: [],
        entries,
      }),
    ).toEqual([]);
  });

  it("recognizes card purchases by installment competence", () => {
    const result = calculateFinancialDashboardMonth({
      userId: "user-a",
      referenceMonth: "2026-07",
      budgets: [],
      entries: [
        {
          source: "card_installment",
          userId: "user-a",
          currency: "BRL",
          amountMinor: 12_500,
          categoryId: "education",
          categoryName: "Educação",
          context: "personal",
          competenceDate: "2026-07-01",
          purchaseActive: true,
          installmentCancelled: false,
        },
        {
          source: "card_installment",
          userId: "user-a",
          currency: "BRL",
          amountMinor: 20_000,
          categoryId: "education",
          categoryName: "Educação",
          context: "personal",
          competenceDate: "2026-08-01",
          purchaseActive: true,
          installmentCancelled: false,
        },
        {
          source: "card_installment",
          userId: "user-a",
          currency: "BRL",
          amountMinor: 30_000,
          categoryId: "education",
          categoryName: "Educação",
          context: "personal",
          competenceDate: "2026-07-01",
          purchaseActive: true,
          installmentCancelled: true,
        },
      ],
    });

    expect(result[0].expenseAmountMinor).toBe(12_500);
    expect(result[0].categoryExpenses[0].amountMinor).toBe(12_500);
  });

  it("separates card competence from the cash payment of its invoice", () => {
    const cardInstallment: DashboardEntry = {
      source: "card_installment",
      userId: "user-a",
      currency: "BRL",
      amountMinor: 30_000,
      categoryId: "travel",
      categoryName: "Viagens",
      context: "personal",
      competenceDate: "2026-07-01",
      purchaseActive: true,
      installmentCancelled: false,
    };
    const invoicePayment: DashboardEntry = {
      ...baseExpense,
      categoryId: null,
      categoryName: null,
      context: null,
      amountMinor: 30_000,
      originType: "credit_card_invoice_payment",
    };
    const budgets = [
      {
        userId: "user-a",
        currency: "BRL" as const,
        referenceMonth: "2026-07-01",
        plannedAmountMinor: 60_000,
      },
    ];

    const competence = calculateFinancialDashboardMonth({
      userId: "user-a",
      referenceMonth: "2026-07",
      basis: "competence",
      budgets,
      entries: [cardInstallment, invoicePayment],
    });
    const cash = calculateFinancialDashboardMonth({
      userId: "user-a",
      referenceMonth: "2026-07",
      basis: "cash",
      budgets,
      entries: [cardInstallment, invoicePayment],
    });

    expect(competence[0]).toMatchObject({
      expenseAmountMinor: 30_000,
      plannedAmountMinor: 60_000,
      budgetPercentageConsumed: 50,
    });
    expect(competence[0].categoryExpenses[0]).toMatchObject({
      categoryName: "Viagens",
      amountMinor: 30_000,
    });
    expect(cash[0]).toMatchObject({
      expenseAmountMinor: 30_000,
      plannedAmountMinor: 0,
      budgetPercentageConsumed: null,
    });
    expect(cash[0].categoryExpenses[0]).toMatchObject({
      categoryId: "cash-card-payments",
      categoryName: "Pagamento de cartões",
      amountMinor: 30_000,
    });
  });

  it("keeps currencies and users isolated", () => {
    const result = calculateFinancialDashboardMonth({
      userId: "user-a",
      referenceMonth: "2026-07",
      budgets: [],
      entries: [
        baseExpense,
        { ...baseExpense, currency: "USD", amountMinor: 2_000 },
        { ...baseExpense, userId: "user-b", amountMinor: 99_000 },
      ],
    });

    expect(result.map((row) => [row.currency, row.expenseAmountMinor])).toEqual([
      ["BRL", 10_000],
      ["USD", 2_000],
    ]);
  });

  it("fills a six-month evolution including short and year boundary months", () => {
    expect(referenceMonthsEndingAt("2026-02")).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    const rows = fillMonthlyEvolution("BRL", "2026-02", [
      {
        currency: "BRL",
        referenceMonth: "2026-02-01",
        incomeAmountMinor: 1_000,
        expenseAmountMinor: 200,
        resultAmountMinor: 800,
        plannedAmountMinor: 500,
        budgetPercentageConsumed: 40,
      },
    ]);
    expect(rows).toHaveLength(6);
    expect(rows[0].expenseAmountMinor).toBe(0);
    expect(rows[5].resultAmountMinor).toBe(800);
  });

  it("sums only active accounts for the requested user and currency", () => {
    const totals = sumAccountBalancesByCurrency(
      [
        {
          userId: "user-a",
          currency: "BRL",
          currentBalanceMinor: 10_000,
          active: true,
        },
        {
          userId: "user-a",
          currency: "BRL",
          currentBalanceMinor: 5_000,
          active: false,
        },
        {
          userId: "user-a",
          currency: "USD",
          currentBalanceMinor: 2_000,
          active: true,
        },
        {
          userId: "user-b",
          currency: "BRL",
          currentBalanceMinor: 90_000,
          active: true,
        },
      ],
      "user-a",
    );
    expect([...totals.entries()]).toEqual([
      ["BRL", 10_000],
      ["USD", 2_000],
    ]);
  });

  it("limits category noise and consolidates the remainder as Outras", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      categoryId: `category-${index}`,
      categoryName: `Categoria ${index}`,
      context: "personal" as const,
      amountMinor: 7_000 - index * 1_000,
    }));
    const result = limitExpenseCategories(rows, 5);

    expect(result).toHaveLength(5);
    expect(result.at(-1)).toMatchObject({
      categoryId: "other-categories",
      categoryName: "Outras",
      amountMinor: 6_000,
    });
  });

  it("adds transactional balance and subtracts the current credit-card balance", () => {
    expect(
      calculateExecutiveDashboardNetWorth({
        accountBalanceMinor: 50_000,
        manualNetWorthMinor: 300_000,
        creditCardBalanceMinor: 20_000,
      }),
    ).toBe(330_000);
  });

  it("calculates a savings rate only when the month has realized income", () => {
    expect(
      calculateSavingsRatePercentage({
        incomeAmountMinor: 100_000,
        resultAmountMinor: 27_500,
      }),
    ).toBe(27.5);
    expect(
      calculateSavingsRatePercentage({
        incomeAmountMinor: 0,
        resultAmountMinor: -10_000,
      }),
    ).toBeNull();
  });
});
