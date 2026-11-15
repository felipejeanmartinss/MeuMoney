import type { FinancingSimulation } from "./financing-imports";
import { assertMinorUnits } from "./money";

export function monthlyYieldBps(input: string) {
  const match = /^(\d{1,3})(?:[,.](\d{1,2}))?$/.exec(input.trim());
  if (!match) throw new Error("Informe uma taxa mensal entre 0 e 100%, com até duas casas decimais.");
  const rate = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (rate > 10000) throw new Error("A taxa mensal não pode ultrapassar 100%.");
  return rate;
}

type Schedule = { rows: ReadonlyArray<Pick<FinancingSimulation["rows"][number], "paymentMinor">> };

export function projectInstallmentDifference(term: Schedule, payment: Schedule, rateBps: number) {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error("Taxa de reinvestimento inválida.");
  const rate = BigInt(rateBps);
  let balance = 0n;
  let contributions = 0;
  for (const [index, row] of payment.rows.entries()) {
    const termDue = term.rows[index]?.paymentMinor ?? 0;
    const deposit = Math.max(0, termDue - row.paymentMinor);
    const interest = (balance * rate + 5000n) / 10000n;
    balance += interest + BigInt(deposit);
    if (balance > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("O saldo projetado excede o limite de cálculo. Experimente uma taxa mensal menor.");
    contributions = assertMinorUnits(contributions + deposit);
  }
  return { contributions, earnings: Number(balance) - contributions, balance: Number(balance), months: payment.rows.length, rateBps };
}
