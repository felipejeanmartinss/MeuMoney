import { PageHeader } from "@/components/layout/page-header";
import { formatMoney } from "@/domain/money";
import { getCreditCardExpenseReport } from "@/services/reports/investment-insights-service";
import type { SupportedCurrency } from "@/types/database";

export const metadata = { title: "Gastos com cartões" };

export default async function CreditCardsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const currency: SupportedCurrency = params.currency === "USD" || params.currency === "EUR" ? params.currency : "BRL";
  const cardId = typeof params.card === "string" && params.card ? params.card : null;
  const data = await getCreditCardExpenseReport(currency, cardId);
  const from = typeof params.from === "string" && /^\d{4}-\d{2}$/.test(params.from) ? params.from : "";
  const to = typeof params.to === "string" && /^\d{4}-\d{2}$/.test(params.to) ? params.to : "";
  const rows = data.rows.filter((row) => (!from || row.month >= from) && (!to || row.month <= to));
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.competenceMinor, row.cashMinor]));
  const totalCompetence = rows.reduce((sum, row) => sum + row.competenceMinor, 0);
  const totalCash = rows.reduce((sum, row) => sum + row.cashMinor, 0);
  return <main className="app-page max-w-[1500px]">
    <PageHeader title="Cartões de crédito · competência e caixa" />
    <form className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[100px_minmax(0,1fr)_140px_140px_auto] sm:items-end">
      <label className="grid gap-1 text-xs font-semibold">Moeda<select name="currency" defaultValue={currency} className="h-10 rounded-lg border px-2"><option>BRL</option><option>USD</option><option>EUR</option></select></label>
      <label className="grid gap-1 text-xs font-semibold">Cartão<select name="card" defaultValue={data.cards.some((card) => card.id === cardId) ? cardId! : ""} className="h-10 min-w-0 rounded-lg border px-2"><option value="">Todos</option>{data.cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">De<input name="from" type="month" defaultValue={from} className="h-10 rounded-lg border px-2" /></label>
      <label className="grid gap-1 text-xs font-semibold">Até<input name="to" type="month" defaultValue={to} className="h-10 rounded-lg border px-2" /></label>
      <button className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Aplicar</button>
    </form>
    {data.hasError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Não foi possível carregar todo o histórico dos cartões.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Gastos por competência</p><p className="text-xl font-bold">{formatMoney(totalCompetence, currency)}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">Pagamentos efetivos (caixa)</p><p className="text-xl font-bold">{formatMoney(totalCash, currency)}</p></div></div>
    <section className="overflow-hidden rounded-xl border bg-white"><h2 className="px-4 py-3 font-semibold">Gastos e pagamentos por mês</h2><div className="max-h-[28rem] space-y-3 overflow-y-auto px-4 pb-4">{rows.map((row) => <div key={row.month} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3"><span className="text-xs font-semibold">{row.month.slice(5, 7)}/{row.month.slice(0, 4)}</span><div className="grid gap-1"><div className="flex items-center gap-2"><div className="h-3 min-w-0 rounded-sm bg-emerald-600" style={{ width: `${Math.max(0, row.competenceMinor / maximum * 100)}%` }} /><span className="text-xs tabular-nums">{formatMoney(row.competenceMinor, currency)}</span></div><div className="flex items-center gap-2"><div className="h-3 min-w-0 rounded-sm bg-blue-600" style={{ width: `${Math.max(0, row.cashMinor / maximum * 100)}%` }} /><span className="text-xs tabular-nums">{formatMoney(row.cashMinor, currency)}</span></div></div></div>)}{!rows.length ? <p className="text-sm text-slate-500">Nenhum gasto ou pagamento neste período.</p> : null}</div><p className="flex justify-center gap-4 border-t px-4 py-2 text-xs"><span className="text-emerald-700">● Competência (fatura)</span><span className="text-blue-700">● Caixa (pagamento)</span></p>
      <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead className="bg-slate-100 text-left"><tr><th className="px-3 py-2">Mês</th><th className="px-3 py-2 text-right">Competência</th><th className="px-3 py-2 text-right">Caixa</th></tr></thead><tbody>{rows.map((row) => <tr key={row.month} className="border-t"><td className="px-3 py-2">{row.month.slice(5, 7)}/{row.month.slice(0, 4)}</td><td className="px-3 py-2 text-right">{formatMoney(row.competenceMinor, currency)}</td><td className="px-3 py-2 text-right">{formatMoney(row.cashMinor, currency)}</td></tr>)}</tbody></table></div>
    </section>
    <p className="text-xs text-slate-500">Competência usa as parcelas das faturas e ignora compras canceladas. Caixa usa pagamentos efetivamente registrados, sem duplicar as compras como saída bancária.</p>
  </main>;
}
