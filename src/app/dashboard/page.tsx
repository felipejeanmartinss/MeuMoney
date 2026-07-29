import Link from "next/link";
import { ExpenseDistribution } from "@/components/dashboard/expense-distribution";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MonthlyEvolution } from "@/components/dashboard/monthly-evolution";
import { SpendingTracker } from "@/components/dashboard/spending-tracker";
import { CONTEXT_LABELS } from "@/domain/accounts";
import {
  currentReferenceMonth,
  referenceMonthSchema,
} from "@/domain/budgets";
import {
  CURRENCY_LABELS,
  CURRENCY_LOCALES,
} from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import { RECURRENCE_FREQUENCY_LABELS } from "@/domain/recurring-transactions";
import { getFinancialDashboard } from "@/services/reports/financial-dashboard-service";
import { formatFinancialDate } from "@/utils/financial-formatters";
import type { CreditCardInvoiceStatus } from "@/types/database";

export const metadata = { title: "Visão financeira" };

const invoiceStatusLabels: Record<CreditCardInvoiceStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  overdue: "Vencida",
};

function formatReferenceMonth(referenceMonth: string) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${referenceMonth}-01T12:00:00Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatPercentage(value: number | null) {
  return value === null
    ? "Sem orçamento"
    : `${value.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })}%`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const parsedMonth = referenceMonthSchema.safeParse(params.month);
  const referenceMonth = parsedMonth.success
    ? parsedMonth.data
    : currentReferenceMonth();
  const data = await getFinancialDashboard(referenceMonth);
  const firstName =
    data.profile?.full_name?.trim().split(/\s+/)[0] || "bem-vindo";

  return (
    <main className="mx-auto grid max-w-7xl gap-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="grid gap-5 rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-900 to-slate-950 p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-9 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">
            Visão financeira
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Olá, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-emerald-100">
            Uma leitura consolidada de {formatReferenceMonth(referenceMonth)},
            sempre separada por moeda.
          </p>
        </div>
        <form
          method="get"
          className="grid gap-2 rounded-2xl bg-white/10 p-3 backdrop-blur"
        >
          <label
            htmlFor="dashboard-month"
            className="text-xs font-bold uppercase tracking-wider text-emerald-100"
          >
            Mês de referência
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="dashboard-month"
              name="month"
              type="month"
              defaultValue={referenceMonth}
              className="min-h-11 rounded-xl border border-white/30 bg-white px-3 text-slate-950"
            />
            <button className="min-h-11 rounded-xl bg-white px-4 font-bold text-emerald-800 hover:bg-emerald-50">
              Atualizar
            </button>
          </div>
        </form>
      </section>

      {data.hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Parte dos indicadores não pôde ser carregada. Confirme a migration da
          Sprint 7 e tente novamente.
        </p>
      ) : null}

      {data.currencies.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-xl font-extrabold text-slate-950">
            Sua visão financeira começará aqui
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">
            Cadastre uma conta ou defina sua moeda preferida para acompanhar os
            indicadores mensais.
          </p>
          <Link
            href="/accounts"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800"
          >
            Cadastrar conta
          </Link>
        </section>
      ) : null}

      {data.currencies.map((section) => {
        const locale = CURRENCY_LOCALES[section.currency];
        const month = section.selectedMonth;
        const resultTone =
          month.result_amount_minor < 0 ? "negative" : "positive";
        const budgetHelper =
          month.planned_amount_minor === 0
            ? "Defina o planejamento mensal para comparar."
            : `${formatMoney(
                month.expense_amount_minor,
                section.currency,
                locale,
              )} de ${formatMoney(
                month.planned_amount_minor,
                section.currency,
                locale,
              )}`;

        return (
          <section
            key={section.currency}
            aria-labelledby={`currency-${section.currency}`}
            className="grid gap-5"
          >
            <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">
                  {section.currency}
                </p>
                <h2
                  id={`currency-${section.currency}`}
                  className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl"
                >
                  {CURRENCY_LABELS[section.currency]}
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                Valores desta seção nunca são somados a outras moedas.
              </p>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Saldo atual"
                value={formatMoney(
                  section.accountBalanceMinor,
                  section.currency,
                  locale,
                )}
                helper={`${section.accounts.length} conta(s) ativa(s)`}
                tone={
                  section.accountBalanceMinor < 0 ? "negative" : "neutral"
                }
              />
              <MetricCard
                label="Receitas do mês"
                value={formatMoney(
                  month.income_amount_minor,
                  section.currency,
                  locale,
                )}
                helper="Somente valores realizados"
                tone="positive"
              />
              <MetricCard
                label="Despesas de consumo"
                value={formatMoney(
                  month.expense_amount_minor,
                  section.currency,
                  locale,
                )}
                helper="Sem transferências ou pagamento de fatura"
                tone="negative"
              />
              <MetricCard
                label="Resultado mensal"
                value={formatMoney(
                  month.result_amount_minor,
                  section.currency,
                  locale,
                )}
                helper="Receitas menos despesas de consumo"
                tone={resultTone}
              />
              <MetricCard
                label="Patrimônio líquido"
                value={formatMoney(
                  section.netWorthMinor,
                  section.currency,
                  locale,
                )}
                helper="Contas + patrimônio e investimentos − passivos e faturas"
                tone={section.netWorthMinor < 0 ? "negative" : "positive"}
              />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-950">
                    Saldo por conta
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Posição atual das contas ativas.
                  </p>
                </div>
                <Link
                  href="/accounts"
                  className="text-sm font-semibold text-emerald-700 hover:underline"
                >
                  Ver contas
                </Link>
              </div>
              {section.accounts.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.accounts.map((account) => (
                    <article
                      key={account.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">
                            {account.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {CONTEXT_LABELS[account.context]}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 font-extrabold ${
                            account.current_balance_minor < 0
                              ? "text-rose-700"
                              : "text-slate-950"
                          }`}
                        >
                          {formatMoney(
                            account.current_balance_minor,
                            section.currency,
                            locale,
                          )}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  Nenhuma conta ativa nesta moeda.
                </p>
              )}
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <MonthlyEvolution
                rows={section.evolution}
                currency={section.currency}
                locale={locale}
              />
              <ExpenseDistribution
                rows={section.categories}
                currency={section.currency}
                locale={locale}
              />
            </div>

            <SpendingTracker
              rows={section.spendingTracker}
              currency={section.currency}
              locale={locale}
            />

            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Orçamento consumido no mês:{" "}
              <strong
                className={
                  (month.budget_percentage_consumed ?? 0) > 100
                    ? "text-rose-700"
                    : "text-slate-950"
                }
              >
                {formatPercentage(month.budget_percentage_consumed)}
              </strong>
              {" · "}
              {budgetHelper}
            </p>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">
                      Próximas recorrências
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Próximas ocorrências ativas a partir de hoje.
                    </p>
                  </div>
                  <Link
                    href="/recurring-transactions"
                    className="text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    Ver todas
                  </Link>
                </div>
                {section.recurrences.length ? (
                  <div className="mt-5 divide-y divide-slate-100">
                    {section.recurrences.map((recurrence) => (
                      <article
                        key={recurrence.id}
                        className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {recurrence.description}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatFinancialDate(
                              recurrence.next_occurrence,
                            )}{" "}
                            · {RECURRENCE_FREQUENCY_LABELS[recurrence.frequency]}{" "}
                            · {recurrence.account_name}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 font-bold ${
                            recurrence.transaction_type === "income"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {recurrence.transaction_type === "income" ? "+" : "-"}
                          {formatMoney(
                            recurrence.amount_minor,
                            section.currency,
                            locale,
                          )}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Nenhuma recorrência futura nesta moeda.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-950">
                      Faturas abertas ou vencidas
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Faturas ainda não pagas, ordenadas pelo vencimento.
                    </p>
                  </div>
                  <Link
                    href="/credit-cards"
                    className="text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    Ver cartões
                  </Link>
                </div>
                {section.invoices.length ? (
                  <div className="mt-5 divide-y divide-slate-100">
                    {section.invoices.map((invoice) => (
                      <article
                        key={invoice.id}
                        className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-slate-900">
                              {invoice.credit_card_name}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                invoice.effective_status === "overdue"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {
                                invoiceStatusLabels[
                                  invoice.effective_status
                                ]
                              }
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Vence em {formatFinancialDate(invoice.due_date)}
                          </p>
                        </div>
                        <p className="shrink-0 font-bold text-slate-950">
                          {formatMoney(
                            invoice.outstanding_amount_minor,
                            section.currency,
                            locale,
                          )}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Nenhuma fatura pendente nesta moeda.
                  </p>
                )}
              </section>
            </div>
          </section>
        );
      })}
    </main>
  );
}
