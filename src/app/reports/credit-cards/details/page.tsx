import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { formatMoney } from "@/domain/money";
import { getCreditCardExpenseReport } from "@/services/reports/investment-insights-service";
import type { SupportedCurrency } from "@/types/database";
import { formatIsoDatePtBr } from "@/utils/dates";

export const metadata = { title: "Lançamentos dos cartões" };

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function CreditCardReportDetailsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const month = typeof params.month === "string" && monthPattern.test(params.month) ? params.month : "";
  const currency: SupportedCurrency = params.currency === "USD" || params.currency === "EUR" ? params.currency : "BRL";
  const requestedCard = typeof params.card === "string" ? params.card : "";
  const regime = params.regime === "cash" ? "cash" : "competence";
  const report = await getCreditCardExpenseReport(currency, requestedCard || null);
  const cardId = report.cards.some((card) => card.id === requestedCard) ? requestedCard : "";
  const cardNames = new Map(report.cards.map((card) => [card.id, card.name]));
  const monthRow = report.rows.find((row) => row.month === month);
  const total = regime === "cash" ? monthRow?.cashMinor ?? 0 : monthRow?.competenceMinor ?? 0;
  const competenceEntries = report.competenceEntries.filter((row) => row.month === month).sort((a, b) => b.date.localeCompare(a.date));
  const cashEntries = report.cashEntries.filter((row) => row.month === month).sort((a, b) => b.date.localeCompare(a.date));
  const backQuery = new URLSearchParams({ currency, regime });
  if (cardId) backQuery.set("card", cardId);
  if (typeof params.from === "string" && monthPattern.test(params.from)) backQuery.set("from", params.from);
  if (typeof params.to === "string" && monthPattern.test(params.to)) backQuery.set("to", params.to);
  const label = month ? `${month.slice(5, 7)}/${month.slice(0, 4)}` : "mês inválido";

  return <main className="app-page grid gap-3 max-w-[1200px]">
    <Link href={`/reports/credit-cards?${backQuery.toString()}`} className="w-fit text-sm font-semibold text-emerald-800 hover:underline">← Voltar aos cartões</Link>
    <PageHeader title={`Cartões · ${label}`} description={regime === "cash" ? "Pagamentos em caixa" : "Compras por competência"} />
    {report.hasError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Não foi possível carregar todos os lançamentos deste mês.</p> : null}
    <section className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{regime === "cash" ? "Total pago no mês" : "Total de parcelas do mês"}</p><p className="text-2xl font-bold tabular-nums">{formatMoney(total, currency)}</p></section>
    {regime === "cash" ? <>
      <p className="text-xs text-slate-600">O total soma os pagamentos feitos no mês. As compras da fatura vinculada aparecem apenas para conferência e podem diferir do valor pago quando há pagamentos parciais, créditos ou ajustes.</p>
      <section aria-label="Pagamentos do mês" className="divide-y overflow-hidden rounded-xl border bg-white">
        {cashEntries.map((payment) => {
          const purchases = payment.invoiceId ? report.invoicePurchases.get(payment.invoiceId) ?? [] : [];
          return <div key={payment.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{cardNames.get(payment.creditCardId) ?? "Cartão"} · pagamento</p><p className="text-xs text-slate-500">{formatIsoDatePtBr(payment.date)}</p></div><strong className="tabular-nums text-rose-700">{formatMoney(payment.amountMinor, currency)}</strong></div>
            {payment.invoiceId ? <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2"><summary className="cursor-pointer font-semibold text-emerald-800">Compras da fatura ({purchases.length})</summary>
              {purchases.length ? <div className="mt-2 divide-y">{purchases.map((purchase) => <div key={purchase.id} className="flex flex-wrap justify-between gap-2 py-2"><div><p>{purchase.description} · {purchase.installmentNumber}ª parcela</p><p className="text-xs text-slate-500">Compra em {formatIsoDatePtBr(purchase.date)}</p></div><span className="tabular-nums">{formatMoney(purchase.amountMinor, currency)}</span></div>)}</div> : <p className="pt-2 text-xs text-slate-500">Nenhuma compra ativa vinculada a esta fatura.</p>}
              <Link href={`/credit-cards/${payment.creditCardId}/invoices/${payment.invoiceId}`} className="mt-2 inline-block text-xs font-semibold text-emerald-800 hover:underline">Abrir fatura →</Link>
            </details> : <p className="mt-2 text-xs text-slate-500">Pagamento sem fatura vinculada.</p>}
          </div>;
        })}
        {!cashEntries.length ? <p className="p-6 text-center text-sm text-slate-600">Nenhum pagamento neste mês.</p> : null}
      </section>
    </> : <section aria-label="Compras e parcelas do mês" className="divide-y overflow-hidden rounded-xl border bg-white">
      {competenceEntries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><div><p className="font-semibold">{entry.description}</p><p className="text-xs text-slate-500">{formatIsoDatePtBr(entry.date)} · {cardNames.get(entry.creditCardId) ?? "Cartão"} · {entry.installmentNumber}ª parcela</p></div><div className="flex items-center gap-4"><strong className={`tabular-nums ${entry.amountMinor < 0 ? "text-emerald-700" : "text-rose-700"}`}>{entry.amountMinor < 0 ? "−" : ""}{formatMoney(Math.abs(entry.amountMinor), currency)}</strong><Link href={`/credit-cards/${entry.creditCardId}/purchases/${entry.purchaseId}/edit`} className="text-xs font-semibold text-emerald-800 hover:underline">Abrir compra →</Link></div></div>)}
      {!competenceEntries.length ? <p className="p-6 text-center text-sm text-slate-600">Nenhuma compra neste mês.</p> : null}
    </section>}
  </main>;
}
