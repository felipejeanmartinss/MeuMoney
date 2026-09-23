import { PageHeader, PageHelp } from "@/components/layout/page-header";
import { BenchmarkLineChart } from "@/components/investments/benchmark-line-chart";
import { INVESTMENT_CLASS_LABELS } from "@/domain/investments";
import { INVESTMENT_BENCHMARKS, benchmarkMonths, type InvestmentBenchmarkCode } from "@/domain/investment-benchmarks";
import { getInvestmentBenchmarks } from "@/services/finance/investment-benchmarks-service";
import { currentIsoDate } from "@/utils/dates";

export const metadata = { title: "Benchmarks de investimentos" };
const percent = (value: number | null) => value == null ? "—" : `${(value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const control = "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm";

export default async function InvestmentBenchmarksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = currentIsoDate();
  const last = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); last.setUTCMonth(last.getUTCMonth() - 1);
  const first = new Date(last); first.setUTCMonth(first.getUTCMonth() - 11);
  let from = typeof params.from === "string" ? params.from : first.toISOString().slice(0, 7);
  let to = typeof params.to === "string" ? params.to : last.toISOString().slice(0, 7);
  let filterError = "";
  try { benchmarkMonths(from, to); if (to >= today.slice(0, 7)) throw new Error("Use meses encerrados."); }
  catch { filterError = "Período inválido. Use meses encerrados, com início anterior ao fim."; from = first.toISOString().slice(0, 7); to = last.toISOString().slice(0, 7); }
  const selection = typeof params.selection === "string" ? params.selection : "";
  const requested = Array.isArray(params.reference) ? params.reference : typeof params.reference === "string" ? [params.reference] : [];
  const visible = new Set<InvestmentBenchmarkCode>((params.referencesSubmitted ? requested : ["cdi", "ipca"]).filter((code): code is InvestmentBenchmarkCode => INVESTMENT_BENCHMARKS.some((item) => item.code === code)));
  const data = await getInvestmentBenchmarks({ selection, from, to });
  const result = data.result;
  const classes = [...new Set(data.positions.filter((row) => row.currency === "BRL").map((row) => row.investment_class))];
  const months = benchmarkMonths(from, to);
  const series = [
    ...(result.points.length ? [{ code: "portfolio" as const, label: "Selecionado", points: result.points }] : []),
    ...result.comparisons.filter((item) => visible.has(item.code)).map((item) => ({ code: item.code, label: item.label, points: item.series })),
  ];
  return <main className="app-page">
    <PageHeader title="Benchmarks" description="Compare ativo ou classe com referências no mesmo período." />
    <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
      <input type="hidden" name="referencesSubmitted" value="1" />
      <label className="grid gap-1 text-xs font-medium">Ativo ou classe<select name="selection" defaultValue={selection} className={control}><option value="">Selecione</option>
        <optgroup label="Classes">{classes.map((item) => <option key={item} value={`class:${item}`}>{INVESTMENT_CLASS_LABELS[item]}</option>)}</optgroup>
        <optgroup label="Ativos">{data.positions.filter((row) => row.currency === "BRL").map((item) => <option key={item.id} value={`asset:${item.id}`}>{item.asset_name}</option>)}</optgroup>
      </select></label>
      <label className="grid gap-1 text-xs font-medium">De<input type="month" name="from" defaultValue={from} className={control} required /></label>
      <label className="grid gap-1 text-xs font-medium">Até<input type="month" name="to" defaultValue={to} max={last.toISOString().slice(0, 7)} className={control} required /></label>
      <button className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Comparar</button>
      <div className="flex flex-wrap gap-x-3 gap-y-1 sm:col-span-4" aria-label="Referências do gráfico">{INVESTMENT_BENCHMARKS.map((item) => <label key={item.code} className="inline-flex items-center gap-1 text-xs"><input type="checkbox" name="reference" value={item.code} defaultChecked={visible.has(item.code)} className="accent-emerald-700" />{item.label}</label>)}</div>
    </form>
    {filterError ? <p role="alert" className="text-sm text-rose-700">{filterError}</p> : null}
    {data.hasPositionError ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">Não foi possível carregar a lista de ativos. Verifique a conexão e tente novamente.</p> : null}
    {data.hasHistoryError && selection ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">O histórico deste ativo não pôde ser lido. A seleção continua disponível.</p> : null}
    {data.hasReferenceError ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">Referências ainda indisponíveis neste ambiente. É preciso aplicar a migração de benchmarks e sincronizar as séries.</p> : null}
    {selection && result.gaps.length ? <details className="rounded-lg border border-amber-200 bg-amber-50 p-3"><summary className="cursor-pointer text-sm font-semibold">Histórico do ativo incompleto · {result.gaps.length} pendência{result.gaps.length === 1 ? "" : "s"}</summary><p className="mt-2 text-sm">AUVP e demais ativos podem ser selecionados. O retorno só aparece com saldos mensais e movimentações suficientes; não preenchemos lacunas com zero.</p><ul className="mt-2 max-h-36 list-disc overflow-auto pl-5 text-xs">{result.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details> : null}
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
      <article className="min-w-0 rounded-xl border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Evolução acumulada</h2><div className="flex gap-3 text-xs"><span>Selecionado <strong>{percent(result.portfolioReturn)}</strong></span><span>Real após IPCA <strong>{percent(result.realReturn)}</strong></span></div></div><BenchmarkLineChart months={months} series={series} /></article>
      <aside className="rounded-xl border bg-white p-3"><h2 className="mb-1 text-sm font-semibold">Referências</h2><div className="divide-y text-xs">{result.comparisons.map((item) => <div key={item.code} className="flex items-center justify-between gap-2 py-1.5"><span className="font-medium">{item.label}</span><span className="tabular-nums">{percent(item.returnBasisPoints)}</span></div>)}</div><p className="mt-2 text-[11px] text-slate-500">{data.latestSync ? `Atualização ${new Date(data.latestSync).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : "Séries pendentes de sincronização."}</p></aside>
    </section>
    <PageHelp title="Fontes e método"><p>CDI, Selic, IPCA e dólar: Banco Central. Ibovespa e IFIX: B3 ou fornecedor autorizado. Retorno do ativo por Dietz modificado; são necessários saldos e fluxos do período para não inventar performance.</p></PageHelp>
  </main>;
}
