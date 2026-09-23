import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountRegister } from "@/components/accounts/account-register";
import { ACCOUNT_TYPE_LABELS, CONTEXT_LABELS } from "@/domain/accounts";
import { formatMoney } from "@/domain/money";
import { getCurrentUserAccountHub } from "@/services/finance/accounts-service";
import { listCurrentUserTransferCreditCardDestinations } from "@/services/finance/credit-cards-service";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import { getTransactionFormOptions } from "@/services/finance/transactions-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Detalhe da conta" };

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; message?: string }>;
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

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
      <div>
        <Link
          href="/accounts"
          className="text-sm font-bold text-emerald-700 hover:underline"
        >
          ← Voltar para Contas
        </Link>
        <header className="mt-4 flex flex-col gap-4 rounded-3xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-300">
              {ACCOUNT_TYPE_LABELS[account.type]} ·{" "}
              {CONTEXT_LABELS[account.context]}
            </p>
            <h1 className="mt-1.5 text-3xl font-black tracking-tight sm:text-4xl">
              {account.name}
            </h1>
          </div>
          <div className="sm:text-right">
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Saldo atual
                </p>
                <p
                  className={`mt-1.5 text-2xl font-black ${
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
                <p
                  className={`mt-1.5 text-2xl font-black ${
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
              className="mt-2.5 inline-flex min-h-9 items-center rounded-lg border border-slate-600 px-3 text-sm font-bold hover:bg-slate-800"
            >
              Editar conta
            </Link>
          </div>
        </header>
      </div>

      {result.statementHasError ? (
        <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p>Não foi possível conferir todos os lançamentos com o saldo da conta. O saldo acima vem da visão consolidada; o extrato foi ocultado para não mostrar valores incorretos.</p>
          <Link href={`/accounts/${account.id}`} className="mt-2 inline-flex min-h-9 items-center font-semibold underline">Atualizar extrato</Link>
        </section>
      ) : (
        <AccountRegister
          accountId={account.id}
          accountType={account.type}
          currency={account.currency}
          entries={result.registerEntries}
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
      )}
    </main>
  );
}
