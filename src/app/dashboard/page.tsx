import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { ExpenseDistribution } from "@/components/dashboard/expense-distribution";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MonthlyEvolution } from "@/components/dashboard/monthly-evolution";
import { CONTEXT_LABELS } from "@/domain/accounts";
import { currentReferenceMonth, referenceMonthSchema } from "@/domain/budgets";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import { RECURRENCE_FREQUENCY_LABELS } from "@/domain/recurring-transactions";
import { getFinancialDashboard } from "@/services/reports/financial-dashboard-service";
import type {
  CreditCardInvoiceStatus,
  FinancialReportBasis,
} from "@/types/database";
import { formatFinancialDate } from "@/utils/financial-formatters";
import { currentIsoDate } from "@/utils/dates";

export const metadata = { title: "Visão financeira" };

const invoiceStatusLabels: Record<CreditCardInvoiceStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  overdue: "Vencida",
};

const basisLabels: Record<FinancialReportBasis, string> = {
  competence: "Competência",
  cash: "Caixa",
};

function formatReferenceMonth(referenceMonth: string) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${referenceMonth}-01T12:00:00Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; basis?: string }>;
}) {
  const params = await searchParams;
  const parsedMonth = referenceMonthSchema.safeParse(params.month);
  const referenceMonth = parsedMonth.success
    ? parsedMonth.data
    : currentReferenceMonth();
  const basis: FinancialReportBasis =
    params.basis === "cash" ? "cash" : "competence";
  const data = await getFinancialDashboard(referenceMonth, basis);
  const preferredSection = data.currencies[0];
  const today = currentIsoDate();
  const monthEnd = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  monthEnd.setUTCDate(0);
  const includeNextMonth = referenceMonth === today.slice(0, 7) && Number(today.slice(8, 10)) >= monthEnd.getUTCDate() - 6;
  const nextMonth = new Date(`${referenceMonth}-01T12:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const attentionMonths = new Set([referenceMonth, ...(includeNextMonth ? [nextMonth.toISOString().slice(0, 7)] : [])]);
  const attentionItems = preferredSection
    ? [
        ...preferredSection.invoices
          .filter((invoice) => attentionMonths.has(invoice.due_date.slice(0, 7)) && invoice.effective_status === "overdue")
          .slice(0, 2)
          .map((invoice) => ({
            label: `${invoice.credit_card_name}: fatura vencida`,
            detail: `Vencimento em ${formatFinancialDate(invoice.due_date)} · ${formatMoney(invoice.outstanding_amount_minor, invoice.currency, CURRENCY_LOCALES[invoice.currency])}`,
            href: `/credit-cards/${invoice.credit_card_id}/invoices/${invoice.id}`,
            tone: "negative" as const,
          })),
        ...preferredSection.spendingTracker
          .filter((row) => row.percentage_consumed !== null && row.percentage_consumed >= 80)
          .slice(0, 2)
          .map((row) => ({
            label: `${row.category_name}: orçamento em ${Math.round(row.percentage_consumed ?? 0)}%`,
            detail: "Revise o realizado e ajuste o planejamento se necessário.",
            href: "/budgets",
            tone: "warning" as const,
          })),
        ...preferredSection.accounts
          .filter((account) => account.projected_balance_minor < 0)
          .slice(0, 1)
          .map((account) => ({
            label: `${account.name}: saldo projetado negativo`,
            detail: `Projeção atual de ${formatMoney(account.projected_balance_minor, account.currency, CURRENCY_LOCALES[account.currency])}.`,
            href: `/accounts/${account.id}`,
            tone: "negative" as const,
          })),
        ...preferredSection.invoices
          .filter((invoice) => attentionMonths.has(invoice.due_date.slice(0, 7)) && (invoice.effective_status === "open" || invoice.effective_status === "closed") && invoice.outstanding_amount_minor > 0)
          .slice(0, 2)
          .map((invoice) => ({
            label: `${invoice.credit_card_name}: fatura a pagar`,
            detail: `Vence em ${formatFinancialDate(invoice.due_date)} · ${formatMoney(invoice.outstanding_amount_minor, invoice.currency, CURRENCY_LOCALES[invoice.currency])}`,
            href: `/credit-cards/${invoice.credit_card_id}/invoices/${invoice.id}`,
            tone: "warning" as const,
          })),
        ...preferredSection.recurrences.filter((recurrence) => attentionMonths.has(recurrence.next_occurrence.slice(0, 7))).slice(0, 1).map((recurrence) => ({
          label: `Próxima recorrência: ${recurrence.description}`,
          detail: `${formatFinancialDate(recurrence.next_occurrence)} · ${formatMoney(recurrence.amount_minor, recurrence.currency, CURRENCY_LOCALES[recurrence.currency])}`,
          href: "/recurring-transactions",
          tone: "info" as const,
        })),
      ].slice(0, 5)
    : [];

  return (
    <main className="app-page">
      <PageHeader title="Início" description={formatReferenceMonth(referenceMonth)} actions={
        <form
          method="get"
          className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        >
          <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Mês
            <input
              name="month"
              type="month"
              defaultValue={referenceMonth}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Regime
            <select
              name="basis"
              defaultValue={basis}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
            >
              <option value="competence">Competência</option>
              <option value="cash">Caixa</option>
            </select>
          </label>
          <button className="min-h-11 rounded-xl bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800">
            Aplicar
          </button>
        </form>
      } />

      {data.hasError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Parte dos indicadores não pôde ser carregada. Tente novamente antes de tomar decisões.
        </p>
      ) : null}
      {data.missingCurrencies.length ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Sem taxa de conversão para {data.missingCurrencies.join(", ")}; esses
          valores não entraram no consolidado.
        </p>
      ) : null}


      {data.currencies.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-extrabold text-slate-950">Sua visão financeira começará aqui</h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">Cadastre uma conta para acompanhar os indicadores mensais.</p>
          <Link href="/accounts" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 font-semibold text-white">Cadastrar conta</Link>
        </section>
      ) : null}

      {data.currencies.map((section) => {
        const locale = CURRENCY_LOCALES[section.currency];
        const month = section.selectedMonth;
        return (
          <section key={section.currency} aria-labelledby="consolidated-dashboard" className="grid gap-4">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 id="consolidated-dashboard" className="text-xl font-black text-slate-950">Resumo consolidado</h2>
              <p className="text-sm text-slate-600">
                Patrimônio líquido: <strong className={section.netWorthMinor < 0 ? "text-rose-700" : "text-emerald-800"}>{formatMoney(section.netWorthMinor, section.currency, locale)}</strong>
              </p>
            </header>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard label="Saldo disponível" value={formatMoney(section.accountBalanceMinor, section.currency, locale)} helper={`${section.accounts.length} conta(s) ativa(s)`} tone={section.accountBalanceMinor < 0 ? "negative" : "neutral"} />
              <MetricCard label="Receitas" value={formatMoney(month.income_amount_minor, section.currency, locale)} helper="Valores realizados no mês" tone="positive" />
              <MetricCard label={basis === "cash" ? "Saídas de caixa" : "Despesas de consumo"} value={formatMoney(month.expense_amount_minor, section.currency, locale)} helper={basis === "cash" ? "Inclui pagamentos de fatura" : "Inclui parcelas por competência"} tone="negative" />
              <MetricCard label="Resultado" value={formatMoney(month.result_amount_minor, section.currency, locale)} helper={`${basisLabels[basis]} do mês`} tone={month.result_amount_minor < 0 ? "negative" : "positive"} />
            </div>

            {section === preferredSection ? (
      <section aria-labelledby="attention-title" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="attention-title" className="text-base font-semibold text-slate-950">Sua atenção · {formatReferenceMonth(referenceMonth)}{includeNextMonth ? " e próximo mês" : ""}</h2>
          <Link href="/data-quality" className="text-xs font-bold text-emerald-700 hover:underline">Central de qualidade</Link>
        </div>
        {attentionItems.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{attentionItems.map((item) => <Link key={`${item.href}:${item.label}`} href={item.href} className={`rounded-xl border px-3 py-2.5 transition hover:border-slate-400 ${item.tone === "negative" ? "border-rose-200 bg-rose-50" : item.tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><p className="text-sm font-bold text-slate-950">{item.label}</p><p className="mt-0.5 text-xs text-slate-600">{item.detail}</p></Link>)}</div> : <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">Nenhuma ação identificada nos dados disponíveis.</p>}
      </section>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <MonthlyEvolution rows={section.evolution} currency={section.currency} locale={locale} basis={basis} />
              <ExpenseDistribution rows={section.categories} currency={section.currency} locale={locale} basis={basis} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div><h3 className="font-black text-slate-950">Contas</h3></div>
                  <Link href="/accounts" className="text-sm font-bold text-emerald-700 hover:underline">Ver todas</Link>
                </div>
                {section.accounts.length ? (
                  <div className="divide-y divide-slate-100">
                    {section.accounts.slice(0, 5).map((account) => (
                      <Link key={account.id} href={`/accounts/${account.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-emerald-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                        <div className="min-w-0"><p className="truncate font-bold text-slate-900">{account.name}</p><p className="text-xs text-slate-500">{CONTEXT_LABELS[account.context]}</p></div>
                        <p className={`shrink-0 font-extrabold ${account.current_balance_minor < 0 ? "text-rose-700" : "text-slate-950"}`}>{formatMoney(account.current_balance_minor, section.currency, locale)}</p>
                      </Link>
                    ))}
                  </div>
                ) : <p className="p-5 text-sm text-slate-600">Nenhuma conta ativa.</p>}
              </section>

              <section className="grid gap-4">
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-950">Próximas recorrências</h3><Link href="/recurring-transactions" className="text-sm font-bold text-emerald-700">Ver todas</Link></div>
                  {section.recurrences.length ? <div className="mt-3 divide-y divide-slate-100">{section.recurrences.slice(0, 3).map((row) => <div key={row.id} className="flex justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{row.description}</p><p className="text-xs text-slate-500">{formatFinancialDate(row.next_occurrence)} · {RECURRENCE_FREQUENCY_LABELS[row.frequency]}</p></div><p className={`shrink-0 text-sm font-bold ${row.transaction_type === "income" ? "text-emerald-700" : "text-rose-700"}`}>{row.transaction_type === "income" ? "+" : "−"}{formatMoney(row.amount_minor, section.currency, locale)}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-600">Nenhuma recorrência próxima.</p>}
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-950">Faturas pendentes</h3><Link href="/credit-cards" className="text-sm font-bold text-emerald-700">Ver cartões</Link></div>
                  {section.invoices.length ? <div className="mt-3 divide-y divide-slate-100">{section.invoices.slice(0, 3).map((invoice) => <Link key={invoice.id} href={`/credit-cards/${invoice.credit_card_id}/invoices/${invoice.id}`} className="flex justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{invoice.credit_card_name}</p><p className={`text-xs ${invoice.effective_status === "overdue" ? "text-rose-700" : "text-slate-500"}`}>{invoiceStatusLabels[invoice.effective_status]} · {formatFinancialDate(invoice.due_date)}</p></div><p className="shrink-0 text-sm font-bold text-slate-950">{formatMoney(invoice.outstanding_amount_minor, section.currency, locale)}</p></Link>)}</div> : <p className="mt-3 text-sm text-slate-600">Nenhuma fatura pendente.</p>}
                </article>
              </section>
            </div>

          </section>
        );
      })}
    </main>
  );
}
