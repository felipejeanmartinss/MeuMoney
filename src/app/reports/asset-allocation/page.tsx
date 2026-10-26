import { PageHeader } from "@/components/layout/page-header";
import { AllocationExportButton } from "@/components/reports/allocation-export-button";
import { allocationQuantityLabel, allocationShare, buildAssetAllocationText } from "@/domain/asset-allocation-report";
import { INVESTMENT_CLASS_LABELS } from "@/domain/investments";
import { formatMoney } from "@/domain/money";
import { getInvestmentInsightData } from "@/services/reports/investment-insights-service";
import type { InvestmentClass, SupportedCurrency } from "@/types/database";

export const metadata = { title: "Alocação de ativos" };

export default async function AssetAllocationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const currency: SupportedCurrency = params.currency === "USD" || params.currency === "EUR" ? params.currency : "BRL";
  const data = await getInvestmentInsightData(currency);
  const positions = data.positions.filter((row) => row.is_active && !row.archived_at).sort((a, b) => b.current_value_minor - a.current_value_minor);
  const total = positions.reduce((sum, row) => sum + row.current_value_minor, 0);
  const groups = Object.entries(Object.groupBy(positions, (row) => row.investment_class))
    .map(([key, rows]) => ({ key: key as InvestmentClass, rows: rows ?? [], value: (rows ?? []).reduce((sum, row) => sum + row.current_value_minor, 0) }))
    .sort((a, b) => b.value - a.value);
  const exportText = buildAssetAllocationText(currency, total, groups);

  return <main className="app-page max-w-[1500px]">
    <PageHeader title="Alocação de ativos" />
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-white p-3">
      <form className="flex items-end gap-2"><label className="grid gap-1 text-xs font-semibold">Moeda<select name="currency" defaultValue={currency} className="h-10 rounded-lg border px-2"><option>BRL</option><option>USD</option><option>EUR</option></select></label><button className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Aplicar</button></form>
      <AllocationExportButton content={exportText} currency={currency} />
    </div>
    {data.hasError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Não foi possível carregar todos os ativos.</p> : null}
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b px-4 py-4"><p className="text-xs text-slate-500">Total investido em {currency}</p><p className="text-2xl font-bold">{formatMoney(total, currency)}</p></div>
      <div className="divide-y">
        {groups.map((group) => <details key={group.key} className="group">
          <summary className="cursor-pointer list-none px-4 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm"><span className="font-semibold"><span aria-hidden="true" className="mr-2 inline-block text-slate-500 transition-transform group-open:rotate-90">▸</span>{INVESTMENT_CLASS_LABELS[group.key]} <span className="font-normal text-slate-500">({group.rows.length})</span></span><span className="tabular-nums">{formatMoney(group.value, currency)} <span className="ml-2 text-slate-500">{allocationShare(group.value, total)}</span></span></div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-700" style={{ width: `${Math.max(0, Math.min(100, total > 0 ? group.value / total * 100 : 0))}%` }} /></div>
          </summary>
          <div className="border-t bg-slate-50 px-4 py-2 sm:pl-9"><div className="divide-y divide-slate-200">{group.rows.map((row) => <div key={row.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm"><span>{row.asset_name}{allocationQuantityLabel(group.key, row.quantity) ? <span className="ml-2 text-xs text-slate-500">{allocationQuantityLabel(group.key, row.quantity)}</span> : null}</span><span className="tabular-nums">{formatMoney(row.current_value_minor, currency)} <span className="ml-2 text-slate-500">{allocationShare(row.current_value_minor, total)}</span></span></div>)}</div></div>
        </details>)}
        {!groups.length ? <p className="p-4 text-sm text-slate-500">Nenhum investimento ativo nesta moeda.</p> : null}
      </div>
    </section>
  </main>;
}
