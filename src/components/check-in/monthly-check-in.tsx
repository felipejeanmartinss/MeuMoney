import Link from "next/link";
import { closeMonthlyCheckin } from "@/app/actions/monthly-checkins";
import { PageHeader, PageHelp } from "@/components/layout/page-header";
import type { MonthlyCheckinData } from "@/services/finance/monthly-checkins-service";
import { formatIsoDatePtBr } from "@/utils/dates";

const messages = {
  closed: "Fechamento mensal confirmado.",
  error: "Não foi possível concluir o check-in.",
};

export function MonthlyCheckIn({
  data, month, messageCode,
}: {
  data: MonthlyCheckinData;
  month: string;
  messageCode?: string;
}) {
  const { checklist, checkin } = data;
  const done = checkin?.status === "closed";
  const steps = [
    {
      title: "Classificar lançamentos",
      detail: "Sem categoria",
      help: "Revise as categorias dos lançamentos deste mês.",
      count: checklist.unclassifiedCount,
      href: "/transactions",
      items: checklist.unclassifiedItems.map((item) => ({ label: item.description, detail: `${item.accountName} · ${formatIsoDatePtBr(item.date)}`, href: `/transactions/${item.id}/edit` })),
    },
    {
      title: "Conferir extratos",
      detail: "Não reconciliados",
      help: "Confirme as movimentações que já conferiu no extrato.",
      count: checklist.unreconciledCount,
      href: "/accounts",
      items: checklist.unreconciledItems.map((item) => ({ label: item.description, detail: `${item.accountName} · ${formatIsoDatePtBr(item.date)}`, href: `/accounts/${item.accountId}` })),
    },
    {
      title: "Revisar vencimentos",
      detail: `${checklist.upcomingInvoices.length} fatura${checklist.upcomingInvoices.length === 1 ? "" : "s"} · ${checklist.upcomingRecurrencesCount} recorrência${checklist.upcomingRecurrencesCount === 1 ? "" : "s"}`,
      help: "Confira faturas dos próximos 45 dias e recorrências dos próximos 30 dias.",
      count: checklist.upcomingInvoices.length + checklist.upcomingRecurrencesCount,
      href: "/recurring-transactions",
      items: [
        ...checklist.upcomingInvoices.map((item) => ({ label: `Fatura ${item.credit_card_name}`, detail: formatIsoDatePtBr(item.due_date), href: `/credit-cards/${item.credit_card_id}/invoices/${item.id}` })),
        ...checklist.upcomingRecurrences.map((item) => ({ label: item.description, detail: `${item.accountName} · ${formatIsoDatePtBr(item.date)}`, href: "/recurring-transactions" })),
      ],
    },
    {
      title: "Revisar orçamento",
      detail: "Categorias a partir de 80% do planejado",
      help: "Revise as categorias que atingiram 80% ou ultrapassaram o orçamento.",
      count: checklist.overBudget.length,
      href: "/budgets",
      items: checklist.overBudget.map((item) => ({ label: item.category_name, detail: `${Math.round(item.percentage_consumed)}% do planejado`, href: `/budgets?month=${month}` })),
    },
    {
      title: "Atualizar posições",
      detail: "Cotações com mais de 30 dias",
      help: "Confira as posições que estão sem atualização há mais de 30 dias.",
      count: checklist.staleQuotes.length,
      href: "/investments/prices",
      items: checklist.staleQuotes.map((item) => ({ label: item.asset_name, detail: `Última posição: ${formatIsoDatePtBr(item.position_date)}`, href: `/investments/${item.id}/history` })),
    },
  ];
  const attentionCount = steps.filter((step) => step.count > 0).length;
  const message = messages[messageCode as keyof typeof messages];

  return (
    <main className="app-page max-w-4xl">
      <PageHeader
        title="Check-in"
        actions={
          <form method="get" className="flex w-full items-center gap-2 sm:w-auto">
            <label htmlFor="check-in-month" className="sr-only">Mês do check-in</label>
            <input id="check-in-month" type="month" name="month" required defaultValue={month}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            <button className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">Abrir</button>
          </form>
        }
      />
      {message ? (
        <p role={messageCode === "error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${messageCode === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {message}
        </p>
      ) : null}
      {data.hasError ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Verificação parcial: alguns dados não carregaram. Confira os módulos antes de fechar o mês.
        </p>
      ) : null}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Revisão mensal">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="font-semibold text-slate-950">Revisão do mês</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {data.hasError ? "Resultado parcial" : attentionCount ? `${attentionCount} etapa${attentionCount === 1 ? "" : "s"} para revisar` : "Nenhuma pendência encontrada"}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${done ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            {done ? "Mês fechado" : "Em aberto"}
          </span>
        </div>
        <ol className="divide-y divide-slate-100">
          {steps.map((step, index) => (
            <li key={step.title}>
              <details className="group">
              <summary aria-label={`${step.title}: ${step.count}. ${step.help}`} className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${step.count > 0 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{step.detail}</p>
                </div>
                <span className="text-base font-semibold tabular-nums text-slate-800">{step.count}</span>
                <span aria-hidden="true" className="text-slate-400 group-open:rotate-90">▸</span>
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-sm">
                {step.items.length ? <ul className="divide-y divide-slate-100">
                  {step.items.map((item, itemIndex) => <li key={`${item.href}-${itemIndex}`}>
                    <Link href={item.href} className="flex min-h-10 items-center justify-between gap-3 py-2 text-emerald-800 hover:underline">
                      <span className="font-medium text-slate-900">{item.label}<span className="block text-xs font-normal text-slate-500">{item.detail}</span></span><span aria-hidden="true">→</span>
                    </Link>
                  </li>)}
                </ul> : <p className="py-2 text-slate-600">Nenhuma pendência nesta etapa.</p>}
                <Link href={step.href} className="inline-flex min-h-9 items-center font-semibold text-emerald-800 hover:underline">Abrir área completa →</Link>
              </div>
              </details>
            </li>
          ))}
        </ol>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Fechamento mensal">
        {done ? (
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Observação do fechamento</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
              {checkin?.observation || "Nenhuma observação registrada."}
            </p>
          </div>
        ) : (
          <form action={closeMonthlyCheckin} className="grid gap-3">
            <input type="hidden" name="referenceMonth" value={data.referenceMonth} />
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-slate-700">
                Adicionar observação (opcional)
              </summary>
              <label htmlFor="check-in-observation" className="mb-2 block text-xs text-slate-500">
                A nota fica salva no check-in deste mês.
              </label>
              <textarea id="check-in-observation" name="observation" rows={3} maxLength={2000}
                placeholder="Decisões ou próximos passos."
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
            </details>
            <button className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:justify-self-end">
              Confirmar fechamento
            </button>
          </form>
        )}
      </section>
      <PageHelp title="O que revisar?">
        <ul className="grid gap-2">
          {steps.map((step) => <li key={step.title}><strong>{step.title}:</strong> {step.help}</li>)}
        </ul>
        <p className="mt-3">O fechamento registra sua revisão. Ele não bloqueia alterações nos lançamentos.</p>
      </PageHelp>
    </main>
  );
}
