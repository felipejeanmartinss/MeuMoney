import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CreditCardMonthlyColumnChart } from "@/components/reports/credit-card-monthly-column-chart";
import { formatMoney } from "@/domain/money";
import { getCreditCardExpenseReport } from "@/services/reports/investment-insights-service";
import type { SupportedCurrency } from "@/types/database";

export const metadata = { title: "Gastos com cartões" };

type Regime = "competence" | "cash";

export default async function CreditCardsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const currency: SupportedCurrency = params.currency === "USD" || params.currency === "EUR" ? params.currency : "BRL";
  const cardId = typeof params.card === "string" && params.card ? params.card : null;
  const regime: Regime = params.regime === "cash" ? "cash" : "competence";
  const from = typeof params.from === "string" && /^\d{4}-\d{2}$/.test(params.from) ? params.from : "";
  const to = typeof params.to === "string" && /^\d{4}-\d{2}$/.test(params.to) ? params.to : "";
  const data = await getCreditCardExpenseReport(currency, cardId);
  const selectedCardId = data.cards.some((card) => card.id === cardId) ? cardId : null;
  const rows = data.rows.filter((row) => (!from || row.month >= from) && (!to || row.month <= to));
  const selectedRows = rows.map((row) => ({ month: row.month, amountMinor: regime === "cash" ? row.cashMinor : row.competenceMinor }));
  const total = selectedRows.reduce((sum, row) => sum + row.amountMinor, 0);
  const title = regime === "cash" ? "Pagamentos em caixa" : "Gastos por competência";
  const regimeHref = (nextRegime: Regime) => {
    const query = new URLSearchParams({ currency, regime: nextRegime });
    if (selectedCardId) query.set("card", selectedCardId);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    return `/reports/credit-cards?${query.toString()}`;
  };
  const monthHref = (month: string) => {
    const query = new URLSearchParams({ month, currency, regime });
    if (selectedCardId) query.set("card", selectedCardId);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    return `/reports/credit-cards/details?${query.toString()}`;
  };

  return <main className="app-page max-w-[1500px]">
    <PageHeader title="Gastos com cartões" />
    <form method="get" className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[100px_minmax(0,1fr)_140px_140px_auto] sm:items-end">
      <input type="hidden" name="regime" value={regime} />
      <label className="grid gap-1 text-xs font-semibold">Moeda<select name="currency" defaultValue={currency} className="h-10 rounded-lg border px-2"><option>BRL</option><option>USD</option><option>EUR</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Cartão<select name="card" defaultValue={selectedCardId ?? ""} className="h-10 min-w-0 rounded-lg border px-2"><option value="">Todos</option>{data.cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">De<input name="from" type="month" defaultValue={from} className="h-10 rounded-lg border px-2" /></label>
      <label className="grid gap-1 text-xs font-semibold">Até<input name="to" type="month" defaultValue={to} className="h-10 rounded-lg border px-2" /></label>
      <button className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Aplicar</button>
    </form>
    {data.hasError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Não foi possível carregar todo o histórico dos cartões.</p> : null}
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <nav aria-label="Regime do relatório" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm font-semibold">
          <Link href={regimeHref("competence")} aria-current={regime === "competence" ? "page" : undefined} className={`rounded-md px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${regime === "competence" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-700 hover:bg-white"}`}>Competência</Link>
          <Link href={regimeHref("cash")} aria-current={regime === "cash" ? "page" : undefined} className={`rounded-md px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${regime === "cash" ? "bg-blue-700 text-white shadow-sm" : "text-slate-700 hover:bg-white"}`}>Caixa</Link>
        </nav>
        <div className="text-left sm:text-right"><p className="text-xs text-slate-500">{title}</p><p className="text-xl font-bold tabular-nums">{formatMoney(total, currency)}</p></div>
      </div>
      <h2 className="px-4 pt-4 text-sm font-semibold">{title} por mês</h2>
      <CreditCardMonthlyColumnChart rows={selectedRows} currency={currency} label={`Gráfico de colunas: ${title.toLowerCase()} por mês. Clique na barra para ver os lançamentos.`} color={regime === "cash" ? "#2563eb" : "#059669"} monthHref={monthHref} />
      <div className="overflow-x-auto border-t"><table className="w-full min-w-[320px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="px-4 py-2">Mês</th><th className="px-4 py-2 text-right">{title}</th></tr></thead><tbody>{selectedRows.map((row) => <tr key={row.month} className="border-t"><td className="px-4 py-2"><Link href={monthHref(row.month)} className="font-semibold text-emerald-800 hover:underline">{row.month.slice(5, 7)}/{row.month.slice(0, 4)} →</Link></td><td className="px-4 py-2 text-right tabular-nums"><Link href={monthHref(row.month)} className="hover:underline" aria-label={`Ver lançamentos de ${row.month.slice(5, 7)}/${row.month.slice(0, 4)}`}>{formatMoney(row.amountMinor, currency)}</Link></td></tr>)}</tbody></table>{!selectedRows.length ? <p className="p-4 text-sm text-slate-500">Nenhum gasto ou pagamento neste período.</p> : null}</div>
    </section>
    <p className="text-xs text-slate-500">Competência considera a primeira parcela no mês da compra e as seguintes nos meses posteriores. Caixa considera pagamentos registrados. Clique em um mês para conferir os itens.</p>
  </main>;
}
