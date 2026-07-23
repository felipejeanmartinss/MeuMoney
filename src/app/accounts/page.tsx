import Link from "next/link";
import { toggleAccountStatus } from "@/app/actions/accounts";
import {
  ACCOUNT_TYPE_LABELS,
  CONTEXT_LABELS,
} from "@/domain/accounts";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import { listCurrentUserAccounts } from "@/services/finance/accounts-service";

export const metadata = { title: "Contas" };

const messages: Record<string, string> = {
  created: "Conta cadastrada com sucesso.",
  updated: "Conta atualizada com sucesso.",
  "status-updated": "Status da conta atualizado com sucesso.",
  "status-error": "Não foi possível alterar o status da conta.",
};

function formatReferenceDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ accounts, hasError }, params] = await Promise.all([
    listCurrentUserAccounts(),
    searchParams,
  ]);
  const feedback = params.message ? messages[params.message] : undefined;
  const feedbackIsError = params.message === "status-error";

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
            Estrutura financeira
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Contas
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Organize onde seu dinheiro está e registre o ponto inicial de cada
            conta.
          </p>
        </div>
        <Link
          href="/accounts/new"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          Nova conta
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

      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Não foi possível carregar suas contas. Confirme se a migration da
          Sprint 2 foi aplicada.
        </p>
      ) : null}

      {!hasError && accounts.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            Nenhuma conta cadastrada
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            Cadastre sua primeira conta corrente, poupança, dinheiro em espécie
            ou outra conta.
          </p>
          <Link
            href="/accounts/new"
            className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-blue-700 px-4 font-semibold text-blue-700 hover:bg-blue-50"
          >
            Cadastrar primeira conta
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => {
          const archived = Boolean(account.archived_at);
          return (
            <article
              key={account.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                archived ? "border-slate-200 opacity-75" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-slate-950">
                    {account.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {ACCOUNT_TYPE_LABELS[account.type]} ·{" "}
                    {CONTEXT_LABELS[account.context]}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    archived
                      ? "bg-slate-200 text-slate-700"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {archived ? "Inativa" : "Ativa"}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-slate-100 py-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Saldo inicial
                  </dt>
                  <dd className="mt-1 text-lg font-extrabold text-slate-950">
                    {formatMoney(
                      account.opening_balance_minor,
                      account.currency,
                      CURRENCY_LOCALES[account.currency],
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Referência
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-800">
                    {formatReferenceDate(account.opening_balance_date)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/accounts/${account.id}/edit`}
                  className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Editar
                </Link>
                <form action={toggleAccountStatus}>
                  <input type="hidden" name="id" value={account.id} />
                  <input
                    type="hidden"
                    name="archive"
                    value={archived ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    {archived ? "Reativar" : "Inativar"}
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
