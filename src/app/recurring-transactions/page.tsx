import Link from "next/link";
import {
  changeRecurringTransactionState,
  generateRecurringTransactions,
} from "@/app/actions/recurring-transactions";
import { inputClass } from "@/components/forms/form-control-styles";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import {
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_STATE_LABELS,
} from "@/domain/recurring-transactions";
import { getCategoryDisplayName } from "@/domain/categories";
import { TRANSACTION_TYPE_LABELS } from "@/domain/transactions";
import { listCurrentUserRecurringTransactions } from "@/services/finance/recurring-transactions-service";
import type {
  RecurringTransactionState,
  SupportedCurrency,
  TransactionType,
} from "@/types/database";
import { toIsoDate } from "@/utils/dates";
import { formatFinancialDate } from "@/utils/financial-formatters";

export const metadata = { title: "Recorrências" };

const messages: Record<string, string> = {
  created: "Recorrência criada com sucesso.",
  updated: "Recorrência atualizada com sucesso.",
  "state-active": "Recorrência reativada.",
  "state-suspended": "Recorrência suspensa.",
  "state-ended": "Recorrência encerrada definitivamente.",
  "status-error": "Não foi possível alterar o estado da recorrência.",
  "generation-error": "Não foi possível gerar os lançamentos previstos.",
};

function recurrenceState(recurrence: {
  is_active: boolean;
  ended_at: string | null;
}): RecurringTransactionState {
  if (recurrence.ended_at) return "ended";
  return recurrence.is_active ? "active" : "suspended";
}

function defaultGenerationDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 31);
  return toIsoDate(date);
}

function currentReferenceMonth() {
  return toIsoDate(new Date()).slice(0, 7);
}

function CurrencyAmounts({
  values,
  empty = "Nenhum valor",
}: {
  values: Map<SupportedCurrency, number>;
  empty?: string;
}) {
  if (values.size === 0) {
    return <span className="text-sm text-slate-500">{empty}</span>;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {[...values.entries()].map(([currency, amount]) => (
        <span
          key={currency}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-extrabold text-slate-950"
        >
          {formatMoney(amount, currency, CURRENCY_LOCALES[currency])}
        </span>
      ))}
    </div>
  );
}

function RecurrenceMenu({
  id,
  state,
}: {
  id: string;
  state: RecurringTransactionState;
}) {
  return (
    <details className="relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
        Ações
      </summary>
      <div className="z-10 mt-2 grid min-w-36 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:absolute sm:right-0">
        {state !== "ended" ? (
          <Link
            href={`/recurring-transactions/${id}/edit`}
            className="rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            Editar
          </Link>
        ) : null}
        {state === "active" ? (
          <form action={changeRecurringTransactionState}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="state" value="suspended" />
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-amber-700 hover:bg-amber-50">
              Suspender
            </button>
          </form>
        ) : null}
        {state === "suspended" ? (
          <form action={changeRecurringTransactionState}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="state" value="active" />
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-50">
              Reativar
            </button>
          </form>
        ) : null}
        {state !== "ended" ? (
          <form action={changeRecurringTransactionState}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="state" value="ended" />
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-rose-700 hover:bg-rose-50">
              Encerrar
            </button>
          </form>
        ) : (
          <span className="px-3 py-2 text-sm font-bold text-slate-400">
            Encerrada
          </span>
        )}
      </div>
    </details>
  );
}

