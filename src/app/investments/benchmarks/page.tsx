import { PageHeader, PageHelp } from "@/components/layout/page-header";
import { INVESTMENT_CLASS_LABELS } from "@/domain/investments";
import { benchmarkMonths } from "@/domain/investment-benchmarks";
import { getInvestmentBenchmarks } from "@/services/finance/investment-benchmarks-service";
import { currentIsoDate } from "@/utils/dates";

export const metadata = { title: "Benchmarks de investimentos" };
const percent = (value: number | null) => value == null ? "—" : `${(value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const control = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm";

export default async function InvestmentBenchmarksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const today = currentIsoDate();
  const last = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); last.setUTCMonth(last.getUTCMonth() - 1);
  const first = new Date(last); first.setUTCMonth(first.getUTCMonth() - 11);
  let from = typeof params.from === "string" ? params.from : first.toISOString().slice(0, 7);
  let to = typeof params.to === "string" ? params.to : last.toISOString().slice(0, 7);
  let filterError = "";
  try { benchmarkMonths(from, to); if (to >= today.slice(0, 7)) throw new Error("Use meses já encerrados."); }
  catch { filterError = "Período inválido. Use meses encerrados, com início anterior ao fim."; from = first.toISOString().slice(0, 7); to = last.toISOString().slice(0, 7); }
  const selection = typeof params.selection === "string" ? params.selection : "";
  const data = await getInvestmentBenchmarks({ selection, from, to });
  const result = data.result;
  const classes = [...new Set(data.positions.filter((row) => row.currency === "BRL").map((row) => row.investment_class))];
  return (
    <main className="app-page">
      <PageHeader title="Benchmarks" description="Compare ativo ou classe com os índices no mesmo período, em BRL." back={{ href: "/investments", label: "Investimentos" }} />
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="grid flex-1 gap-1 text-xs font-medium">Ativo ou classe<select name="selection" defaultValue={selection} className={control}><option value="">Selecione</option>
          <optgroup label="Classes">{classes.map((item) => <option key={item} value={`class:${item}`}>{INVESTMENT_CLASS_LABELS[item]}</option>)}</optgroup>
          <optgroup label="Ativos">{data.positions.filter((row) => row.currency === "BRL").map((item) => <option key={item.id} value={`asset:${item.id}`}>{item.asset_name}</option>)}</optgroup>
        </select></label>
        <label className="grid gap-1 text-xs font-medium">De<input type="month" name="from" defaultValue={from} className={control} required /></label>
        <label className="grid gap-1 text-xs font-medium">Até<input type="month" name="to" defaultValue={to} max={last.toISOString().slice(0, 7)} className={control} required /></label>
        <button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Comparar</button>
      </form>
      {filterError ? <p role="alert" className="text-sm text-rose-700">{filterError}</p> : null}
      {data.hasError ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">Não foi possível carregar todos os históricos. Tente novamente.</p> : null}
      {!data.hasError && result.gaps.length ? <details className="rounded-xl border border-amber-200 bg-amber-50 p-4" open><summary className="cursor-pointer text-sm font-semibold">Histórico necessário para comparar</summary><p className="mt-2 text-sm">Precisamos das posições no fechamento de cada mês e dos aportes, resgates e rendimentos do período.</p><ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-xs">{result.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details> : null}
      <section className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Retorno no período</p><p className="mt-1 text-2xl font-semibold">{data.hasError ? "—" : percent(result.portfolioReturn)}</p></article>
        <article className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Retorno real, descontado o IPCA</p><p className="mt-1 text-2xl font-semibold">{data.hasError ? "—" : percent(result.realReturn)}</p></article>
      </section>
      <section className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm tabular-nums"><thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="p-3">Referência</th><th className="p-3 text-right">Retorno</th><th className="p-3 text-right">Diferença (p.p.)</th><th className="p-3">Cobertura</th></tr></thead><tbody className="divide-y">{result.comparisons.map((item) => <tr key={item.code}><td className="p-3 font-medium">{item.label}</td><td className="p-3 text-right">{data.hasError ? "—" : percent(item.returnBasisPoints)}</td><td className="p-3 text-right">{data.hasError || item.spreadBasisPoints == null ? "—" : (item.spreadBasisPoints / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td className="p-3 text-xs text-slate-500">{item.missing.length ? `${item.missing.length} meses sem referência` : "Período completo"}</td></tr>)}</tbody></table></section>
      {!data.hasError && result.points.length ? <details className="rounded-xl border bg-white p-4"><summary className="min-h-8 cursor-pointer text-sm font-semibold">Evolução acumulada mês a mês</summary><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-right text-xs tabular-nums"><thead><tr><th className="p-2 text-left">Mês</th><th className="p-2">Selecionado</th>{result.comparisons.map((item) => <th key={item.code} className="p-2">{item.label}</th>)}</tr></thead><tbody>{result.points.map((point, index) => <tr key={point.month} className="border-t"><td className="p-2 text-left">{point.month.slice(0, 7).split("-").reverse().join("/")}</td><td className="p-2 font-semibold">{percent(point.returnBasisPoints)}</td>{result.comparisons.map((item) => <td key={item.code} className="p-2">{percent(item.series[index]?.returnBasisPoints ?? null)}</td>)}</tr>)}</tbody></table></div></details> : null}
      <PageHelp title="Fontes e método">
        <p>CDI, Selic, IPCA e dólar: séries do Banco Central. Ibovespa e IFIX: histórico mensal da B3 ou fornecedor autorizado. Os dados são compartilhados, com fonte e data de sincronização.</p>
        <p className="mt-2">Retorno mensal por Dietz modificado, ponderando aportes e resgates pela data; rendimentos são incluídos. Os retornos mensais são compostos. Todas as posições da classe, inclusive liquidadas, precisam de histórico completo. Não preenchemos meses sem dados com zero.</p>
        <p className="mt-2 text-xs">Última sincronização: {data.latestSync ? new Date(data.latestSync).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "ainda não realizada"}.</p>
      </PageHelp>
    </main>
  );
}
