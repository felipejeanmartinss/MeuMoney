import { assertMinorUnits } from "./money";

export function allocateBudgetGroupByPercent(
  incomeMinor: number,
  percent: number,
  rows: readonly { id: string; plannedAmountMinor: number }[],
) {
  assertMinorUnits(incomeMinor);
  if (incomeMinor < 0 || !Number.isInteger(percent) || percent < 0 || percent > 100 || rows.length === 0) {
    throw new Error("Percentual ou base de receita inválidos.");
  }
  const target = (BigInt(incomeMinor) * BigInt(percent) + 50n) / 100n;
  const weights = rows.map((row) => BigInt(Math.max(0, assertMinorUnits(row.plannedAmountMinor))));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  let remaining = target;
  return Object.fromEntries(rows.map((row, index) => {
    const allocation = index === rows.length - 1 ? remaining
      : totalWeight === 0n ? index === 0 ? target : 0n
        : target * weights[index] / totalWeight;
    remaining -= allocation;
    return [row.id, assertMinorUnits(Number(allocation))];
  })) as Record<string, number>;
}
