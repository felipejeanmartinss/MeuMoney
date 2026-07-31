import { copyPreviousMonthBudgets } from "@/app/actions/budgets";
import { MonthlyBudgetForm } from "@/components/forms/monthly-budget-form";
import {
  CONTEXT_LABELS,
  FINANCIAL_CONTEXTS,
} from "@/domain/accounts";
import {
  budgetFilterSchema,
  currentReferenceMonth,
  summarizeBudgetProgress,
  toReferenceMonth,
} from "@/domain/budgets";
import {
  CURRENCY_LABELS,
  CURRENCY_LOCALES,
  SUPPORTED_CURRENCIES,
} from "@/domain/currencies";
import { getCategoryDisplayName } from "@/domain/categories";
import { formatMoney } from "@/domain/money";
import { getCurrentUserMonthlyBudget } from "@/services/finance/budgets-service";

export const metadata = { title: "Orçamento mensal" };

const messages: Record<string, string> = {
  saved: "Orçamento atualizado com sucesso.",
  "copy-error": "Não foi possível copiar o orçamento anterior.",
};

function formatPercentage(value: number | null) {
  return value === null
    ? "Sem orçamento"
    : `${value.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}%`;
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    context?: string;
    currency?: string;
    message?: string;
    count?: string;
  }>;
}) {
  const params = await searchParams;
  const parsedFilters = budgetFilterSchema.safeParse({
    month: params.month ?? currentReferenceMonth(),
    context: params.context ?? "personal",
    currency: params.currency ?? "BRL",
  });
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        month: currentReferenceMonth(),
        context: "personal" as const,
        currency: "BRL" as const,
      };
  const referenceMonth = toReferenceMonth(filters.month);
  const { categories, progress, hasError } =
    await getCurrentUserMonthlyBudget({
      referenceMonth,
      context: filters.context,
      currency: filters.currency,
    });
  const progressByCategory = new Map(
    progress.map((row) => [row.category_id, row]),
  );
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const formCategories = categories.map((category) => ({
    id: category.id,
    name: getCategoryDisplayName(category, categories),
    plannedAmountMinor:
      progressByCategory.get(category.id)?.planned_amount_minor ?? 0,
  }));
  const summary = summarizeBudgetProgress(
    progress.map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      plannedAmountMinor: row.planned_amount_minor,
      realizedAmountMinor: row.realized_amount_minor,
      availableAmountMinor: row.available_amount_minor,
      percentageConsumed: row.percentage_consumed,
    })),
  );
  const feedback =
    params.message === "copied"
      ? `${Number(params.count ?? 0)} orçamento(s) copiado(s) do mês anterior.`
      : params.message
        ? messages[params.message]
        : undefined;
  const feedbackIsError = params.message === "copy-error";
  const locale = CURRENCY_LOCALES[filters.currency];
  const summaryCards = [
    { label: "Planejado", amount: summary.plannedAmountMinor },
    { label: "Realizado", amount: summary.realizedAmountMinor },
    { label: "Disponível", amount: summary.availableAmountMinor },
  ];

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
          Planejamento
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
          Orçamento mensal
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Planeje por categoria e acompanhe o consumo realizado sem duplicar
          transferências ou pagamentos de fatura.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <form method="get" className="grid gap-4 sm:grid-cols-4 sm:items-end">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Mês
            <input
              type="month"
              name="month"
              defaultValue={filters.month}
              className="min-h-11 rounded-xl border border-slate-300 px-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Contexto
            <select
              name="context"
              defaultValue={filters.context}
              className="min-h-11 rounded-xl border border-slate-300 px-3"
            >
              {FINANCIAL_CONTEXTS.map((context) => (
                <option key={context} value={context}>
                  {CONTEXT_LABELS[context]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Moeda
            <select
              name="currency"
              defaultValue={filters.currency}
              className="min-h-11 rounded-xl border border-slate-300 px-3"
            >
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {CURRENCY_LABELS[currency]}
                </option>
              ))}
            </select>
          </label>
          <button className="min-h-11 rounded-xl border border-blue-700 px-4 font-semibold text-blue-700 hover:bg-blue-50">
            Aplicar filtros
          </button>
        </form>
      </section>

      {feedback ? (
        <p
          role={feedbackIsError ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 ${
            feedbackIsError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback}
        </p>
      ) : null}

      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Não foi possível carregar o orçamento. Confirme a migration da Sprint
          6.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, amount }) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-extrabold text-slate-950">
              {formatMoney(amount, filters.currency, locale)}
            </p>
          </article>
        ))}
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Consumido</p>
          <p className="mt-1 text-xl font-extrabold text-slate-950">
            {formatPercentage(summary.percentageConsumed)}
          </p>
        </article>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">
                Valores planejados
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {CONTEXT_LABELS[filters.context]} · {filters.currency}
              </p>
            </div>
            <form action={copyPreviousMonthBudgets}>
              <input
                type="hidden"
                name="referenceMonth"
                value={filters.month}
              />
              <input type="hidden" name="context" value={filters.context} />
              <input type="hidden" name="currency" value={filters.currency} />
              <button className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50">
                Copiar mês anterior
              </button>
            </form>
          </div>
          {formCategories.length ? (
            <div className="mt-5">
              <MonthlyBudgetForm
                key={`${filters.month}-${filters.context}-${filters.currency}`}
                referenceMonth={filters.month}
                context={filters.context}
                currency={filters.currency}
                categories={formCategories}
              />
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-slate-600">
              Não há categorias de despesa ativas neste contexto.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-extrabold text-slate-950">
            Orçamento versus realizado
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Compras no cartão entram no mês de competência de cada parcela.
          </p>
          {progress.length ? (
            <div className="mt-5 grid gap-3">
              {progress.map((row) => {
                const visualPercentage = Math.min(
                  Math.max(row.percentage_consumed ?? 0, 0),
                  100,
                );
                const category = categoryById.get(row.category_id);
                return (
                  <article
                    key={row.category_id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold text-slate-950">
                        {category
                          ? getCategoryDisplayName(category, categories)
                          : row.category_name}
                      </h3>
                      <span className="text-sm font-bold text-slate-700">
                        {formatPercentage(row.percentage_consumed)}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          (row.percentage_consumed ?? 0) > 100
                            ? "bg-rose-600"
                            : "bg-blue-600"
                        }`}
                        style={{ width: `${visualPercentage}%` }}
                      />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-slate-500">Planejado</dt>
                        <dd className="font-semibold">
                          {formatMoney(
                            row.planned_amount_minor,
                            filters.currency,
                            locale,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Realizado</dt>
                        <dd className="font-semibold">
                          {formatMoney(
                            row.realized_amount_minor,
                            filters.currency,
                            locale,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Disponível</dt>
                        <dd
                          className={`font-semibold ${
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
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-slate-600">
              Ainda não há orçamento ou consumo neste recorte.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
