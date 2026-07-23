import type { SupportedCurrency } from "../types/database";

export const SUPPORTED_CURRENCIES = ["BRL", "USD", "EUR"] as const;

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  BRL: "Real brasileiro (BRL)",
  USD: "Dólar americano (USD)",
  EUR: "Euro (EUR)",
};

export const CURRENCY_LOCALES: Record<SupportedCurrency, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "pt-PT",
};
