import type { IncomeExpenseReportRow } from "@/domain/financial-reports";
import type { SupportedCurrency } from "@/types/database";
import { formatMoney } from "@/domain/money";
import { roundedAxisMaximumMinor } from "@/domain/report-chart-axis";

export function IncomeExpenseColumnChart({ rows, currency }: { rows: IncomeExpenseReportRow[]; currency: SupportedCurrency }) {
  const displayed = rows.slice(-24);
  if (!displayed.length) return <p className="p-6 text-center text-sm text-slate-500">Nenhum valor no período.</p>;
  const max = roundedAxisMaximumMinor(Math.max(0, ...displayed.flatMap((row) => [row.incomeAmountMinor, row.expenseAmountMinor])));
  const width = Math.max(640, displayed.length * 48 + 70);
  const height = 300, baseline = 255, plotHeight = 214, left = 55;
  const barWidth = Math.max(7, Math.min(17, (width - left - 20) / displayed.length / 3));
  const x = (index: number) => left + (index + 0.5) * (width - left - 20) / displayed.length;
  return <div className="overflow-x-auto border-t border-slate-200 p-3">
    <div className="mb-2 flex gap-4 text-xs"><span><i className="mr-1 inline-block size-2 rounded-sm bg-emerald-600" />Receitas</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-blue-600" />Despesas</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} className="w-full" role="img" aria-label="Gráfico de colunas de receitas e despesas por mês">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - 10} y1={baseline - ratio * plotHeight} y2={baseline - ratio * plotHeight} stroke="#e2e8f0" /><text x={left - 6} y={baseline - ratio * plotHeight + 3} textAnchor="end" className="fill-slate-500 text-[10px]">{(max * ratio / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</text></g>)}
      {displayed.map((row, index) => {
        const center = x(index);
        const incomeHeight = Math.max(0, row.incomeAmountMinor / max * plotHeight);
        const expenseHeight = Math.max(0, row.expenseAmountMinor / max * plotHeight);
        return <g key={row.referenceMonth}><rect x={center - barWidth - 1} y={baseline - incomeHeight} width={barWidth} height={incomeHeight} fill="#059669"><title>{row.referenceMonth.slice(0, 7)} · Receitas: {formatMoney(row.incomeAmountMinor, currency)}</title></rect><rect x={center + 1} y={baseline - expenseHeight} width={barWidth} height={expenseHeight} fill="#2563eb"><title>{row.referenceMonth.slice(0, 7)} · Despesas: {formatMoney(row.expenseAmountMinor, currency)}</title></rect><text x={center} y={baseline + 16} textAnchor="middle" className="fill-slate-600 text-[10px]">{row.referenceMonth.slice(5, 7)}/{row.referenceMonth.slice(2, 4)}</text></g>;
      })}
    </svg>
    {rows.length > displayed.length ? <p className="text-right text-xs text-slate-500">Exibindo os 24 meses mais recentes. A tabela mantém todo o período.</p> : null}
  </div>;
}
