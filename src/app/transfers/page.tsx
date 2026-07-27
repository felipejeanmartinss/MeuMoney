import Link from "next/link";
import { toggleTransferActivity } from "@/app/actions/transfers";
import { inputClass } from "@/components/forms/form-control-styles";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
} from "@/domain/transactions";
import { transferFiltersSchema } from "@/domain/transfers";
import { listCurrentUserTransfers } from "@/services/finance/transfers-service";
import {
  formatFinancialAmount,
  formatFinancialDate,
} from "@/utils/financial-formatters";

export const metadata = { title: "Transferências" };

const messages: Record<string, string> = {
  created: "Transferência criada com sucesso.",
  updated: "Transferência atualizada com sucesso.",
  "status-updated": "Status da transferência atualizado com sucesso.",
  "status-error": "Não foi possível alterar o status da transferência.",
};

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const singleParams = Object.fromEntries(
    Object.entries(rawParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const parsedFilters = transferFiltersSchema.safeParse(singleParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : { activity: "active" as const };
  const { transfers, accounts, hasError } =
    await listCurrentUserTransfers(filters);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const messageCode =
    typeof rawParams.message === "string" ? rawParams.message : undefined;
  const feedback = messageCode ? messages[messageCode] : undefined;
  const feedbackIsError = messageCode === "status-error";

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
            Movimentação interna
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Transferências
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Mova valores entre contas da mesma moeda sem alterar receitas ou
            despesas.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/transactions"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-5 font-semibold text-slate-700 hover:bg-white"
          >
            Lançamentos
          </Link>
          <Link
            href="/transfers/new"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
          >
            Nova transferência
          </Link>
        </div>
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

      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Status
          <select
            name="status"
            defaultValue={filters.status ?? ""}
            className={inputClass()}
          >
            <option value="">Todos</option>
            {TRANSACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TRANSACTION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Conta envolvida
          <select
            name="accountId"
            defaultValue={filters.accountId ?? ""}
            className={inputClass()}
          >
            <option value="">Todas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          De
          <input
            name="dateFrom"
            type="date"
            defaultValue={filters.dateFrom}
            className={inputClass()}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Até
          <input
            name="dateTo"
            type="date"
            defaultValue={filters.dateTo}
            className={inputClass()}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Exibir
          <select
            name="activity"
            defaultValue={filters.activity}
            className={inputClass()}
          >
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
            <option value="all">Todas</option>
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
          <button className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800">
            Filtrar
          </button>
          <Link
            href="/transfers"
            className="inline-flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            Limpar
          </Link>
        </div>
      </form>

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Não foi possível carregar as transferências. Confirme se a migration
          da Sprint 3 foi aplicada.
        </p>
      ) : null}

      {!hasError && transfers.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            Nenhuma transferência registrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            Crie uma transferência para movimentar dinheiro com segurança entre
            duas contas.
          </p>
        </section>
      ) : null}

      <section className="grid gap-3">
        {transfers.map((transfer) => {
          const source = accountById.get(transfer.source_account_id);
          const destination = accountById.get(
            transfer.destination_account_id,
          );
          return (
            <article
              key={transfer.id}
              className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${
                transfer.is_active ? "" : "opacity-65"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
                      {TRANSACTION_STATUS_LABELS[transfer.status]}
                    </span>
                    {!transfer.is_active ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                        Inativa
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-slate-950">
                    {source?.name ?? "Conta indisponível"}{" "}
                    <span aria-hidden="true">→</span>{" "}
                    {destination?.name ?? "Conta indisponível"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {transfer.description || "Transferência entre contas"} ·{" "}
                    {formatFinancialDate(transfer.transaction_date)}
                  </p>
                </div>
                <p className="shrink-0 text-xl font-extrabold text-blue-800">
                  {formatFinancialAmount(
                    transfer.amount_minor,
                    transfer.currency,
                    CURRENCY_LOCALES[transfer.currency],
                  )}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Link
                  href={`/transfers/${transfer.id}/edit`}
                  className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Editar
                </Link>
                <form action={toggleTransferActivity}>
                  <input type="hidden" name="id" value={transfer.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={transfer.is_active ? "false" : "true"}
                  />
                  <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                    {transfer.is_active ? "Inativar" : "Reativar"}
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
