import { assertMinorUnits } from "./money";

export type CashFlowForecastScenario = "base" | "conservative";

export type CashFlowForecastEventKind =
  | "scheduled"
  | "recurrence"
  | "card-invoice"
  | "transfer"
  | "variable-average";

export type CashFlowForecastAccountInput = {
  id: string;
  name: string;
  currentBalanceMinor: number;
};

export type CashFlowForecastEventInput = {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amountMinor: number;
  kind: CashFlowForecastEventKind;
  categoryLabel?: string | null;
  conservativeOnly?: boolean;
};

export type CashFlowForecastPoint = {
  date: string;
  balancesByAccount: Record<string, number>;
};

export type CashFlowForecastEventRow = CashFlowForecastEventInput & {
  accountBalanceMinor: number;
};

export type CashFlowForecastTimeline = {
  openingBalancesByAccount: Record<string, number>;
  closingBalancesByAccount: Record<string, number>;
  points: CashFlowForecastPoint[];
  events: CashFlowForecastEventRow[];
};

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid cash-flow date.");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid cash-flow date.");
  }
  return date;
}

function eachDate(startDate: string, endDate: string) {
  const cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (cursor > end) throw new Error("Cash-flow start date is after end date.");
  const dates: string[] = [];
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dates.length > 732) throw new Error("Cash-flow period is too long.");
  }
  return dates;
}

function copyBalances(balances: Map<string, number>) {
  return Object.fromEntries(balances.entries());
}

/**
 * Builds the native-currency ledger for a forecast. Current balances are the
 * closed balances immediately before baselineDate; events on baselineDate are
 * therefore intentionally applied by this function.
 */
export function buildCashFlowForecastTimeline(input: {
  baselineDate: string;
  startDate: string;
  endDate: string;
  accounts: readonly CashFlowForecastAccountInput[];
  events: readonly CashFlowForecastEventInput[];
}): CashFlowForecastTimeline {
  parseIsoDate(input.baselineDate);
  if (input.startDate < input.baselineDate) {
    throw new Error("Cash-flow forecast cannot start before its baseline.");
  }
  const dates = eachDate(input.startDate, input.endDate);
  const accountIds = new Set(input.accounts.map((account) => account.id));
  const balances = new Map(
    input.accounts.map((account) => [
      account.id,
      assertMinorUnits(account.currentBalanceMinor),
    ]),
  );
  const events = input.events
    .filter(
      (event) =>
        accountIds.has(event.accountId) &&
        event.date >= input.baselineDate &&
        event.date <= input.endDate,
    )
    .map((event) => ({
      ...event,
      amountMinor: assertMinorUnits(event.amountMinor),
    }))
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.description.localeCompare(right.description, "pt-BR") ||
        left.id.localeCompare(right.id),
    );

  for (const event of events) {
    if (event.date >= input.startDate) break;
    balances.set(
      event.accountId,
      assertMinorUnits((balances.get(event.accountId) ?? 0) + event.amountMinor),
    );
  }
  const openingBalancesByAccount = copyBalances(balances);
  const eventsByDate = new Map<string, CashFlowForecastEventInput[]>();
  for (const event of events) {
    if (event.date < input.startDate) continue;
    const group = eventsByDate.get(event.date) ?? [];
    group.push(event);
    eventsByDate.set(event.date, group);
  }

  const rows: CashFlowForecastEventRow[] = [];
  const points = dates.map((date) => {
    for (const event of eventsByDate.get(date) ?? []) {
      const accountBalanceMinor = assertMinorUnits(
        (balances.get(event.accountId) ?? 0) + event.amountMinor,
      );
      balances.set(event.accountId, accountBalanceMinor);
      rows.push({ ...event, accountBalanceMinor });
    }
    return { date, balancesByAccount: copyBalances(balances) };
  });

  return {
    openingBalancesByAccount,
    closingBalancesByAccount: copyBalances(balances),
    points,
    events: rows,
  };
}

export function averageMonthlyExpenseMinor(
  amountsByMonth: ReadonlyMap<string, number>,
  monthCount: number,
) {
  if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 24) {
    throw new Error("Invalid cash-flow average window.");
  }
  const total = [...amountsByMonth.values()].reduce(
    (sum, amount) => assertMinorUnits(sum + assertMinorUnits(amount)),
    0,
  );
  return assertMinorUnits(Math.round(total / monthCount));
}

export function residualVariableExpenseMinor(
  averageMinor: number,
  alreadyPlannedMinor: number,
  proportion = 1,
) {
  if (!Number.isFinite(proportion) || proportion < 0 || proportion > 1) {
    throw new Error("Invalid cash-flow period proportion.");
  }
  const expected = assertMinorUnits(
    Math.round(assertMinorUnits(averageMinor) * proportion),
  );
  return Math.max(
    0,
    assertMinorUnits(expected - Math.max(0, assertMinorUnits(alreadyPlannedMinor))),
  );
}
