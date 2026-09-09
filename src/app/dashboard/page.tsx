import Link from "next/link";
import { ExpenseDistribution } from "@/components/dashboard/expense-distribution";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MonthlyEvolution } from "@/components/dashboard/monthly-evolution";
import { CONTEXT_LABELS } from "@/domain/accounts";
import { currentReferenceMonth, referenceMonthSchema } from "@/domain/budgets";
import { CURRENCY_LABELS, CURRENCY_LOCALES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import { RECURRENCE_FREQUENCY_LABELS } from "@/domain/recurring-transactions";
import { getFinancialDashboard } from "@/services/reports/financial-dashboard-service";
import type {
  CreditCardInvoiceStatus,
  FinancialReportBasis,
} from "@/types/database";
import { formatFinancialDate } from "@/utils/financial-formatters";

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
  const firstName = data.profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Visão financeira
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {formatReferenceMonth(referenceMonth)}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {firstName ? `${firstName}, acompanhe` : "Acompanhe"} saldos, resultado e compromissos.
          </p>
        </div>
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
      </header>

      {data.hasError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Parte dos indicadores não pôde ser carregada. Confirme a migration desta feature e tente novamente.
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
          <section key={section.currency} aria-labelledby={`currency-${section.currency}`} className="grid gap-4">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">{section.currency}</p>
                <h2 id={`currency-${section.currency}`} className="mt-1 text-2xl font-black text-slate-950">{CURRENCY_LABELS[section.currency]}</h2>
              </div>
              <p className="text-sm text-slate-600">
                Patrimônio líquido: <strong className={section.netWorthMinor < 0 ? "text-rose-700" : "text-emerald-800"}>{formatMoney(section.netWorthMinor, section.currency, locale)}</strong>
              </p>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Saldo disponível" value={formatMoney(section.accountBalanceMinor, section.currency, locale)} helper={`${section.accounts.length} conta(s) ativa(s)`} tone={section.accountBalanceMinor < 0 ? "negative" : "neutral"} />
              <MetricCard label="Receitas" value={formatMoney(month.income_amount_minor, section.currency, locale)} helper="Valores realizados no mês" tone="positive" />
              <MetricCard label={basis === "cash" ? "Saídas de caixa" : "Despesas de consumo"} value={formatMoney(month.expense_amount_minor, section.currency, locale)} helper={basis === "cash" ? "Inclui pagamentos de fatura" : "Inclui parcelas por competência"} tone="negative" />
              <MetricCard label="Resultado" value={formatMoney(month.result_amount_minor, section.currency, locale)} helper={`${basisLabels[basis]} do mês`} tone={month.result_amount_minor < 0 ? "negative" : "positive"} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <MonthlyEvolution rows={section.evolution} currency={section.currency} locale={locale} basis={basis} />
              <ExpenseDistribution rows={section.categories} currency={section.currency} locale={locale} basis={basis} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div><h3 className="font-black text-slate-950">Contas</h3><p className="mt-1 text-sm text-slate-600">Saldos atuais e acesso ao extrato.</p></div>
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
                ) : <p className="p-5 text-sm text-slate-600">Nenhuma conta ativa nesta moeda.</p>}
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
