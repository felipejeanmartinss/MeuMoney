import Link from "next/link";
import { AccountEntryForm } from "@/components/forms/account-entry-form";
import { listCurrentUserPayableCreditCardDestinations } from "@/services/finance/credit-cards-service";
import { getTransactionFormOptions } from "@/services/finance/transactions-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; type?: string }>;
}) {
  const { accountId, type } = await searchParams;
  const [formOptions, cardPaymentOptions] = await Promise.all([
    getTransactionFormOptions(accountId ? { accountId } : undefined),
    listCurrentUserPayableCreditCardDestinations(),
  ]);
  const { accounts, categories, groups, hasError } = formOptions;
  const selectedAccountId = accounts.some(
    (account) => account.id === accountId,
  )
    ? accountId
    : undefined;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/transactions"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para lançamentos
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Novo lançamento
        </h1>
        <p className="mt-2 text-slate-600">
          Valores são sempre positivos; receita ou despesa define o efeito no
          saldo.
        </p>
      </div>
      {hasError || accounts.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          Cadastre ao menos uma conta e aplique as migrations financeiras antes
          de criar lançamentos.
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <AccountEntryForm
            accounts={accounts}
            categories={categories}
            groups={groups}
            creditCardPaymentDestinations={cardPaymentOptions.destinations}
            accountId={selectedAccountId}
            transactionDate={toIsoDate(new Date())}
            initialMode={
              type === "income" || type === "transfer" ? type : "expense"
            }
          />
        </section>
      )}
    </main>
  );
}
