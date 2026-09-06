import Link from "next/link";
import { InvestmentTransferLinkForm } from "@/components/forms/investment-transfer-link-form";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import {
  listCurrentUserInvestmentPositions,
  listCurrentUserInvestmentTransferCandidates,
} from "@/services/finance/investments-service";
import { formatFinancialDate } from "@/utils/financial-formatters";

export const metadata = { title: "Movimentações de investimentos" };

export default async function InvestmentMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    accountId?: string;
    entryId?: string;
    status?: string;
    message?: string;
    returnAccountId?: string;
    returnPage?: string;
  }>;
}) {
  const [candidateResult, positionResult, query] = await Promise.all([
    listCurrentUserInvestmentTransferCandidates(),
    listCurrentUserInvestmentPositions(),
    searchParams,
  ]);
  const accounts = [
    ...new Map(
      candidateResult.candidates.map((candidate) => [
        candidate.account_id,
        { id: candidate.account_id, name: candidate.account_name },
      ]),
    ).values(),
  ].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const selectedAccountId = query.accountId ?? "";
  const status: "pending" | "linked" | "all" =
    query.status === "linked" || query.status === "all"
      ? query.status
      : "pending";
  const filtered = candidateResult.candidates.filter((candidate) => {
    if (selectedAccountId && candidate.account_id !== selectedAccountId) {
      return false;
    }
    if (status === "pending") return !candidate.cash_flow_id;
    if (status === "linked") return Boolean(candidate.cash_flow_id);
    return true;
  });
  const selected = query.entryId
    ? candidateResult.candidates.find(
        (candidate) =>
          candidate.entry_id === query.entryId && !candidate.cash_flow_id,
      )
    : undefined;
  const hasError = candidateResult.hasError || positionResult.hasError;

  function listHref(next: { status?: string; accountId?: string }) {
    const params = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextAccount = next.accountId ?? selectedAccountId;
    if (nextStatus !== "pending") params.set("status", nextStatus);
    if (nextAccount) params.set("accountId", nextAccount);
    const suffix = params.toString();
    return suffix ? `/investments/movements?${suffix}` : "/investments/movements";
  }

  return (
    <main className="mx-auto grid max-w-[1500px] gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/investments"
            className="text-sm font-bold text-emerald-700 hover:underline"
          >
            ← Voltar para Investimentos
          </Link>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Movimentações e posições
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Transforme entradas e saídas já registradas em aplicações,
            liquidações ou rendimentos.
          </p>
        </div>
        <Link
          href="/investments/new"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          Posição sem movimentação
        </Link>
      </header>

      {query.message === "linked" ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Movimentação vinculada à posição com sucesso.
        </p>
      ) : null}
      {hasError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Não foi possível carregar as movimentações de investimento.
        </p>
      ) : null}

      {selected ? (
        <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">
              Vincular movimentação
            </h2>
            <Link
              href={listHref({})}
              className="text-sm font-bold text-slate-600 hover:underline"
            >
              Fechar
            </Link>
          </div>
          <InvestmentTransferLinkForm
            candidate={selected}
            positions={positionResult.positions}
            returnAccountId={query.returnAccountId}
            returnPage={query.returnPage}
          />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex gap-1 overflow-x-auto" aria-label="Estado dos vínculos">
            {[
              ["pending", "A vincular"],
              ["linked", "Vinculadas"],
              ["all", "Todas"],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={listHref({ status: value })}
                aria-current={status === value ? "page" : undefined}
                className={`min-h-9 shrink-0 rounded-lg px-3 py-2 text-sm font-bold ${
                  status === value
                    ? "bg-emerald-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          <form method="get" className="flex items-center gap-2">
            {status !== "pending" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <label className="sr-only" htmlFor="investment-account-filter">
              Filtrar por conta
            </label>
            <select
              id="investment-account-filter"
              name="accountId"
              defaultValue={selectedAccountId}
              className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Todas as contas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <button className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700">
              Filtrar
            </button>
          </form>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-slate-500">
            Nenhuma movimentação neste filtro.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((candidate) => {
              const params = new URLSearchParams();
              params.set("entryId", candidate.entry_id);
              if (status !== "pending") params.set("status", status);
              if (selectedAccountId) params.set("accountId", selectedAccountId);
              return (
                <article
                  key={candidate.entry_id}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_7rem_9rem_9rem] sm:items-center"
                >
                  <p className="text-sm text-slate-600">
                    {formatFinancialDate(candidate.transaction_date)}
                  </p>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">
                      {candidate.description}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {candidate.account_name}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-600">
                    {candidate.direction === "inflow" ? "Entrada" : "Saída"}
                  </p>
                  <p className="text-right font-extrabold text-slate-950">
                    {formatMoney(
                      candidate.amount_minor,
                      candidate.currency,
                      CURRENCY_LOCALES[candidate.currency],
                    )}
                  </p>
                  {candidate.position_id ? (
                    <Link
                      href={`/investments/${candidate.position_id}/history`}
                      className="text-right text-sm font-bold text-emerald-700 hover:underline"
                    >
                      {candidate.position_asset_name ?? "Ver posição"}
                    </Link>
                  ) : (
                    <Link
                      href={`/investments/movements?${params.toString()}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800"
                    >
                      Vincular
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
