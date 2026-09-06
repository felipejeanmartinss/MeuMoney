import Link from "next/link";
import {
  deleteTransaction,
  toggleAccountEntryReconciliation,
} from "@/app/actions/transactions";
import {
  AccountRegisterEntryComposer,
  type AccountRegisterEntryComposerProps,
} from "@/components/accounts/account-register-entry-composer";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import type { AccountRegisterEntry } from "@/domain/account-register";
import { formatMoney } from "@/domain/money";
import { TRANSACTION_STATUS_LABELS } from "@/domain/transactions";
import type { SupportedCurrency } from "@/types/database";
import { formatFinancialDate } from "@/utils/financial-formatters";

const PAGE_SIZE = 100;

const messages: Record<string, { text: string; error?: boolean }> = {
  "reconciliation-updated": {
    text: "Conciliação atualizada com sucesso.",
  },
  "reconciliation-error": {
    text: "Não foi possível atualizar a conciliação.",
    error: true,
  },
  "investment-recorded": {
    text: "Movimento de investimento registrado e vinculado à posição.",
  },
  "transaction-created": {
    text: "Lançamento criado com sucesso.",
  },
  "transfer-created": {
    text: "Transferência criada com sucesso.",
  },
  "transaction-deleted": {
    text: "Lançamento excluído com sucesso.",
  },
  "transaction-delete-error": {
    text: "Não foi possível excluir o lançamento.",
    error: true,
  },
};

