import { formatMoney } from "@/domain/money";
import { roundedAxisMaximumMinor } from "@/domain/report-chart-axis";
import type { SupportedCurrency } from "@/types/database";

type MonthlyAmount = { month: string; amountMinor: number };

export function CreditCardMonthlyColumnChart({ rows, currency, label, color }: { rows: MonthlyAmount[]; currency: SupportedCurrency; label: string; color: string }) {
  if (!rows.length) return <p className="p-6 text-center text-sm text-slate-500">Nenhum valor no período.</p>;

  const values = rows.map((row) => row.amountMinor);
  const maximum = Math.max(0, ...values);
  const minimum = Math.min(0, ...values);
  const axisMaximum = roundedAxisMaximumMinor(Math.max(maximum, -minimum));
  const axisMinimum = minimum < 0 ? -axisMaximum : 0;
  const width = Math.max(680, rows.length * 56 + 110);
  const height = 300, left = 98, right = 20, top = 20, bottom = 45;
  const plotHeight = height - top - bottom;
  const y = (value: number) => top + (axisMaximum - value) / (axisMaximum - axisMinimum) * plotHeight;
  const center = (index: number) => left + (index + 0.5) * (width - left - right) / rows.length;
  const ticks = Array.from({ length: 5 }, (_, index) => axisMinimum + (axisMaximum - axisMinimum) * index / 4);

  return <div className="overflow-x-auto px-3 py-4">
    <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} className="w-full" role="img" aria-label={label}>
      {ticks.map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke={value === 0 ? "#94a3b8" : "#e2e8f0"} /><text x={left - 8} y={y(value) + 4} textAnchor="end" fill="#64748b" fontSize="10">{formatMoney(Math.round(value), currency)}</text></g>)}
      {rows.map((row, index) => {
        const barTop = y(Math.max(0, row.amountMinor));
        const barBottom = y(Math.min(0, row.amountMinor));
        const x = center(index);
        return <g key={row.month}>
          <rect x={x - 16} y={barTop} width="32" height={Math.max(0, barBottom - barTop)} rx="3" fill={row.amountMinor < 0 ? "#e11d48" : color}><title>{`${row.month.slice(5, 7)}/${row.month.slice(0, 4)} · ${formatMoney(row.amountMinor, currency)}`}</title></rect>
          <text x={x} y={height - 12} textAnchor="middle" fill="#475569" fontSize="10">{row.month.slice(5, 7)}/{row.month.slice(2, 4)}</text>
        </g>;
      })}
    </svg>
  </div>;
}
