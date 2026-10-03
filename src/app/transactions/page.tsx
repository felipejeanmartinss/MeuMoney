import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import {
  clearInactiveAutomaticTransactions,
  deleteTransaction,
} from "@/app/actions/transactions";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { inputClass } from "@/components/forms/form-control-styles";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { getCategoryQualifiedName } from "@/domain/categories";
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  transactionFiltersSchema,
} from "@/domain/transactions";
import { listCurrentUserTransactions } from "@/services/finance/transactions-service";
import {
  formatFinancialAmount,
  formatFinancialDate,
} from "@/utils/financial-formatters";

export const metadata = { title: "Lançamentos" };

const messages: Record<string, string> = {
  created: "Lançamento criado com sucesso.",
  "card-paid":
    "Transferência para o cartão registrada e fatura paga com sucesso.",
  updated: "Lançamento atualizado com sucesso.",
  deleted: "Lançamento excluído com sucesso.",
  "delete-error": "Não foi possível excluir o lançamento.",
  "inactive-automatic-cleared": "Lançamentos automáticos inativos removidos.",
};

export default async function TransactionsPage({
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
  const parsedFilters = transactionFiltersSchema.safeParse(singleParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : { activity: "active" as const, uncategorized: false };
  const { transactions, accounts, categories, groups, hasError } =
    await listCurrentUserTransactions(filters);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const messageCode =
    typeof rawParams.message === "string" ? rawParams.message : undefined;
  const feedback = messageCode ? messages[messageCode] : undefined;
  const feedbackIsError = messageCode === "delete-error";
  const unclassifiedCount = transactions.filter(
    (transaction) =>
      transaction.is_active &&
      transaction.origin_type === "manual" &&
      !transaction.category_id,
  ).length;

  return (
    <main className="app-page">
      <PageHeader title="Lançamentos" actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/transfers"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-5 font-semibold text-slate-700 hover:bg-white"
          >
            Transferências
          </Link>
          <Link
            href="/transactions/new"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
          >
            Novo lançamento
          </Link>
        </div>
      } />

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

      {(filters.activity === "inactive" || filters.activity === "all") &&
      transactions.some(
        (transaction) =>
          !transaction.is_active && transaction.origin_type === "system",
      ) ? (
        <form
          action={clearInactiveAutomaticTransactions}
          className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <p className="text-sm text-amber-950">
            Há previsões automáticas inativas que já não afetam saldos.
          </p>
          <ConfirmSubmitButton
            confirmation="Excluir definitivamente todos os lançamentos automáticos inativos?"
            className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 text-sm font-bold text-amber-900"
          >
            Limpar automáticos inativos
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {unclassifiedCount > 0 && !filters.uncategorized ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-950">
            {unclassifiedCount} lançamento{unclassifiedCount === 1 ? "" : "s"} sem categoria precisa{unclassifiedCount === 1 ? "" : "m"} de revisão.
          </p>
          <Link
            href="/transactions?uncategorized=true"
            className="inline-flex min-h-10 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-bold text-amber-900 hover:bg-amber-100"
          >
            Revisar sem categoria
          </Link>
        </div>
      ) : null}

      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {filters.uncategorized ? <input type="hidden" name="uncategorized" value="true" /> : null}
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Tipo
          <select
            name="transactionType"
            defaultValue={filters.transactionType ?? ""}
            className={inputClass()}
          >
            <option value="">Todos</option>
            {TRANSACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TRANSACTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
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
          Conta
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
          Categoria
          <select
            name="categoryId"
            defaultValue={filters.categoryId ?? ""}
            className={inputClass()}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {getCategoryQualifiedName(category, categories, groups)}
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
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="min-h-12 flex-1 rounded-xl bg-slate-900 px-4 font-semibold text-white hover:bg-slate-800">
            Filtrar
          </button>
          <Link
            href="/transactions"
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
          Não foi possível carregar os lançamentos. Confirme se a migration da
          Sprint 3 foi aplicada.
        </p>
      ) : null}

      {!hasError && transactions.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            Nenhum lançamento encontrado
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            Ajuste os filtros ou registre sua primeira receita ou despesa.
          </p>
        </section>
      ) : null}

      <section className="grid gap-1.5">
        {transactions.map((transaction) => {
          const account = accountById.get(transaction.account_id);
          const category = transaction.category_id
            ? categoryById.get(transaction.category_id)
            : undefined;
          const isTechnical =
            transaction.origin_type !== "manual";
          const isRecurring = Boolean(transaction.recurring_transaction_id);
          const income = transaction.transaction_type === "income";
          return (
            <article
              key={transaction.id}
              className={`rounded-xl border border-slate-200 bg-white px-3 py-2 ${
                transaction.is_active ? "" : "opacity-65"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <h2 className="mr-1 truncate text-sm font-semibold text-slate-950">{transaction.description}</h2>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        income
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {TRANSACTION_TYPE_LABELS[transaction.transaction_type]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {TRANSACTION_STATUS_LABELS[transaction.status]}
                    </span>
                    {!transaction.is_active ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Inativo
                      </span>
                    ) : null}
                    {transaction.reconciled_at ? (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Reconciliado
                      </span>
                    ) : null}
                    {transaction.is_subscription ? <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">Assinatura</span> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {account?.name ?? "Conta indisponível"} ·{" "}
                    {isTechnical
                      ? isRecurring
                        ? "Gerado por recorrência"
                        : "Liquidação de fatura"
                      : category
                        ? getCategoryQualifiedName(
                            category,
                            categories,
                            groups,
                          )
                        : "Categoria indisponível"}{" "}
                    ·{" "}
                    {formatFinancialDate(transaction.transaction_date)}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    income ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {income ? "+" : "−"}{" "}
                  {formatFinancialAmount(
                    transaction.amount_minor,
                    account?.currency ?? "BRL",
                    CURRENCY_LOCALES[account?.currency ?? "BRL"],
                  )}
                </p>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                {transaction.is_active && transaction.origin_type === "credit_card_invoice_payment" ? (
                  <Link href={`/transactions/${transaction.id}/edit-date`} className="inline-flex min-h-7 items-center rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Editar data</Link>
                ) : isTechnical && transaction.origin_type !== "system" ? (
                  <span className="text-xs text-slate-500">
                    {isRecurring
                      ? "Gerenciado pela recorrência"
                      : "Gerenciado pela fatura"}
                  </span>
                ) : transaction.origin_type === "system" ? (
                  <>
                    {transaction.is_active ? <Link href={`/transactions/${transaction.id}/edit-date`} className="inline-flex min-h-7 items-center rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Editar data</Link> : null}
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={transaction.id} />
                      <ConfirmSubmitButton
                        confirmation={`Excluir definitivamente o lançamento automático “${transaction.description}”?`}
                        className="min-h-7 rounded-lg px-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Excluir automático
                      </ConfirmSubmitButton>
                    </form>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/transactions/${transaction.id}/edit`}
                      className="inline-flex min-h-7 items-center rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Editar
                    </Link>
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={transaction.id} />
                      <ConfirmSubmitButton
                        confirmation={`Excluir definitivamente “${transaction.description}”?`}
                        className="min-h-7 rounded-lg px-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Excluir
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