export default async function RecurringTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const { recurrences, accounts, categories, hasError } =
    await listCurrentUserRecurringTransactions();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const asString = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : undefined;
  const period = asString(rawParams.period);
  const accountFilter = asString(rawParams.accountId);
  const typeFilter = asString(rawParams.type) as TransactionType | undefined;
  const stateFilter = asString(rawParams.state) as
    | RecurringTransactionState
    | undefined;
  const today = toIsoDate(new Date());
  const timelineMonth =
    period && /^\d{4}-\d{2}$/.test(period) ? period : currentReferenceMonth();

  const filtered = recurrences.filter((recurrence) => {
    const state = recurrenceState(recurrence);
    return (
      (!period || recurrence.next_occurrence.startsWith(period)) &&
      (!accountFilter || recurrence.account_id === accountFilter) &&
      (!typeFilter || recurrence.transaction_type === typeFilter) &&
      (!stateFilter || state === stateFilter)
    );
  });
  const upcomingIncome = new Map<SupportedCurrency, number>();
  const upcomingExpense = new Map<SupportedCurrency, number>();
  let attentionCount = 0;

  for (const recurrence of filtered) {
    const state = recurrenceState(recurrence);
    const account = accountById.get(recurrence.account_id);
    const currency = account?.currency as SupportedCurrency | undefined;
    if (state === "active" && recurrence.next_occurrence < today) {
      attentionCount += 1;
    }
    if (!currency || state !== "active" || recurrence.next_occurrence < today) {
      continue;
    }
    const target =
      recurrence.transaction_type === "income"
        ? upcomingIncome
        : upcomingExpense;
    target.set(currency, (target.get(currency) ?? 0) + recurrence.amount_minor);
  }

  const timeline = filtered
    .filter((recurrence) =>
      recurrence.next_occurrence.startsWith(timelineMonth),
    )
    .sort((left, right) =>
      left.next_occurrence.localeCompare(right.next_occurrence),
    );
  const messageCode = asString(rawParams.message);
  const rawCount = Number(asString(rawParams.count) ?? 0);
  const generatedCount =
    Number.isSafeInteger(rawCount) && rawCount >= 0 ? rawCount : 0;
  const feedback =
    messageCode === "generated"
      ? `${generatedCount} lançamento${generatedCount === 1 ? "" : "s"} previsto${generatedCount === 1 ? "" : "s"} gerado${generatedCount === 1 ? "" : "s"}.`
      : messageCode
        ? messages[messageCode]
        : undefined;
  const feedbackIsError =
    messageCode === "status-error" || messageCode === "generation-error";

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Agenda financeira
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Recorrências
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Acompanhe compromissos futuros e gere previsões sem alterar o saldo
            realizado.
          </p>
        </div>
        <Link
          href="/recurring-transactions/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800"
        >
          Nova recorrência
        </Link>
      </header>

      {feedback ? (
        <p
          role={feedbackIsError ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedbackIsError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Próximas entradas</p>
          <CurrencyAmounts values={upcomingIncome} />
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Próximas saídas</p>
          <CurrencyAmounts values={upcomingExpense} />
        </article>
        <article
          className={`rounded-2xl border p-5 shadow-sm ${
            attentionCount
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <p className="text-sm font-bold text-slate-500">Exigem atenção</p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {attentionCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Itens ativos com próxima ocorrência vencida.
          </p>
        </article>
      </section>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-slate-950">Filtros</h2>
            <p className="mt-1 text-sm text-slate-600">
              Refine a agenda sem alterar os compromissos.
            </p>
          </div>
          <Link
            href="/recurring-transactions"
            className="text-sm font-bold text-emerald-700 hover:underline"
          >
            Limpar
          </Link>
        </div>
        <form method="get" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Período
            <input
              className={inputClass()}
              name="period"
              type="month"
              defaultValue={period}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Conta
            <select
              className={inputClass()}
              name="accountId"
              defaultValue={accountFilter}
            >
              <option value="">Todas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Tipo
            <select
              className={inputClass()}
              name="type"
              defaultValue={typeFilter}
            >
              <option value="">Todos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Situação
            <select
              className={inputClass()}
              name="state"
              defaultValue={stateFilter}
            >
              <option value="">Todas</option>
              <option value="active">Ativa</option>
              <option value="suspended">Suspensa</option>
              <option value="ended">Encerrada</option>
            </select>
          </label>
          <button className="min-h-11 self-end rounded-xl bg-slate-950 px-4 font-bold text-white hover:bg-slate-800">
            Aplicar filtros
          </button>
        </form>
      </section>

      <section className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <h2 className="font-extrabold text-emerald-950">Gerar previsões</h2>
          <p className="mt-1 text-sm text-emerald-900">
            O processamento continua idempotente: repetir o período não cria
            duplicidades.
          </p>
        </div>
        <form
          action={generateRecurringTransactions}
          className="grid gap-2 sm:grid-cols-[auto_auto] sm:items-end"
        >
          <label className="grid gap-1 text-sm font-bold text-emerald-950">
            Gerar até
            <input
              className={inputClass()}
              name="targetUntil"
              type="date"
              defaultValue={defaultGenerationDate()}
              required
            />
          </label>
          <button className="min-h-11 rounded-xl bg-emerald-800 px-4 font-bold text-white hover:bg-emerald-900">
            Gerar previstos
          </button>
        </form>
      </section>

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Não foi possível carregar as recorrências. Tente novamente.
        </p>
      ) : null}

      {!hasError && filtered.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-extrabold text-slate-950">
            Nenhuma recorrência encontrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            Ajuste os filtros ou cadastre um novo compromisso.
          </p>
        </section>
      ) : null}

      {filtered.length > 0 ? (
        <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden overflow-visible lg:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Agenda de receitas e despesas recorrentes
              </caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">Descrição</th>
                  <th className="px-4 py-3 font-bold">Valor</th>
                  <th className="px-4 py-3 font-bold">Frequência</th>
                  <th className="px-4 py-3 font-bold">Próxima</th>
                  <th className="px-4 py-3 font-bold">Conta</th>
                  <th className="px-4 py-3 font-bold">Tipo</th>
                  <th className="px-4 py-3 font-bold">Situação</th>
                  <th className="px-5 py-3 text-right font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((recurrence) => {
                  const account = accountById.get(recurrence.account_id);
                  const currency =
                    (account?.currency as SupportedCurrency | undefined) ??
                    "BRL";
                  const category = categoryById.get(recurrence.category_id);
                  const state = recurrenceState(recurrence);
                  return (
                    <tr key={recurrence.id}>
                      <td className="max-w-64 px-5 py-4">
                        <p className="truncate font-bold text-slate-950">
                          {recurrence.description}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {category
                            ? getCategoryDisplayName(category, categories)
                            : "Categoria indisponível"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-extrabold text-slate-950">
                        {formatMoney(
                          recurrence.amount_minor,
                          currency,
                          CURRENCY_LOCALES[currency],
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {RECURRENCE_FREQUENCY_LABELS[recurrence.frequency]}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                        {formatFinancialDate(recurrence.next_occurrence)}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {account?.name ?? "Conta indisponível"}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {TRANSACTION_TYPE_LABELS[recurrence.transaction_type]}
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                          {RECURRENCE_STATE_LABELS[state]}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end">
                          <RecurrenceMenu id={recurrence.id} state={state} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid divide-y divide-slate-100 lg:hidden">
            {filtered.map((recurrence) => {
              const account = accountById.get(recurrence.account_id);
              const currency =
                (account?.currency as SupportedCurrency | undefined) ?? "BRL";
              const state = recurrenceState(recurrence);
              return (
                <article key={recurrence.id} className="grid gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-extrabold text-slate-950">
                        {recurrence.description}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {account?.name ?? "Conta indisponível"} ·{" "}
                        {RECURRENCE_FREQUENCY_LABELS[recurrence.frequency]}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-slate-500">
                      {RECURRENCE_STATE_LABELS[state]}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p
                        className={`text-xl font-black ${
                          recurrence.transaction_type === "income"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {formatMoney(
                          recurrence.amount_minor,
                          currency,
                          CURRENCY_LOCALES[currency],
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Próxima em{" "}
                        {formatFinancialDate(recurrence.next_occurrence)}
                      </p>
                    </div>
                    <RecurrenceMenu id={recurrence.id} state={state} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">
            Linha do tempo de {timelineMonth}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Próximas ocorrências do mês, apresentadas também em texto.
          </p>
        </div>
        {timeline.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Nenhum compromisso nesta linha do tempo.
          </p>
        ) : (
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {timeline.map((recurrence) => {
              const account = accountById.get(recurrence.account_id);
              const currency =
                (account?.currency as SupportedCurrency | undefined) ?? "BRL";
              return (
                <li
                  key={recurrence.id}
                  className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <time
                    dateTime={recurrence.next_occurrence}
                    className="flex size-12 flex-col items-center justify-center rounded-xl bg-slate-950 text-white"
                  >
                    <span className="text-lg font-black">
                      {recurrence.next_occurrence.slice(8, 10)}
                    </span>
                    <span className="text-[0.6rem] font-bold uppercase">
                      dia
                    </span>
                  </time>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">
                      {recurrence.description}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatMoney(
                        recurrence.amount_minor,
                        currency,
                        CURRENCY_LOCALES[currency],
                      )}{" "}
                      · {account?.name}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
