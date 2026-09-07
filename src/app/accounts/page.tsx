import Link from "next/link";
import { toggleAccountStatus } from "@/app/actions/accounts";
import { ACCOUNT_TYPE_LABELS, CONTEXT_LABELS } from "@/domain/accounts";
import { formatMoney } from "@/domain/money";
import { listCurrentUserAccounts } from "@/services/finance/accounts-service";
import { listCurrentUserCreditCards } from "@/services/finance/credit-cards-service";
import type {
  AccountBalance,
  CreditCardSummary,
  SupportedCurrency,
} from "@/types/database";

export const metadata = { title: "Contas" };

const messages: Record<string, string> = {
  created: "Conta cadastrada com sucesso.",
  updated: "Conta atualizada com sucesso.",
  "status-updated": "Status da conta atualizado com sucesso.",
  "status-error": "Não foi possível alterar o status da conta.",
  deleted: "Conta inativa e seu histórico foram excluídos definitivamente.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}

function totalsByCurrency(
  rows: Array<{ currency: SupportedCurrency; value: number }>,
) {
  const totals = new Map<SupportedCurrency, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.value);
  }
  return [...totals.entries()];
}

function CurrencyTotals({
  totals,
  emptyLabel,
}: {
  totals: Array<[SupportedCurrency, number]>;
  emptyLabel: string;
}) {
  if (totals.length === 0) {
    return <span className="text-sm text-slate-500">{emptyLabel}</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {totals.map(([currency, value]) => (
        <span
          key={currency}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800"
        >
          {formatMoney(value, currency)}
        </span>
      ))}
    </div>
  );
}

function AccountBalanceTotals({ accounts }: { accounts: AccountBalance[] }) {
  const activeAccounts = accounts.filter((account) => !account.archived_at);
  const current = totalsByCurrency(
    activeAccounts.map((account) => ({
      currency: account.currency,
      value: account.current_balance_minor,
    })),
  );
  const projected = totalsByCurrency(
    activeAccounts.map((account) => ({
      currency: account.currency,
      value: account.projected_balance_minor,
    })),
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div>
        <p className="mb-1 text-[0.62rem] font-black uppercase tracking-wide text-slate-400">
          Atual
        </p>
        <CurrencyTotals totals={current} emptyLabel="Nenhuma conta" />
      </div>
      <div>
        <p className="mb-1 text-[0.62rem] font-black uppercase tracking-wide text-slate-400">
          Projetado
        </p>
        <CurrencyTotals totals={projected} emptyLabel="Nenhuma projeção" />
      </div>
      <span
        aria-hidden="true"
        className="text-sm text-slate-400 transition group-open:rotate-90"
      >
        ▸
      </span>
    </div>
  );
}

function AccountStatusAction({ account }: { account: AccountBalance }) {
  const archived = Boolean(account.archived_at);
  return (
    <form action={toggleAccountStatus}>
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="archive" value={archived ? "false" : "true"} />
      <button
        type="submit"
        className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        {archived ? "Reativar" : "Inativar"}
      </button>
    </form>
  );
}

