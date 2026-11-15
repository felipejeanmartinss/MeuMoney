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

export function compareReinvestment(baseline: Schedule, term: Schedule, payment: Schedule, rateBps: number) {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error("Taxa de reinvestimento inválida.");
  const rate = BigInt(rateBps);
  const account = () => ({ contributions: 0, balance: 0 });
  const shorter = account(), smaller = account();
  function closeMonth(portfolio: ReturnType<typeof account>, deposit: number) {
    const interest = (BigInt(portfolio.balance) * rate + 5000n) / 10000n;
    const balance = BigInt(portfolio.balance) + interest + BigInt(deposit);
    if (balance > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("O saldo projetado excede o limite de cálculo. Experimente uma taxa mensal menor.");
    portfolio.contributions = assertMinorUnits(portfolio.contributions + deposit);
    portfolio.balance = Number(balance);
  }
  for (let i = 0; i < baseline.rows.length; i++) {
    const termDue = term.rows[i]?.paymentMinor ?? 0;
    const paymentDue = payment.rows[i]?.paymentMinor ?? 0;
    const budget = Math.max(baseline.rows[i].paymentMinor, termDue, paymentDue);
    closeMonth(shorter, budget - termDue);
    closeMonth(smaller, budget - paymentDue);
  }
  return { term: shorter, payment: smaller, months: baseline.rows.length, rateBps };
}
