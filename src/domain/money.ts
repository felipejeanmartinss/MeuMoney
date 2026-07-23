export function assertMinorUnits(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("Money must use safe integer minor units.");
  return value;
}

export function formatMoney(amountMinor: number, currency = "BRL", locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(assertMinorUnits(amountMinor) / 100);
}

export function parseMoneyInputToMinor(input: string): number {
  const compact = input.trim().replace(/\s/g, "").replace(/^R\$/, "");
  if (!compact) throw new Error("Informe um valor.");

  const negative = compact.startsWith("-");
  const unsigned = negative ? compact.slice(1) : compact;
  let integerPart = unsigned;
  let decimalPart = "";

  if (unsigned.includes(",")) {
    const pieces = unsigned.split(",");
    if (pieces.length !== 2) throw new Error("Informe um valor monetário válido.");
    integerPart = pieces[0].replace(/\./g, "");
    decimalPart = pieces[1];
  } else if ((unsigned.match(/\./g) ?? []).length === 1) {
    const [before, after] = unsigned.split(".");
    if (after.length <= 2) {
      integerPart = before;
      decimalPart = after;
    } else {
      integerPart = `${before}${after}`;
    }
  } else {
    integerPart = unsigned.replace(/\./g, "");
  }

  if (!/^\d+$/.test(integerPart) || !/^\d{0,2}$/.test(decimalPart)) {
    throw new Error("Informe um valor monetário válido.");
  }

  const cents = BigInt(decimalPart.padEnd(2, "0") || "0");
  const absoluteMinor = BigInt(integerPart) * 100n + cents;
  const signedMinor = negative ? -absoluteMinor : absoluteMinor;
  if (
    signedMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
    signedMinor < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("O valor informado é muito alto.");
  }

  return Number(signedMinor);
}

export function minorUnitsToInput(amountMinor: number): string {
  const safeAmount = assertMinorUnits(amountMinor);
  const sign = safeAmount < 0 ? "-" : "";
  const absolute = Math.abs(safeAmount);
  const units = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  return `${sign}${units},${cents}`;
}
