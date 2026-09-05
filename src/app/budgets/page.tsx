import Link from "next/link";
import { copyPreviousMonthBudgets } from "@/app/actions/budgets";
import { AnnualBudgetForm } from "@/components/forms/annual-budget-form";
import { MonthlyBudgetForm } from "@/components/forms/monthly-budget-form";
import { CONTEXT_LABELS, FINANCIAL_CONTEXTS } from "@/domain/accounts";
import {
  budgetFilterSchema,
  currentReferenceMonth,
  summarizeBudgetProgress,
  toReferenceMonth,
} from "@/domain/budgets";
import { getCategoryDisplayName } from "@/domain/categories";
import {
  CURRENCY_LABELS,
  CURRENCY_LOCALES,
  SUPPORTED_CURRENCIES,
} from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import {
  getCurrentUserAnnualBudget,
  getCurrentUserMonthlyBudget,
} from "@/services/finance/budgets-service";
import type { MonthlyBudgetProgress } from "@/types/database";

export const metadata = { title: "Orçamentos" };

const messages: Record<string, string> = {
  saved: "Orçamento atualizado com sucesso.",
  "copy-error": "Não foi possível copiar o orçamento anterior.",
};

function formatPercentage(value: number | null) {
  return value === null
    ? "—"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function toSummaryRows(rows: MonthlyBudgetProgress[]) {
  return rows.map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    plannedAmountMinor: row.planned_amount_minor,
    realizedAmountMinor: row.realized_amount_minor,
    availableAmountMinor: row.available_amount_minor,
    percentageConsumed: row.percentage_consumed,
  }));
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    month?: string;
    year?: string;
    context?: string;
    currency?: string;
    message?: string;
    count?: string;
  }>;
}) {
  const params = await searchParams;
  const currentMonth = currentReferenceMonth();
  const parsedFilters = budgetFilterSchema.safeParse({
    month: params.month ?? currentMonth,
    context: params.context ?? "personal",
    currency: params.currency ?? "BRL",
  });
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        month: currentMonth,
        context: "personal" as const,
        currency: "BRL" as const,
      };
  const parsedYear = Number(params.year ?? filters.month.slice(0, 4));
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2200
      ? parsedYear
      : Number(currentMonth.slice(0, 4));
  const view = params.view === "annual" ? "annual" : "monthly";
  const budgetData =
    view === "annual"
      ? await getCurrentUserAnnualBudget({
          year,
          context: filters.context,
          currency: filters.currency,
        })
      : await getCurrentUserMonthlyBudget({
          referenceMonth: toReferenceMonth(filters.month),
          context: filters.context,
          currency: filters.currency,
        });
  const { categories, progress, hasError } = budgetData;
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const progressByCategory = new Map(
    progress.map((row) => [row.category_id, row]),
  );
  const annualProgressByCell = new Map(
    progress.map((row) => [
      `${row.category_id}|${row.reference_month}`,
      row.planned_amount_minor,
    ]),
  );
  const expenseSummary = summarizeBudgetProgress(
    toSummaryRows(progress.filter((row) => row.category_kind === "expense")),
  );
  const incomeSummary = summarizeBudgetProgress(
    toSummaryRows(progress.filter((row) => row.category_kind === "income")),
  );
  const feedback =
    params.message === "copied"
      ? `${Number(params.count ?? 0)} orçamento(s) copiado(s) do mês anterior.`
      : params.message
        ? messages[params.message]
        : undefined;
  const feedbackIsError = params.message === "copy-error";
  const locale = CURRENCY_LOCALES[filters.currency];
  const commonQuery = {
    context: filters.context,
    currency: filters.currency,
  };
  const monthlyHref = `/budgets?${new URLSearchParams({
    ...commonQuery,
    month: filters.month,
  }).toString()}`;
  const annualHref = `/budgets?${new URLSearchParams({
    ...commonQuery,
    view: "annual",
    year: String(year),
  }).toString()}`;
  const orderedCategories = categories
    .map((category) => ({
      ...category,
      displayName: getCategoryDisplayName(category, categories),
    }))
    .sort(
      (left, right) =>
        (left.kind === right.kind ? 0 : left.kind === "income" ? -1 : 1) ||
        left.displayName.localeCompare(right.displayName, "pt-BR"),
    );
  const monthlyCategories = orderedCategories.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parent_id,
    kind: category.kind,
    plannedAmountMinor:
      progressByCategory.get(category.id)?.planned_amount_minor ?? 0,
  }));
  const annualCategories = orderedCategories.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parent_id,
    kind: category.kind,
    plannedByMonth: Array.from({ length: 12 }, (_, monthIndex) => {
      const referenceMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
      return (
        annualProgressByCell.get(`${category.id}|${referenceMonth}`) ?? 0
      );
    }),
  }));

  return (
    <main className="mx-auto grid max-w-[1500px] gap-5 px-3 py-6 sm:px-5 sm:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            Planejamento
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Orçamentos
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Receitas e despesas planejadas, sempre separadas por contexto e
            moeda.
          </p>
        </div>
        <nav
          aria-label="Período do orçamento"
          className="flex rounded-xl bg-slate-100 p-1"
        >
          <Link
            href={monthlyHref}
            aria-current={view === "monthly" ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${
              view === "monthly"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600"
            }`}
          >
            Mensal
          </Link>
          <Link
            href={annualHref}
            aria-current={view === "annual" ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-bold ${
              view === "annual"
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600"
            }`}
          >
            Anual
          </Link>
        </nav>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <form method="get" className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <input type="hidden" name="view" value={view} />
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            {view === "annual" ? "Ano" : "Mês"}
            <input
              type={view === "annual" ? "number" : "month"}
              name={view === "annual" ? "year" : "month"}
              min={view === "annual" ? 2000 : undefined}
              max={view === "annual" ? 2200 : undefined}
              defaultValue={view === "annual" ? year : filters.month}
              className="min-h-10 rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Contexto
            <select
              name="context"
              defaultValue={filters.context}
              className="min-h-10 rounded-lg border border-slate-300 px-3"
            >
              {FINANCIAL_CONTEXTS.map((context) => (
                <option key={context} value={context}>
                  {CONTEXT_LABELS[context]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Moeda
            <select
              name="currency"
              defaultValue={filters.currency}
              className="min-h-10 rounded-lg border border-slate-300 px-3"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {CURRENCY_LABELS[currency]}
                </option>
              ))}
            </select>
          </label>
          <button className="min-h-10 rounded-lg border border-emerald-700 px-4 font-bold text-emerald-800 hover:bg-emerald-50">
            Aplicar filtros
          </button>
        </form>
      </section>

      {feedback ? (
        <p
          role={feedbackIsError ? "alert" : "status"}
          className={`rounded-lg border px-4 py-2 text-sm ${
            feedbackIsError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback}
        </p>
      ) : null}
      {hasError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          Não foi possível carregar os orçamentos. Confirme se as migrations
          estão atualizadas.
        </p>
      ) : null}

      {view === "monthly" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Receitas planejadas",
                incomeSummary.plannedAmountMinor,
                "text-emerald-700",
              ],
              [
                "Receitas realizadas",
                incomeSummary.realizedAmountMinor,
                "text-emerald-700",
              ],
              [
                "Despesas planejadas",
                expenseSummary.plannedAmountMinor,
                "text-rose-700",
              ],
              [
                "Despesas realizadas",
                expenseSummary.realizedAmountMinor,
                "text-rose-700",
              ],
            ].map(([label, amount, color]) => (
              <article
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p
                  className={`mt-1 text-lg font-black tabular-nums ${color}`}
                >
                  {formatMoney(Number(amount), filters.currency, locale)}
                </p>
              </article>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="font-black text-slate-950">
                    Valores planejados
                  </h2>
                  <p className="text-xs text-slate-500">
                    {CONTEXT_LABELS[filters.context]} · {filters.currency}
                  </p>
                </div>
                <form action={copyPreviousMonthBudgets}>
                  <input
                    type="hidden"
                    name="referenceMonth"
                    value={filters.month}
                  />
                  <input
                    type="hidden"
                    name="context"
                    value={filters.context}
                  />
                  <input
                    type="hidden"
                    name="currency"
                    value={filters.currency}
                  />
                  <button className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold hover:bg-slate-50">
                    Copiar mês anterior
                  </button>
                </form>
              </div>
              {monthlyCategories.length ? (
                <div className="mt-3">
                  <MonthlyBudgetForm
                    key={`${filters.month}-${filters.context}-${filters.currency}`}
                    referenceMonth={filters.month}
                    context={filters.context}
                    currency={filters.currency}
                    categories={monthlyCategories}
                  />
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  Não há categorias ativas neste contexto.
                </p>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="font-black text-slate-950">
                  Orçamento versus realizado
                </h2>
                <p className="text-xs text-slate-500">
                  Cartão por competência; transferências e pagamentos técnicos
                  não entram no consumo.
                </p>
              </div>
              {progress.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-xs">
                    <caption className="sr-only">
                      Comparação mensal entre orçamento e realizado
                    </caption>
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Categoria</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-right">Planejado</th>
                        <th className="px-3 py-2 text-right">Realizado</th>
                        <th className="px-3 py-2 text-right">Diferença</th>
                        <th className="px-3 py-2 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {progress.map((row) => {
                        const category = categoryById.get(row.category_id);
                        return (
                          <tr
                            key={row.category_id}
                            className="border-t border-slate-100 hover:bg-slate-50"
                          >
                            <th
                              scope="row"
                              className="max-w-72 truncate px-3 py-2 text-left font-semibold text-slate-900"
                            >
                              {category
                                ? getCategoryDisplayName(category, categories)
                                : row.category_name}
                            </th>
                            <td
                              className={
                                row.category_kind === "income"
                                  ? "px-3 py-2 font-bold text-emerald-700"
                                  : "px-3 py-2 font-bold text-rose-700"
                              }
                            >
                              {row.category_kind === "income"
                                ? "Receita"
                                : "Despesa"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(
                                row.planned_amount_minor,
                                filters.currency,
                                locale,
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                              {formatMoney(
                                row.realized_amount_minor,
                                filters.currency,
                                locale,
                              )}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold tabular-nums ${
                                row.available_amount_minor < 0
                                  ? "text-rose-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {formatMoney(
                                row.available_amount_minor,
                                filters.currency,
                                locale,
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatPercentage(row.percentage_consumed)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-4 text-sm text-slate-600">
                  Ainda não há orçamento ou realizado neste recorte.
                </p>
              )}
            </section>
          </div>
        </>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 border-b border-slate-100 pb-3">
            <h2 className="font-black text-slate-950">
              Planejamento anual de {year}
            </h2>
            <p className="text-xs text-slate-500">
              Edite os doze meses em uma única grade. Valores realizados
              continuam disponíveis na visão mensal.
            </p>
          </div>
          {annualCategories.length ? (
            <AnnualBudgetForm
              year={year}
              context={filters.context}
              currency={filters.currency}
              categories={annualCategories}
            />
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Não há categorias ativas neste contexto.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