function ReconciliationControl({
  accountId,
  entry,
  page,
}: {
  accountId: string;
  entry: AccountRegisterEntry;
  page: number;
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
      <input type="hidden" name="page" value={page} />
      <input
        type="hidden"
        name="reconciled"
        value={reconciled ? "false" : "true"}
      />
      <button
        type="submit"
        aria-label={`${reconciled ? "Desmarcar" : "Marcar"} ${entry.description} como reconciliado`}
        aria-pressed={reconciled}
        className={`inline-flex size-7 items-center justify-center rounded border text-[0.7rem] font-black transition ${
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
      className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-3"
    >
      {page > 1 ? (
        <Link
          href={`/accounts/${accountId}?tab=statement&page=${page - 1}#account-register`}
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
          href={`/accounts/${accountId}?tab=statement&page=${page + 1}#account-register`}
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
  asOfDate,
  requestedPage,
  message,
  entryComposer,
}: {
  accountId: string;
  currency: SupportedCurrency;
  entries: AccountRegisterEntry[];
  openingBalanceDate: string;
  openingBalanceMinor: number;
  asOfDate: string;
  requestedPage?: string;
  message?: string;
  entryComposer?: AccountRegisterEntryComposerProps;
}) {
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const parsedPage = Number.parseInt(requestedPage ?? "1", 10);
  const page = Number.isFinite(parsedPage)
    ? Math.min(Math.max(parsedPage, 1), pageCount)
    : 1;
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(pageStart, page * PAGE_SIZE);
  const firstCurrentEntryIndex = entries.findIndex((entry) => !entry.isFuture);
  const feedback = message ? messages[message] : undefined;

  return (
    <section id="account-register" className="scroll-mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-3 py-2.5">
        <div>
          <h2 className="font-extrabold text-slate-950">
            Extrato da conta
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {entries.length} movimentações · saldo inicial de{" "}
            {formatMoney(openingBalanceMinor, currency)} em{" "}
            {formatFinancialDate(openingBalanceDate)}
          </p>
        </div>
        {entryComposer ? (
          <AccountRegisterEntryComposer {...entryComposer} />
        ) : null}
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
            <table className="w-full min-w-[1080px] table-fixed border-collapse text-[0.82rem]">
              <caption className="sr-only">
                Movimentações da conta, das mais recentes para as mais antigas
              </caption>
              <thead className="border-b border-slate-300 bg-slate-100 text-left text-[0.68rem] uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="w-24 px-2 py-1.5">
                    Data
                  </th>
                  <th scope="col" className="w-[27%] px-2 py-1.5">
                    Descrição
                  </th>
                  <th scope="col" className="w-[27%] px-2 py-1.5">
                    Categoria / origem
                  </th>
                  <th scope="col" className="w-12 px-1 py-1.5 text-center">
                    C
                  </th>
                  <th scope="col" className="w-28 px-2 py-1.5 text-right">
                    Saída
                  </th>
                  <th scope="col" className="w-28 px-2 py-1.5 text-right">
                    Entrada
                  </th>
                  <th scope="col" className="w-28 px-2 py-1.5 text-right">
                    Saldo
                  </th>
                  <th scope="col" className="w-36 px-2 py-1.5 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry, index) => {
                  const isIncome = entry.signedAmountMinor > 0;
                  const startsCurrentPeriod =
                    firstCurrentEntryIndex > 0 &&
                    pageStart + index === firstCurrentEntryIndex;
                  return (
                    <tr
                      key={`${entry.entryType}-${entry.id}`}
                      className={`${entry.isActive ? "" : "opacity-55"} ${startsCurrentPeriod ? "border-t-4 border-t-slate-700" : "border-t border-t-slate-200"} hover:bg-emerald-50/40`}
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-700">
                        {startsCurrentPeriod ? (
                          <span className="sr-only">
                            Lançamentos realizados até {formatFinancialDate(asOfDate)}
                          </span>
                        ) : null}
                        {formatFinancialDate(entry.transactionDate)}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate font-semibold text-slate-950">
                            {entry.description}
                          </p>
                          {entry.status !== "completed" ? (
                            <span className="shrink-0 text-[0.65rem] font-bold uppercase text-amber-700">
                              {TRANSACTION_STATUS_LABELS[entry.status]}
                            </span>
                          ) : null}
                          {!entry.isActive ? (
                            <span className="shrink-0 text-[0.65rem] font-bold uppercase text-slate-500">
                              Inativo
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">
                        <p className="truncate">{entry.detail}</p>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <ReconciliationControl
                          accountId={accountId}
                          entry={entry}
                          page={page}
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-rose-700">
                        {!isIncome
                          ? formatMoney(entry.amountMinor, currency)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-emerald-700">
                        {isIncome
                          ? formatMoney(entry.amountMinor, currency)
                          : "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-1.5 text-right font-extrabold ${
                          entry.runningBalanceMinor < 0
                            ? "text-rose-700"
                            : "text-slate-950"
                        }`}
                      >
                        {formatMoney(entry.runningBalanceMinor, currency)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {entry.editHref ? (
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={entry.editHref}
                              className="text-sm font-bold text-blue-700 hover:underline"
                            >
                              Editar
                            </Link>
                            {entry.entryType === "transaction" ? (
                              <form action={deleteTransaction}>
                                <input type="hidden" name="id" value={entry.id} />
                                <input type="hidden" name="accountId" value={accountId} />
                                <input type="hidden" name="page" value={page} />
                                <ConfirmSubmitButton
                                  confirmation={`Excluir definitivamente “${entry.description}”?`}
                                  className="text-sm font-bold text-red-700 hover:underline disabled:opacity-50"
                                >
                                  Excluir
                                </ConfirmSubmitButton>
                              </form>
                            ) : null}
                          </div>
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

          <div className="md:hidden">
            {pageEntries.map((entry, index) => {
              const isIncome = entry.signedAmountMinor > 0;
              const startsCurrentPeriod =
                firstCurrentEntryIndex > 0 &&
                pageStart + index === firstCurrentEntryIndex;
              return (
                <article
                  key={`${entry.entryType}-${entry.id}`}
                  className={`grid gap-3 border-t px-4 py-4 ${startsCurrentPeriod ? "border-t-4 border-t-slate-700" : "border-t-slate-100"} ${entry.isActive ? "" : "opacity-55"}`}
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
                      {entry.status !== "completed" ? (
                        <span className="text-xs font-bold text-amber-700">
                          {TRANSACTION_STATUS_LABELS[entry.status]}
                        </span>
                      ) : null}
                      <ReconciliationControl
                        accountId={accountId}
                        entry={entry}
                        page={page}
                      />
                      {entry.editHref ? (
                        <>
                          <Link
                            href={entry.editHref}
                            className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm font-bold text-blue-700"
                          >
                            Editar
                          </Link>
                          {entry.entryType === "transaction" ? (
                            <form action={deleteTransaction}>
                              <input type="hidden" name="id" value={entry.id} />
                              <input type="hidden" name="accountId" value={accountId} />
                              <input type="hidden" name="page" value={page} />
                              <ConfirmSubmitButton
                                confirmation={`Excluir definitivamente “${entry.description}”?`}
                                className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm font-bold text-red-700 disabled:opacity-50"
                              >
                                Excluir
                              </ConfirmSubmitButton>
                            </form>
                          ) : null}
                        </>
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
