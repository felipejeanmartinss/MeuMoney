import Link from "next/link";
import {
  changeRecurringTransactionState,
  generateRecurringTransactions,
} from "@/app/actions/recurring-transactions";
import { inputClass } from "@/components/forms/form-controls";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import {
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_STATE_LABELS,
} from "@/domain/recurring-transactions";
import { TRANSACTION_TYPE_LABELS } from "@/domain/transactions";
import { listCurrentUserRecurringTransactions } from "@/services/finance/recurring-transactions-service";
import type {
  RecurringTransactionState,
  SupportedCurrency,
} from "@/types/database";
import { toIsoDate } from "@/utils/dates";
import {
  formatFinancialAmount,
  formatFinancialDate,
} from "@/utils/financial-formatters";

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

export default async function RecurringTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const {
    recurrences,
    accounts,
    categories,
    hasError,
  } = await listCurrentUserRecurringTransactions();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const messageCode =
    typeof rawParams.message === "string" ? rawParams.message : undefined;
  const rawCount =
    typeof rawParams.count === "string" ? Number(rawParams.count) : 0;
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
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
            Planejamento
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Recorrências
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Programe receitas e despesas sem alterar o saldo realizado.
          </p>
        </div>
        <Link
          href="/recurring-transactions/new"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
        >
          Nova recorrência
        </Link>
      </div>

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

      <section className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <h2 className="font-bold text-blue-950">Gerar previsões</h2>
          <p className="mt-1 text-sm text-blue-900">
            O processamento é idempotente: repetir o mesmo período não cria
            duplicidades.
          </p>
        </div>
        <form
          action={generateRecurringTransactions}
          className="grid gap-2 sm:grid-cols-[auto_auto] sm:items-end"
        >
          <label className="grid gap-1 text-sm font-semibold text-blue-950">
            Gerar até
            <input
              className={inputClass()}
              name="targetUntil"
              type="date"
              defaultValue={defaultGenerationDate()}
              required
            />
          </label>
          <button className="min-h-12 rounded-xl bg-blue-800 px-5 font-semibold text-white hover:bg-blue-900">
            Gerar previstos
          </button>
        </form>
      </section>

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Não foi possível carregar as recorrências. Confirme se a migration
          desta feature foi aplicada.
        </p>
      ) : null}

      {!hasError && recurrences.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            Nenhuma recorrência cadastrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            Cadastre um compromisso periódico para gerar lançamentos previstos.
          </p>
        </section>
      ) : null}

      <section className="grid gap-3">
        {recurrences.map((recurrence) => {
          const account = accountById.get(recurrence.account_id);
          const category = categoryById.get(recurrence.category_id);
          const state = recurrenceState(recurrence);
          const currency =
            (account?.currency as SupportedCurrency | undefined) ?? "BRL";
          const income = recurrence.transaction_type === "income";
          return (
            <article
              key={recurrence.id}
              className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${
                state === "active" ? "" : "opacity-75"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        income
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {TRANSACTION_TYPE_LABELS[recurrence.transaction_type]}
                    </span>
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
                      {RECURRENCE_FREQUENCY_LABELS[recurrence.frequency]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                      {RECURRENCE_STATE_LABELS[state]}
                    </span>
                  </div>
                  <h2 className="mt-2 truncate text-lg font-bold text-slate-950">
                    {recurrence.description}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {account?.name ?? "Conta indisponível"} ·{" "}
                    {category?.name ?? "Categoria indisponível"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Próxima:{" "}
                    {formatFinancialDate(recurrence.next_occurrence)}
                    {recurrence.end_date
                      ? ` · termina em ${formatFinancialDate(recurrence.end_date)}`
                      : " · sem data final"}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-xl font-extrabold ${
                    income ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {formatFinancialAmount(
                    recurrence.amount_minor,
                    currency,
                    CURRENCY_LOCALES[currency],
                  )}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {state !== "ended" ? (
                  <Link
                    href={`/recurring-transactions/${recurrence.id}/edit`}
                    className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Editar
                  </Link>
                ) : null}
                {state === "active" ? (
                  <form action={changeRecurringTransactionState}>
                    <input type="hidden" name="id" value={recurrence.id} />
                    <input type="hidden" name="state" value="suspended" />
                    <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                      Suspender
                    </button>
                  </form>
                ) : null}
                {state === "suspended" ? (
                  <form action={changeRecurringTransactionState}>
                    <input type="hidden" name="id" value={recurrence.id} />
                    <input type="hidden" name="state" value="active" />
                    <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                      Reativar
                    </button>
                  </form>
                ) : null}
                {state !== "ended" ? (
                  <form action={changeRecurringTransactionState}>
                    <input type="hidden" name="id" value={recurrence.id} />
                    <input type="hidden" name="state" value="ended" />
                    <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50">
                      Encerrar
                    </button>
                  </form>
                ) : (
                  <span className="py-2 text-sm font-semibold text-slate-500">
                    Encerrada definitivamente
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
