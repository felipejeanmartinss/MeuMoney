import { formatMoney } from "../domain/money";
import type { SupportedCurrency } from "../types/database";

export function formatFinancialDate(value: unknown): string {
  if (typeof value !== "string") return "Data indisponível";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatFinancialAmount(
  amountMinor: unknown,
  currency: SupportedCurrency,
  locale = "pt-BR",
): string {
  if (typeof amountMinor !== "number" && typeof amountMinor !== "string") {
    return "Valor indisponível";
  }

  try {
    return formatMoney(amountMinor, currency, locale);
  } catch {
    return "Valor indisponível";
  }
}
