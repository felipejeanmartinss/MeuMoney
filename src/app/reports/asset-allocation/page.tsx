import { PageHeader } from "@/components/layout/page-header";
import { INVESTMENT_CLASS_LABELS } from "@/domain/investments";
import { formatMoney } from "@/domain/money";
import { getInvestmentInsightData } from "@/services/reports/investment-insights-service";
import type { SupportedCurrency } from "@/types/database";

export const metadata = { title: "Alocação de ativos" };
const share = (value: number, total: number) => total > 0 ? `${(value / total * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "0,0%";

export default async function AssetAllocationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const currency: SupportedCurrency = params.currency === "USD" || params.currency === "EUR" ? params.currency : "BRL";
  const data = await getInvestmentInsightData(currency);
  const positions = data.positions.filter((row) => row.is_active && !row.archived_at).sort((a, b) => b.current_value_minor - a.current_value_minor);
  const total = positions.reduce((sum, row) => sum + row.current_value_minor, 0);
  const groups = Object.entries(Object.groupBy(positions, (row) => row.investment_class))
    .map(([key, rows]) => ({ key, rows: rows ?? [], value: (rows ?? []).reduce((sum, row) => sum + row.current_value_minor, 0) }))
    .sort((a, b) => b.value - a.value);
  return <main className="app-page max-w-[1500px]">
    <PageHeader title="Alocação de ativos" />
    <form className="flex items-end gap-2 rounded-xl border bg-white p-3"><label className="grid gap-1 text-xs font-semibold">Moeda<select name="currency" defaultValue={currency} className="h-10 rounded-lg border px-2"><option>BRL</option><option>USD</option><option>EUR</option></select></label><button className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Aplicar</button></form>
    {data.hasError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Não foi possível carregar todos os ativos.</p> : null}
    <section className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Total investido em {currency}</p><p className="text-2xl font-bold">{formatMoney(total, currency)}</p></section>
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="overflow-hidden rounded-xl border bg-white"><h2 className="border-b px-4 py-3 font-semibold">Por categoria</h2><div className="divide-y">{groups.map((group) => <div key={group.key} className="px-4 py-3"><div className="flex justify-between gap-3 text-sm"><span>{INVESTMENT_CLASS_LABELS[group.key as keyof typeof INVESTMENT_CLASS_LABELS]}</span><span className="font-semibold">{formatMoney(group.value, currency)} · {share(group.value, total)}</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-700" style={{ width: `${Math.max(0, Math.min(100, total > 0 ? group.value / total * 100 : 0))}%` }} /></div></div>)}{!groups.length ? <p className="p-4 text-sm text-slate-500">Nenhum investimento ativo nesta moeda.</p> : null}</div></article>
      <article className="overflow-hidden rounded-xl border bg-white"><h2 className="border-b px-4 py-3 font-semibold">Por ativo</h2><div className="overflow-x-auto"><table className="w-full min-w-[430px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="px-3 py-2">Ativo</th><th className="px-3 py-2 text-right">Valor atual</th><th className="px-3 py-2 text-right">Participação</th></tr></thead><tbody>{positions.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-2"><span className="font-semibold">{row.asset_name}</span><span className="block text-xs text-slate-500">{INVESTMENT_CLASS_LABELS[row.investment_class]}</span></td><td className="px-3 py-2 text-right">{formatMoney(row.current_value_minor, currency)}</td><td className="px-3 py-2 text-right font-semibold">{share(row.current_value_minor, total)}</td></tr>)}</tbody></table></div></article>
    </section>
  </main>;
}
