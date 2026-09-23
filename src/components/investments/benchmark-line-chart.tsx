import type { InvestmentBenchmarkCode } from "@/domain/investment-benchmarks";

type Point = { month: string; returnBasisPoints: number | null };
type Series = { code: InvestmentBenchmarkCode | "portfolio"; label: string; points: Point[] };

const colors: Record<Series["code"], string> = {
  portfolio: "#047857", cdi: "#2563eb", selic: "#7c3aed", ipca: "#d97706",
  ibovespa: "#dc2626", ifix: "#0891b2", usd: "#64748b",
};

export function BenchmarkLineChart({ months, series }: { months: string[]; series: Series[] }) {
  const values = series.flatMap((item) => item.points.flatMap((point) => point.returnBasisPoints == null ? [] : [point.returnBasisPoints / 100]));
  if (!months.length || !values.length) return <p className="grid min-h-52 place-items-center text-sm text-slate-500">Selecione um ativo e referências com histórico disponível para visualizar a evolução.</p>;
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = Math.max(1, high - low);
  const width = 760, height = 280, left = 56, right = 18, top = 18, bottom = 36;
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, months.length - 1);
  const y = (value: number) => top + ((high - value) / span) * (height - top - bottom);
  const ticks = Array.from({ length: 5 }, (_, index) => low + span * index / 4);
  return <div className="overflow-x-auto" role="img" aria-label="Evolução acumulada de retornos em percentual">
    <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[540px] w-full" aria-hidden="true">
      {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" /><text x={left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{tick.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</text></g>)}
      {series.map((item) => {
        const valid = item.points.map((point, index) => point.returnBasisPoints == null ? null : { index, value: point.returnBasisPoints / 100 }).filter((point): point is { index: number; value: number } => point !== null);
        return <g key={item.code}>
          <polyline fill="none" stroke={colors[item.code]} strokeWidth={item.code === "portfolio" ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" points={valid.map((point) => `${x(point.index)},${y(point.value)}`).join(" ")} />
          {valid.map((point) => <circle key={point.index} cx={x(point.index)} cy={y(point.value)} r="4" fill={colors[item.code]} className="opacity-0 hover:opacity-100 focus:opacity-100"><title>{item.label} · {months[point.index].slice(0, 7)} · {point.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</title></circle>)}
        </g>;
      })}
      {months.map((month, index) => index % Math.max(1, Math.ceil(months.length / 8)) === 0 || index === months.length - 1 ? <text key={month} x={x(index)} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">{month.slice(5, 7)}/{month.slice(2, 4)}</text> : null)}
    </svg>
  </div>;
}
