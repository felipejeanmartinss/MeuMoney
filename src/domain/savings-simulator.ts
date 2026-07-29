import { assertMinorUnits } from "./money";

const MONTHLY_RATE_DENOMINATOR = 120_000n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export type SavingsProjectionPoint = {
  year: number;
  projectedMinor: number;
  contributedMinor: number;
  earningsMinor: number;
};

function toSafeMinorUnits(value: bigint) {
  if (value > MAX_SAFE_BIGINT || value < -MAX_SAFE_BIGINT) {
    throw new Error("A projeção excede o limite seguro.");
  }
  return assertMinorUnits(Number(value));
}

function roundPositiveDivision(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / 2n) / denominator;
}

export function parseAnnualRateToBps(value: string) {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Informe uma taxa anual válida.");
  const whole = Number(match[1]);
  const decimals = Number((match[2] ?? "").padEnd(2, "0"));
  const basisPoints = whole * 100 + decimals;
  if (!Number.isSafeInteger(basisPoints) || basisPoints > 100_000) {
    throw new Error("A taxa anual deve ser de até 1.000%.");
  }
  return basisPoints;
}

export function projectSavings(input: {
  initialMinor: number;
  monthlyContributionMinor: number;
  annualRateBps: number;
  years: number;
}) {
  const initialMinor = assertMinorUnits(input.initialMinor);
  const monthlyContributionMinor = assertMinorUnits(
    input.monthlyContributionMinor,
  );
  if (initialMinor < 0 || monthlyContributionMinor < 0) {
    throw new Error("Valores da simulação não podem ser negativos.");
  }
  if (
    !Number.isSafeInteger(input.annualRateBps) ||
    input.annualRateBps < 0 ||
    input.annualRateBps > 100_000
  ) {
    throw new Error("Taxa anual inválida.");
  }
  if (!Number.isSafeInteger(input.years) || input.years < 1 || input.years > 100) {
    throw new Error("O prazo deve estar entre 1 e 100 anos.");
  }

  let balance = BigInt(initialMinor);
  let contributed = BigInt(initialMinor);
  const monthlyContribution = BigInt(monthlyContributionMinor);
  const annualRateBps = BigInt(input.annualRateBps);
  const points: SavingsProjectionPoint[] = [];

  for (let month = 1; month <= input.years * 12; month += 1) {
    const interest = roundPositiveDivision(
      balance * annualRateBps,
      MONTHLY_RATE_DENOMINATOR,
    );
    balance += interest + monthlyContribution;
    contributed += monthlyContribution;

    if (month % 12 === 0) {
      points.push({
        year: month / 12,
        projectedMinor: toSafeMinorUnits(balance),
        contributedMinor: toSafeMinorUnits(contributed),
        earningsMinor: toSafeMinorUnits(balance - contributed),
      });
    }
  }

  return {
    projectedMinor: toSafeMinorUnits(balance),
    contributedMinor: toSafeMinorUnits(contributed),
    earningsMinor: toSafeMinorUnits(balance - contributed),
    points,
  };
}
