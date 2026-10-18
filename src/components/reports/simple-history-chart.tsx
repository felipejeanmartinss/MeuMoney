import { formatMoney } from "@/domain/money";
import type { SupportedCurrency } from "@/types/database";

export function SimpleHistoryChart({ points, currency, label }: { points: readonly { date: string; valueMinor: number }[]; currency: SupportedCurrency; label: string }) {
  if (!points.length) return <p className="p-6 text-sm text-slate-500">Nenhuma atualização no período.</p>;
  const width = 800, height = 280, left = 78, right = 18, top = 20, bottom = 42;
  const low = Math.min(0, ...points.map((point) => point.valueMinor));
  const high = Math.max(0, ...points.map((point) => point.valueMinor));
  const span = Math.max(1, high - low);
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, points.length - 1);
  const y = (value: number) => top + (high - value) * (height - top - bottom) / span;
  return <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[540px] w-full" role="img" aria-label={label}>
    {Array.from({ length: 5 }, (_, index) => low + span * index / 4).map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#e2e8f0" /><text x={left - 8} y={y(value) + 4} textAnchor="end" fill="#64748b" fontSize="10">{formatMoney(Math.round(value), currency)}</text></g>)}
    {points.length > 1 ? <polyline fill="none" stroke="#047857" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points.map((point, index) => `${x(index)},${y(point.valueMinor)}`).join(" ")} /> : null}
    {points.map((point, index) => <g key={`${point.date}-${index}`}><circle cx={x(index)} cy={y(point.valueMinor)} r="4" fill="#047857"><title>{point.date.split("-").reverse().join("/")} · {formatMoney(point.valueMinor, currency)}</title></circle>{index % Math.max(1, Math.ceil(points.length / 8)) === 0 || index === points.length - 1 ? <text x={x(index)} y={height - 9} textAnchor="middle" fill="#64748b" fontSize="10">{point.date.slice(8, 10)}/{point.date.slice(5, 7)}/{point.date.slice(2, 4)}</text> : null}</g>)}
  </svg></div>;
}
