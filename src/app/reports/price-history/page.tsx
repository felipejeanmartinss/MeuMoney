import { PageHeader } from "@/components/layout/page-header";
import { SimpleHistoryChart } from "@/components/reports/simple-history-chart";
import { formatMoney } from "@/domain/money";
import { getInvestmentInsightData } from "@/services/reports/investment-insights-service";
import type { SupportedCurrency } from "@/types/database";

export const metadata = { title: "Preço histórico" };

export default async function PriceHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const currency: SupportedCurrency = params.currency === "USD" || params.currency === "EUR" ? params.currency : "BRL";
  const data = await getInvestmentInsightData(currency);
  const requested = typeof params.asset === "string" ? params.asset : "";
  const selected = data.positions.find((row) => row.id === requested) ?? data.positions[0];
  const from = typeof params.from === "string" && /^\d{4}-\d{2}$/.test(params.from) ? params.from : "";
  const to = typeof params.to === "string" && /^\d{4}-\d{2}$/.test(params.to) ? params.to : "";
  const observations = selected ? [
    ...data.snapshots.filter((row) => row.position_id === selected.id),
    { position_id: selected.id, position_date: selected.position_date, quantity: selected.quantity, current_value_minor: selected.current_value_minor },
  ].sort((a, b) => a.position_date.localeCompare(b.position_date)) : [];
  const unique = [...new Map(observations.map((row) => [row.position_date, row])).values()]
    .filter((row) => (!from || row.position_date.slice(0, 7) >= from) && (!to || row.position_date.slice(0, 7) <= to));
  return <main className="app-page max-w-[1500px]">
    <PageHeader title="Preço histórico" />
    <form className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[100px_minmax(0,1fr)_140px_140px_auto] sm:items-end">
      <label className="grid gap-1 text-xs font-semibold">Moeda<select name="currency" defaultValue={currency} className="h-10 rounded-lg border px-2"><option>BRL</option><option>USD</option><option>EUR</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Investimento<select name="asset" defaultValue={selected?.id ?? ""} className="h-10 min-w-0 rounded-lg border px-2">{data.positions.map((row) => <option key={row.id} value={row.id}>{row.asset_name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">De<input name="from" type="month" defaultValue={from} className="h-10 rounded-lg border px-2" /></label>
      <label className="grid gap-1 text-xs font-semibold">Até<input name="to" type="month" defaultValue={to} className="h-10 rounded-lg border px-2" /></label>
      <button className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Aplicar</button>
    </form>
    {data.hasError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Não foi possível carregar todo o histórico.</p> : null}
    <section className="overflow-hidden rounded-xl border bg-white"><h2 className="px-4 py-3 font-semibold">Evolução do valor total · {selected?.asset_name ?? "Nenhum investimento"}</h2>
      <SimpleHistoryChart points={unique.map((row) => ({ date: row.position_date, valueMinor: row.current_value_minor }))} currency={currency} label="Evolução do valor total do investimento" />
      <p className="px-4 pb-3 text-xs text-slate-500">Cada ponto é uma posição realmente registrada. O preço por unidade é derivado do valor total dividido pela quantidade quando não há cotação separada; não é uma cotação de mercado independente.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2 text-right">Preço por unidade (estimado)</th><th className="px-3 py-2 text-right">Valor total</th></tr></thead><tbody>{unique.map((row) => { const quantity = Number(row.quantity); return <tr key={row.position_date} className="border-t"><td className="px-3 py-2">{row.position_date.split("-").reverse().join("/")}</td><td className="px-3 py-2 text-right">{quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</td><td className="px-3 py-2 text-right">{quantity > 0 ? formatMoney(Math.round(row.current_value_minor / quantity), currency) : "—"}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(row.current_value_minor, currency)}</td></tr>; })}</tbody></table></div>
    </section>
  </main>;
}
