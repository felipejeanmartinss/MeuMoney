export function toIsoDate(date: Date): string { return date.toISOString().slice(0, 10); }

export function formatIsoDatePtBr(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatReferenceMonthPtBr(value: string) {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match ? `${match[2]}/${match[1]}` : value;
}

export function currentIsoDate(
  now = new Date(),
  timeZone = "America/Sao_Paulo",
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Não foi possível determinar a data atual.");
  }
  return `${year}-${month}-${day}`;
}
