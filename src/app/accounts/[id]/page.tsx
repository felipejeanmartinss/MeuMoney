import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountRegister } from "@/components/accounts/account-register";
import { ACCOUNT_TYPE_LABELS, CONTEXT_LABELS } from "@/domain/accounts";
import { formatMoney } from "@/domain/money";
import {
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_STATE_LABELS,
} from "@/domain/recurring-transactions";
import { getCurrentUserAccountHub } from "@/services/finance/accounts-service";
import { listCurrentUserTransferCreditCardDestinations } from "@/services/finance/credit-cards-service";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import { getTransactionFormOptions } from "@/services/finance/transactions-service";
import type {
  ImportJobStatus,
  RecurringTransactionState,
} from "@/types/database";
import { formatFinancialDate } from "@/utils/financial-formatters";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Detalhe da conta" };

const importStatusLabels: Record<ImportJobStatus, string> = {
  review: "Em revisão",
  ready: "Pronta",
  completed: "Concluída",
  cancelled: "Cancelada",
  failed: "Falhou",
};

function recurrenceState({
  is_active,
  ended_at,
}: {
  is_active: boolean;
  ended_at: string | null;
}): RecurringTransactionState {
  if (ended_at) return "ended";
  return is_active ? "active" : "suspended";
}

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; message?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [result, formOptions, creditCardOptions, investmentOptions] =
    await Promise.all([
      getCurrentUserAccountHub(id),
      getTransactionFormOptions({ accountId: id }),
      listCurrentUserTransferCreditCardDestinations(),
      listCurrentUserInvestmentPositions(),
    ]);
  if (!result.account && !result.hasError) notFound();

  const account = result.account;
  if (!account) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-extrabold text-red-900">
            Não foi possível abrir esta conta
          </h1>
          <p className="mt-2 text-red-800">
            Tente novamente. Seus dados não foram alterados.
          </p>
          <Link
            href="/accounts"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-red-900 px-4 font-bold text-white"
          >
            Voltar para Contas
          </Link>
        </section>
      </main>
    );
  }

  const activeTab = ["statement", "recurrences", "import"].includes(
    query.tab ?? "",
  )
    ? query.tab
    : "statement";
  const tabs = [
    { id: "statement", label: "Extrato" },
    { id: "recurrences", label: "Contas a Pagar" },
    { id: "import", label: "Importar" },
  ];

  return (
    <main className="mx-auto grid max-w-[1600px] gap-5 px-3 py-6 sm:px-5 lg:px-6 lg:py-8">
      <div>
        <Link
          href="/accounts"
          className="text-sm font-bold text-emerald-700 hover:underline"
        >
          ← Voltar para Contas
        </Link>
        <header className="mt-5 flex flex-col gap-5 rounded-3xl bg-slate-950 p-6 text-white sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-300">
              {ACCOUNT_TYPE_LABELS[account.type]} ·{" "}
              {CONTEXT_LABELS[account.context]}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {account.name}
            </h1>
            <p className="mt-3 text-sm text-slate-300">
              {account.archived_at ? "Conta inativa" : "Conta ativa"} · saldo em{" "}
              {account.currency}
            </p>
          </div>
          <div className="sm:text-right">
            <div className="grid grid-cols-2 gap-5 sm:gap-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Saldo atual
                </p>
                <p className="mt-1 text-[0.68rem] text-slate-400">
                  fechamento até ontem
                </p>
                <p
                  className={`mt-1 text-2xl font-black ${
                    result.balanceSummary.currentBalanceMinor < 0
                      ? "text-rose-300"
                      : "text-white"
                  }`}
                >
                  {formatMoney(
                    result.balanceSummary.currentBalanceMinor,
                    account.currency,
                  )}
                </p>
              </div>
              <div className="border-l border-slate-700 pl-5 sm:pl-7">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Saldo projetado
                </p>
                <p className="mt-1 text-[0.68rem] text-slate-400">
                  inclui hoje e datas futuras
                </p>
                <p
                  className={`mt-1 text-2xl font-black ${
                    result.balanceSummary.projectedBalanceMinor < 0
                      ? "text-rose-300"
                      : "text-white"
                  }`}
                >
                  {formatMoney(
                    result.balanceSummary.projectedBalanceMinor,
                    account.currency,
                  )}
                </p>
              </div>
            </div>
            <Link
              href={`/accounts/${account.id}/edit`}
              className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-slate-600 px-3 text-sm font-bold hover:bg-slate-800"
            >
              Editar conta
            </Link>
          </div>
        </header>
      </div>

      <nav
        aria-label="Seções da conta"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/accounts/${account.id}?tab=${tab.id}`}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`min-h-11 shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold ${
              activeTab === tab.id
                ? "bg-emerald-700 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === "statement" ? (
        <AccountRegister
          accountId={account.id}
          currency={account.currency}
          entries={result.registerEntries}
          openingBalanceDate={account.opening_balance_date}
          openingBalanceMinor={account.opening_balance_minor}
          asOfDate={result.balanceSummary.asOfDate}
          requestedPage={query.page}
          message={query.message}
          entryComposer={
            account.archived_at
              ? undefined
              : {
                  accountId: account.id,
                  accountType: account.type,
                  transactionDate: toIsoDate(new Date()),
                  accounts: formOptions.accounts,
                  categories: formOptions.categories,
                  groups: formOptions.groups,
                  creditCards: creditCardOptions.destinations,
                  investmentPositions: investmentOptions.positions,
                  hasError:
                    formOptions.hasError ||
                    creditCardOptions.hasError ||
                    investmentOptions.hasError,
                }
          }
        />
      ) : null}

      {activeTab === "recurrences" ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                Contas a pagar da conta
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Compromissos programados sem alterar as regras de geração.
              </p>
            </div>
            <Link
              href={`/recurring-transactions/new?accountId=${account.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 font-bold text-white"
            >
              Nova conta a pagar
            </Link>
          </div>
          {result.recurrences.length === 0 ? (
            <p className="px-5 py-10 text-center text-slate-500">
              Nenhuma conta a pagar vinculada a esta conta.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {result.recurrences.map((recurrence) => {
                const state = recurrenceState(recurrence);
                return (
                  <Link
                    key={recurrence.id}
                    href={`/recurring-transactions/${recurrence.id}/edit`}
                    className="grid gap-2 px-5 py-4 hover:bg-emerald-50/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div>
                      <h3 className="font-bold text-slate-950">
                        {recurrence.description}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {RECURRENCE_FREQUENCY_LABELS[recurrence.frequency]} ·
                        próxima em{" "}
                        {formatFinancialDate(recurrence.next_occurrence)} ·{" "}
                        {RECURRENCE_STATE_LABELS[state]}
                      </p>
                    </div>
                    <p
                      className={`font-extrabold ${
                        recurrence.transaction_type === "income"
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {formatMoney(recurrence.amount_minor, account.currency)}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "import" ? (
        <section className="grid gap-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="text-xl font-extrabold text-emerald-950">
              Importar para {account.name}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-emerald-900">
              A conta ficará predefinida. CSV, OFX, QIF e PDF continuam passando
              pela revisão antes de alterar o histórico.
            </p>
            <Link
              href={`/imports/new?accountId=${account.id}`}
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-800 px-4 font-bold text-white hover:bg-emerald-900"
            >
              Iniciar importação
            </Link>
          </div>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-extrabold text-slate-950">
                Histórico da conta
              </h2>
            </div>
            {result.imports.length === 0 ? (
              <p className="px-5 py-10 text-center text-slate-500">
                Nenhuma importação associada a esta conta.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {result.imports.map((job) => (
                  <Link
                    key={job.id}
                    href={`/imports/${job.id}`}
                    className="grid gap-2 px-5 py-4 hover:bg-emerald-50/40 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <h3 className="font-bold text-slate-950">
                        {job.file_name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {job.file_type.toUpperCase()} ·{" "}
                        {formatFinancialDate(job.created_at.slice(0, 10))}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-slate-600">
                      {importStatusLabels[job.status]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : null}
    </main>
  );
}
