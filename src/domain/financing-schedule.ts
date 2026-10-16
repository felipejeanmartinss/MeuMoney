import { assertMinorUnits, minorUnitsToInput, parseMoneyInputToMinor } from "./money";

export function financingMoneyInput(value: number) {
  const [units, cents] = minorUnitsToInput(value).split(",");
  return `${units.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

export function normalizeFinancingMoney(value: string) {
  try { return financingMoneyInput(parseMoneyInputToMinor(value)); }
  catch { return value; }
}

const SCALE = 1_000_000_000_000n;
const rounded = (a: bigint, b: bigint) => (a + b / 2n) / b;

/** Monetary operations stay in integer cents, including PRICE interest rounding. */
export function projectFinancingSchedule(input: {
  principalMinor: number; annualRate: string; months: number; method: "SAC" | "PRICE";
}) {
  assertMinorUnits(input.principalMinor);
  if (input.principalMinor <= 0 || !Number.isInteger(input.months) || input.months < 1 || input.months > 1200) {
    throw new Error("Informe saldo positivo e prazo entre 1 e 1.200 meses.");
  }
  const rateText = input.annualRate.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,8})?$/.test(rateText)) throw new Error("Informe a taxa nominal anual.");
  const [whole, decimals = ""] = rateText.split(".");
  const rate = rounded((BigInt(whole) * 100_000_000n + BigInt(decimals.padEnd(8, "0"))) * SCALE, 1200n * 100_000_000n);
  if (rate > SCALE) throw new Error("A taxa nominal anual deve ser de até 1.200%.");
  let balance = BigInt(input.principalMinor);
  let factor = SCALE;
  for (let i = 0; i < input.months; i++) factor = rounded(factor * (SCALE + rate), SCALE);
  const payment = rate === 0n ? rounded(balance, BigInt(input.months)) : rounded(balance * rate * factor, SCALE * (factor - SCALE));
  const amortization = rounded(balance, BigInt(input.months));
  const rows = [];
  for (let i = 0; i < input.months && balance > 0n; i++) {
    const interest = rounded(balance * rate, SCALE);
    let principal = input.method === "SAC" ? amortization : payment - interest;
    if (i === input.months - 1 || principal > balance) principal = balance;
    if (principal < 0n) throw new Error("A prestação não cobre os juros.");
    balance -= principal;
    rows.push({ principalMinor: assertMinorUnits(Number(principal)), interestMinor: assertMinorUnits(Number(interest)), paymentMinor: assertMinorUnits(Number(principal + interest)), balanceMinor: assertMinorUnits(Number(balance)) });
  }
  return rows;
}

export type AmortizableRow = {
  principalMinor: number; interestMinor: number; totalAmountMinor: number;
  chargesMinor: number; outstandingBalanceMinor: number; extraAmortizationMinor: number;
  installmentsReduced: number; paymentStatus: "paid" | "scheduled";
  paidAmountMinor: number; linkedTransactionId: string | null;
};

export function amortizeFinancingSchedule<T extends AmortizableRow>(rows: T[], index: number, input: {
  amountMinor: number; installments: number; annualRate: string; method: "SAC" | "PRICE";
}): T[] {
  const row = rows[index];
  if (!row) throw new Error("Selecione uma parcela.");
  assertMinorUnits(input.amountMinor);
  const future = rows.slice(index + 1);
  if (row.extraAmortizationMinor > 0) throw new Error("Esta parcela já possui amortização. Edite os valores diretamente para revisá-la.");
  if (future.some((item) => item.paymentStatus === "paid" || item.linkedTransactionId || item.extraAmortizationMinor > 0)) {
    throw new Error("Há parcelas seguintes pagas, vinculadas ou amortizadas. Revise-as manualmente para preservar o histórico.");
  }
  if (!Number.isInteger(input.installments) || input.installments < 0 || input.installments > future.length || input.amountMinor < 0) {
    throw new Error("Informe uma quantidade válida de parcelas a reduzir.");
  }
  const balance = row.outstandingBalanceMinor;
  const amount = input.amountMinor || (input.installments ? future.slice(-input.installments).reduce((sum, item) => assertMinorUnits(sum + item.principalMinor), 0) : 0);
  if (amount <= 0 || amount > balance) throw new Error("A amortização deve ser positiva e não exceder o saldo devedor.");
  const remaining = balance - amount;
  const count = remaining === 0 ? 0 : future.length - input.installments;
  if (remaining > 0 && count < 1) throw new Error("O valor não quita o saldo. Mantenha ao menos uma parcela futura.");
  const projection = count ? projectFinancingSchedule({ principalMinor: remaining, annualRate: input.annualRate, months: count, method: input.method }) : [];
  return [
    ...rows.slice(0, index),
    { ...row, outstandingBalanceMinor: remaining, extraAmortizationMinor: amount, installmentsReduced: future.length - count,
      paidAmountMinor: row.paymentStatus === "paid" ? assertMinorUnits(row.paidAmountMinor + amount) : row.paidAmountMinor },
    ...projection.map((item, i) => ({ ...future[i], principalMinor: item.principalMinor, interestMinor: item.interestMinor,
      totalAmountMinor: assertMinorUnits(item.paymentMinor + future[i].chargesMinor), outstandingBalanceMinor: item.balanceMinor })),
  ];
}

function nextMonthlyDate(start: string, offset: number) {
  const [year, month, day] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Rebuilds only installments after the balance reference date; prior history is untouched. */
export function reprojectRemainingFinancingSchedule<T extends AmortizableRow & { dueDate: string; installmentNumber: number }>(
  rows: T[],
  input: { balanceDate: string; balanceMinor: number; termMonths: number; annualRate: string; method: "SAC" | "PRICE"; createRow: (number: number, dueDate: string) => T },
): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.balanceDate)) throw new Error("Informe a data-base do saldo.");
  const firstFuture = rows.findIndex((row) => row.paymentStatus === "scheduled" && row.dueDate > input.balanceDate);
  if (firstFuture < 0) throw new Error("Não há parcelas após a data-base do saldo para reprojetar.");
  if (rows.slice(firstFuture).some((row) => row.paymentStatus === "paid" || row.linkedTransactionId)) {
    throw new Error("Revise primeiro parcelas pagas ou vinculadas entre as futuras; elas não serão substituídas.");
  }
  const remaining = input.termMonths - firstFuture;
  if (!Number.isInteger(remaining) || remaining < 1 || remaining > 1200) throw new Error("Confira o prazo original e as parcelas já pagas.");
  const projected = projectFinancingSchedule({ principalMinor: input.balanceMinor, months: remaining, annualRate: input.annualRate, method: input.method });
  return [...rows.slice(0, firstFuture), ...projected.map((entry, index) => {
    const installmentNumber = firstFuture + index + 1;
    const existing = rows[firstFuture + index];
    const row = existing ?? input.createRow(installmentNumber, nextMonthlyDate(input.balanceDate, index + 1));
    return { ...row, installmentNumber, principalMinor: entry.principalMinor, interestMinor: entry.interestMinor,
      totalAmountMinor: assertMinorUnits(entry.paymentMinor + row.chargesMinor), outstandingBalanceMinor: entry.balanceMinor,
      extraAmortizationMinor: 0, installmentsReduced: 0 };
  })];
}
