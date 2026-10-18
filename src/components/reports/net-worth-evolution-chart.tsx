import type { NetWorthEvolutionReportRow } from "@/domain/financial-reports";
import { formatMoney } from "@/domain/money";
import type { SupportedCurrency } from "@/types/database";

export function NetWorthEvolutionChart({ rows, currency }: { rows: readonly NetWorthEvolutionReportRow[]; currency: SupportedCurrency }) {
  if (!rows.length) return null;
  const values = rows.flatMap((row) => [row.assetsMinor, row.liabilitiesMinor, row.netWorthMinor]);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = Math.max(1, high - low);
  const width = 800, height = 280, left = 76, right = 18, top = 20, bottom = 38;
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, rows.length - 1);
  const y = (value: number) => top + (high - value) * (height - top - bottom) / span;
  const lines = [
    { key: "assetsMinor" as const, label: "Ativos", color: "#059669" },
    { key: "liabilitiesMinor" as const, label: "Passivos", color: "#e11d48" },
    { key: "netWorthMinor" as const, label: "Patrimônio líquido", color: "#1e293b" },
  ];
  return <figure className="border-t border-slate-200 p-4">
    <figcaption className="mb-2 text-sm font-semibold">Patrimônio no período selecionado</figcaption>
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[560px] w-full" role="img" aria-label="Evolução mensal de ativos, passivos e patrimônio líquido">
      {Array.from({ length: 5 }, (_, index) => low + span * index / 4).map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#e2e8f0" /><text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="10" fill="#64748b">{formatMoney(Math.round(value), currency)}</text></g>)}
      {lines.map((line) => <polyline key={line.key} points={rows.map((row, index) => `${x(index)},${y(row[line.key])}`).join(" ")} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
      {rows.map((row, index) => index % Math.max(1, Math.ceil(rows.length / 9)) === 0 || index === rows.length - 1 ? <text key={row.referenceMonth} x={x(index)} y={height - 8} textAnchor="middle" fontSize="10" fill="#64748b">{row.referenceMonth.slice(5, 7)}/{row.referenceMonth.slice(2, 4)}</text> : null)}
    </svg></div>
    <div className="flex flex-wrap justify-center gap-4 text-xs">{lines.map((line) => <span key={line.key} className="flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />{line.label}</span>)}</div>
  </figure>;
}
