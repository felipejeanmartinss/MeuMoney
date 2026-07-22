export function assertMinorUnits(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("Money must use safe integer minor units.");
  return value;
}

export function formatMoney(amountMinor: number, currency = "BRL", locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(assertMinorUnits(amountMinor) / 100);
}