function AccountGroup({
  title,
  description,
  accounts,
}: {
  title: string;
  description: string;
  accounts: AccountBalance[];
}) {
  return (
    <details
      open
      className="group min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 border-b border-slate-200 px-5 py-4 marker:hidden sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <AccountBalanceTotals accounts={accounts} />
      </summary>

      {accounts.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          Nenhuma conta neste grupo.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[50rem] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">Conta</th>
                  <th className="px-4 py-3 font-bold">Tipo</th>
                  <th className="px-4 py-3 font-bold">Atualização</th>
                  <th className="px-4 py-3 text-right font-bold">Saldo atual</th>
                  <th className="px-4 py-3 text-right font-bold">Projetado</th>
                  <th className="px-5 py-3 text-right font-bold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-emerald-50/40">
                    <td className="px-5 py-4">
                      <Link
                        href={`/accounts/${account.id}`}
                        className="font-bold text-slate-950 hover:text-emerald-700"
                      >
                        {account.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {CONTEXT_LABELS[account.context]}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {ACCOUNT_TYPE_LABELS[account.type]}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDate(account.updated_at)}
                    </td>
                    <td
                      className={`px-4 py-4 text-right font-extrabold ${
                        account.current_balance_minor < 0
                          ? "text-rose-700"
                          : "text-slate-950"
                      }`}
                    >
                      {formatMoney(
                        account.current_balance_minor,
                        account.currency,
                      )}
                    </td>
                    <td
                      className={`px-4 py-4 text-right font-extrabold ${
                        account.projected_balance_minor < 0
                          ? "text-rose-700"
                          : "text-slate-950"
                      }`}
                    >
                      {formatMoney(
                        account.projected_balance_minor,
                        account.currency,
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            account.archived_at
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {account.archived_at ? "Inativa" : "Ativa"}
                        </span>
                        <AccountStatusAction account={account} />
                        {account.archived_at ? (
                          <Link
                            href={`/accounts/${account.id}/edit#delete-account`}
                            className="min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                          >
                            Excluir
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid divide-y divide-slate-100 md:hidden">
            {accounts.map((account) => (
              <article key={account.id} className="grid gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/accounts/${account.id}`}
                      className="font-extrabold text-slate-950"
                    >
                      {account.name}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">
                      {ACCOUNT_TYPE_LABELS[account.type]} ·{" "}
                      {CONTEXT_LABELS[account.context]}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-500">
                    {account.archived_at ? "Inativa" : "Ativa"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs font-bold text-slate-500">Atual</dt>
                    <dd
                      className={`mt-0.5 text-lg font-extrabold ${
                        account.current_balance_minor < 0
                          ? "text-rose-700"
                          : "text-slate-950"
                      }`}
                    >
                      {formatMoney(account.current_balance_minor, account.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-slate-500">Projetado</dt>
                    <dd
                      className={`mt-0.5 text-lg font-extrabold ${
                        account.projected_balance_minor < 0
                          ? "text-rose-700"
                          : "text-slate-950"
                      }`}
                    >
                      {formatMoney(account.projected_balance_minor, account.currency)}
                    </dd>
                  </div>
                </dl>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    Atualizada em {formatDate(account.updated_at)}
                  </span>
                  <AccountStatusAction account={account} />
                  {account.archived_at ? (
                    <Link
                      href={`/accounts/${account.id}/edit#delete-account`}
                      className="min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Excluir
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </details>
  );
}

function CardsGroup({
  cards,
}: {
  cards: CreditCardSummary[];
}) {
  const totals = totalsByCurrency(
    cards
      .filter((card) => card.is_active)
      .map((card) => ({
        currency: card.currency,
        value: card.current_balance_minor,
      })),
  );

  return (
    <details open className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-col gap-3 border-b border-slate-200 px-5 py-4 marker:hidden sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">
            Cartões de crédito
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Compras ativas menos transferências já realizadas para cada cartão.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CurrencyTotals totals={totals} emptyLabel="Nenhum cartão" />
          <span aria-hidden="true" className="text-sm text-slate-400 transition group-open:rotate-90">▸</span>
        </div>
      </summary>
      {cards.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          Nenhum cartão cadastrado.
        </p>
      ) : (
        <div className="grid divide-y divide-slate-100">
          {cards.map((card) => (
            <Link
              key={card.id}
              href={`/credit-cards/${card.id}`}
              className="grid gap-2 px-5 py-4 hover:bg-emerald-50/40 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6"
            >
              <div>
                <span className="font-extrabold text-slate-950">
                  {card.name}
                </span>
                <p className="mt-0.5 text-sm text-slate-500">
                  {card.issuer} · final {card.last_four_digits}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Saldo do cartão
                </p>
                <p className="mt-1 font-extrabold text-rose-700">
                  {formatMoney(card.current_balance_minor, card.currency)}
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {card.is_active ? "Ativo" : "Inativo"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </details>
  );
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; status?: string }>;
}) {
  const [accountResult, cardResult, params] = await Promise.all([
    listCurrentUserAccounts(),
    listCurrentUserCreditCards(),
    searchParams,
  ]);
  const feedback = params.message ? messages[params.message] : undefined;
  const showAll = params.status === "all";
  const visibleAccounts = accountResult.accounts.filter(
    (account) => showAll || !account.archived_at,
  );
  const visibleCards = cardResult.cards.filter(
    (card) => showAll || card.is_active,
  );
  const banking = visibleAccounts.filter((account) =>
    ["checking", "savings"].includes(account.type),
  );
  const investmentAccounts = visibleAccounts.filter(
    (account) => account.type === "investment",
  );
  const cashAndOther = visibleAccounts.filter((account) =>
    ["cash", "other"].includes(account.type),
  );
  const hasError = accountResult.hasError || cardResult.hasError;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Central financeira
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Contas
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Saldos, extratos e faturas organizados por tipo e sempre separados
            por moeda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/credit-cards/new"
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-800 hover:bg-slate-50"
          >
            Novo cartão
          </Link>
          <Link
            href="/accounts/new"
            className="inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 font-bold text-white shadow-sm hover:bg-emerald-800"
          >
            Nova conta
          </Link>
        </div>
      </header>

      {feedback ? (
        <p
          role={params.message === "status-error" ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            params.message === "status-error"
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
          Não foi possível carregar toda a central de contas. Tente novamente.
        </p>
      ) : null}

      <nav
        aria-label="Filtro de situação das contas"
        className="flex w-fit rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        <Link
          href="/accounts"
          aria-current={!showAll ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${
            !showAll
              ? "bg-slate-950 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Somente ativas
        </Link>
        <Link
          href="/accounts?status=all"
          aria-current={showAll ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${
            showAll
              ? "bg-slate-950 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Todas
        </Link>
      </nav>

      <div className="grid gap-5">
        <AccountGroup
          title="Contas correntes e poupança"
          description="Contas bancárias usadas no dia a dia e reservas."
          accounts={banking}
        />
        <AccountGroup
          title="Contas de investimento"
          description="Contas transacionais usadas para aportes, resgates e liquidação. As posições ficam na central de Investimentos."
          accounts={investmentAccounts}
        />
        <AccountGroup
          title="Dinheiro e outras contas"
          description="Caixa físico e demais saldos transacionais."
          accounts={cashAndOther}
        />
        <CardsGroup cards={visibleCards} />
      </div>
    </main>
  );
}
