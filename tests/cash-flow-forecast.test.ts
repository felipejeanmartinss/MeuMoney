import { describe, expect, it } from "vitest";
import {
  averageMonthlyExpenseMinor,
  buildCashFlowForecastTimeline,
  residualVariableExpenseMinor,
} from "../src/domain/cash-flow-forecast";

describe("cash-flow forecast timeline", () => {
  it("carries movements before the selected window into its opening balance", () => {
    const result = buildCashFlowForecastTimeline({
      baselineDate: "2026-09-20",
      startDate: "2026-09-22",
      endDate: "2026-09-24",
      accounts: [
        { id: "checking", name: "Conta", currentBalanceMinor: 100_000 },
      ],
      events: [
        {
          id: "before",
          accountId: "checking",
          date: "2026-09-21",
          description: "Antes do recorte",
          amountMinor: -10_000,
          kind: "scheduled",
        },
        {
          id: "inside",
          accountId: "checking",
          date: "2026-09-23",
          description: "No recorte",
          amountMinor: 25_000,
          kind: "recurrence",
        },
      ],
    });

    expect(result.openingBalancesByAccount.checking).toBe(90_000);
    expect(result.points.map((point) => point.balancesByAccount.checking)).toEqual([
      90_000,
      115_000,
      115_000,
    ]);
    expect(result.events).toHaveLength(1);
    expect(result.closingBalancesByAccount.checking).toBe(115_000);
  });

  it("keeps transfers neutral when both sides are selected", () => {
    const result = buildCashFlowForecastTimeline({
      baselineDate: "2026-09-20",
      startDate: "2026-09-20",
      endDate: "2026-09-20",
      accounts: [
        { id: "a", name: "A", currentBalanceMinor: 100_000 },
        { id: "b", name: "B", currentBalanceMinor: 50_000 },
      ],
      events: [
        {
          id: "out",
          accountId: "a",
          date: "2026-09-20",
          description: "Transferência",
          amountMinor: -20_000,
          kind: "transfer",
        },
        {
          id: "in",
          accountId: "b",
          date: "2026-09-20",
          description: "Transferência",
          amountMinor: 20_000,
          kind: "transfer",
        },
      ],
    });

    const balances = result.points[0].balancesByAccount;
    expect(balances.a + balances.b).toBe(150_000);
  });
});

describe("conservative residual", () => {
  it("averages over months with no spending and adds only the uncovered amount", () => {
    const average = averageMonthlyExpenseMinor(
      new Map([
        ["2026-06", 30_000],
        ["2026-08", 60_000],
      ]),
      3,
    );
    expect(average).toBe(30_000);
    expect(residualVariableExpenseMinor(average, 12_000)).toBe(18_000);
    expect(residualVariableExpenseMinor(average, 40_000)).toBe(0);
    expect(residualVariableExpenseMinor(average, 0, 0.5)).toBe(15_000);
  });
});
