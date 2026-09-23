import { assertMinorUnits } from "./money";
import type { SupportedCurrency } from "../types/database";

export function sumAmountsByCurrency(rows: ReadonlyArray<{ currency: SupportedCurrency; amountMinor: number }>) {
  const totals = new Map<SupportedCurrency, number>();
  for (const row of rows) {
    totals.set(row.currency, assertMinorUnits((totals.get(row.currency) ?? 0) + assertMinorUnits(row.amountMinor)));
  }
  return [...totals.entries()];
}
