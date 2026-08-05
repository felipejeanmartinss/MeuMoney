import Link from "next/link";
import { toggleAccountEntryReconciliation } from "@/app/actions/transactions";
import type { AccountRegisterEntry } from "@/domain/account-register";
import { formatMoney } from "@/domain/money";
import { TRANSACTION_STATUS_LABELS } from "@/domain/transactions";
import type { SupportedCurrency } from "@/types/database";
import { formatFinancialDate } from "@/utils/financial-formatters";

const PAGE_SIZE = 75;

const messages: Record<string, { text: string; error?: boolean }> = {
  "reconciliation-updated": {
    text: "Conciliação atualizada com sucesso.",
  },
  "reconciliation-error": {
    text: "Não foi possível atualizar a conciliação.",
    error: true,
  },
};

function ReconciliationControl({
  accountId,
  entry,
}: {
  accountId: string;
  entry: AccountRegisterEntry;
}) {
  const canReconcile = entry.isActive && entry.status === "completed";
  if (!canReconcile) {
    return (
      <span className="text-xs font-bold text-slate-400" title="Somente itens realizados e ativos podem ser conciliados">
        —
      </span>
    );
  }

  const reconciled = Boolean(entry.reconciledAt);
  return (
    <form action={toggleAccountEntryReconciliation}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="entryType" value={entry.entryType} />
      <input type="hidden" name="entryId" value={entry.id} />
      <input
        type="hidden"
        name="reconciled"
        value={reconciled ? "false" : "true"}
      />
      <button
        type="submit"
        aria-label={`${reconciled ? "Desmarcar" : "Marcar"} ${entry.description} como reconciliado`}
        aria-pressed={reconciled}
        className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border text-xs font-black transition ${
          reconciled
            ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
            : "border-slate-300 bg-white text-slate-600 hover:border-emerald-600 hover:text-emerald-700"
        }`}
        title={reconciled ? "Reconciliado" : "Pendente de conciliação"}
      >
        {reconciled ? "R" : "○"}
      </button>
    </form>
  );
}

function Pagination({
  accountId,
  page,
  pageCount,
}: {
  accountId: string;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Páginas do extrato"
      className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"
    >
      {page > 1 ? (
        <Link
          href={`/accounts/${accountId}?tab=statement&page=${page - 1}`}
          className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm font-semibold text-slate-500">
        Página {page} de {pageCount}
      </span>
      {page < pageCount ? (
        <Link
          href={`/accounts/${accountId}?tab=statement&page=${page + 1}`}
          className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Próxima →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function AccountRegister({
  accountId,
  currency,
  entries,
  openingBalanceDate,
  openingBalanceMinor,
  requestedPage,
  message,
}: {
  accountId: string;
  currency: SupportedCurrency;
  entries: AccountRegisterEntry[];
  openingBalanceDate: string;
  openingBalanceMinor: number;
  requestedPage?: string;
  message?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const parsedPage = Number.parseInt(requestedPage ?? "1", 10);
  const page = Number.isFinite(parsedPage)
    ? Math.min(Math.max(parsedPage, 1), pageCount)
    : 1;
  const pageEntries = entries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const feedback = message ? messages[message] : undefined;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">
            Extrato da conta
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {entries.length} movimentações · saldo inicial de{" "}
            {formatMoney(openingBalanceMinor, currency)} em{" "}
            {formatFinancialDate(openingBalanceDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/transactions/new?accountId=${accountId}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800"
          >
            Nova movimentação
          </Link>
          <Link
            href={`/transactions/new?accountId=${accountId}&type=transfer`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-800 hover:bg-slate-50"
          >
            Transferir
          </Link>
        </div>
      </div>

      {feedback ? (
        <p
          role={feedback.error ? "alert" : "status"}
          className={`m-4 rounded-xl border px-4 py-3 text-sm ${
            feedback.error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-bold text-slate-700">
            Nenhuma movimentação nesta conta.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            O saldo inicial continua sendo o ponto de partida.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <caption className="sr-only">
                Movimentações da conta em ordem cronológica
              </caption>
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Data
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Descrição
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Categoria / origem
                  </th>
                  <th scope="col" className="px-3 py-3 text-center">
                    C
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Saída
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Entrada
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Saldo
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageEntries.map((entry) => {
                  const isIncome = entry.signedAmountMinor > 0;
                  return (
                    <tr
                      key={`${entry.entryType}-${entry.id}`}
                      className={`${entry.isActive ? "" : "opacity-55"} hover:bg-emerald-50/30`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                        {formatFinancialDate(entry.transactionDate)}
                      </td>
                      <td className="max-w-64 px-4 py-3">
                        <p className="truncate font-bold text-slate-950">
                          {entry.description}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {TRANSACTION_STATUS_LABELS[entry.status]}
                          {!entry.isActive ? " · Inativo" : ""}
                        </p>
                      </td>
                      <td className="max-w-56 px-4 py-3 text-slate-600">
                        <p className="truncate">{entry.detail}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ReconciliationControl
                          accountId={accountId}
                          entry={entry}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-rose-700">
                        {!isIncome
                          ? formatMoney(entry.amountMinor, currency)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-emerald-700">
                        {isIncome
                          ? formatMoney(entry.amountMinor, currency)
                          : "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-extrabold ${
                          entry.runningBalanceMinor < 0
                            ? "text-rose-700"
                            : "text-slate-950"
                        }`}
                      >
                        {formatMoney(entry.runningBalanceMinor, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {entry.editHref ? (
                          <Link
                            href={entry.editHref}
                            className="text-sm font-bold text-blue-700 hover:underline"
                          >
                            Editar
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Automático
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {pageEntries.map((entry) => {
              const isIncome = entry.signedAmountMinor > 0;
              return (
                <article
                  key={`${entry.entryType}-${entry.id}`}
                  className={`grid gap-3 px-4 py-4 ${entry.isActive ? "" : "opacity-55"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        {formatFinancialDate(entry.transactionDate)}
                      </p>
                      <h3 className="mt-1 truncate font-extrabold text-slate-950">
                        {entry.description}
                      </h3>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {entry.detail}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 font-black ${
                        isIncome ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isIncome ? "+" : "−"}
                      {formatMoney(entry.amountMinor, currency)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-xs text-slate-500">Saldo após item</p>
                      <p className="font-extrabold text-slate-950">
                        {formatMoney(entry.runningBalanceMinor, currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">
                        {TRANSACTION_STATUS_LABELS[entry.status]}
                      </span>
                      <ReconciliationControl
                        accountId={accountId}
                        entry={entry}
                      />
                      {entry.editHref ? (
                        <Link
                          href={entry.editHref}
                          className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm font-bold text-blue-700"
                        >
                          Editar
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <Pagination accountId={accountId} page={page} pageCount={pageCount} />
    </section>
  );
}
