import { SUPPORTED_CURRENCIES } from "./currencies";
import { assertMinorUnits } from "./money";
import type { SupportedCurrency } from "@/types/database";

export type CurrencyConversionSample = {
  sourceCurrency: SupportedCurrency;
  destinationCurrency: SupportedCurrency;
  sourceAmountMinor: number;
  destinationAmountMinor: number;
  transactionDate: string;
};

type CurrencyRatio = {
  numerator: number;
  denominator: number;
};

function conversionRatio(
  source: SupportedCurrency,
  destination: SupportedCurrency,
  referenceDate: string,
  samples: readonly CurrencyConversionSample[],
): CurrencyRatio | null {
  const candidates = samples
    .filter(
      (sample) =>
        sample.sourceAmountMinor > 0 &&
        sample.destinationAmountMinor > 0 &&
        ((sample.sourceCurrency === source &&
          sample.destinationCurrency === destination) ||
          (sample.sourceCurrency === destination &&
            sample.destinationCurrency === source)),
    )
    .sort((left, right) => {
      const leftPast = left.transactionDate <= referenceDate;
      const rightPast = right.transactionDate <= referenceDate;
      if (leftPast !== rightPast) return leftPast ? -1 : 1;
      return leftPast
        ? right.transactionDate.localeCompare(left.transactionDate)
        : left.transactionDate.localeCompare(right.transactionDate);
    });
  const selected = candidates[0];
  if (!selected) return null;
  return selected.sourceCurrency === source
    ? {
        numerator: selected.destinationAmountMinor,
        denominator: selected.sourceAmountMinor,
      }
    : {
        numerator: selected.sourceAmountMinor,
        denominator: selected.destinationAmountMinor,
      };
}

function applyRatio(valueMinor: number, ratio: CurrencyRatio) {
  const value = assertMinorUnits(valueMinor);
  const sign = value < 0 ? -1n : 1n;
  const absolute = BigInt(Math.abs(value));
  const numerator = BigInt(assertMinorUnits(ratio.numerator));
  const denominator = BigInt(assertMinorUnits(ratio.denominator));
  const rounded = (absolute * numerator + denominator / 2n) / denominator;
  return assertMinorUnits(Number(sign * rounded));
}

export function convertMinorUnits(
  valueMinor: number,
  source: SupportedCurrency,
  destination: SupportedCurrency,
  referenceDate: string,
  samples: readonly CurrencyConversionSample[],
): number | null {
  const value = assertMinorUnits(valueMinor);
  if (source === destination || value === 0) return value;

  const direct = conversionRatio(source, destination, referenceDate, samples);
  if (direct) return applyRatio(value, direct);

  for (const bridge of SUPPORTED_CURRENCIES) {
    if (bridge === source || bridge === destination) continue;
    const first = conversionRatio(source, bridge, referenceDate, samples);
    const second = conversionRatio(bridge, destination, referenceDate, samples);
    if (!first || !second) continue;
    return applyRatio(applyRatio(value, first), second);
  }
  return null;
}
