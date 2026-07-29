import Link from "next/link";
import { RecurringTransactionForm } from "@/components/forms/recurring-transaction-form";
import { getRecurringTransactionFormOptions } from "@/services/finance/recurring-transactions-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Nova recorrência" };

export default async function NewRecurringTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const { accountId } = await searchParams;
  const { accounts, categories, hasError } =
    await getRecurringTransactionFormOptions(
      accountId ? { accountId } : undefined,
    );
  const today = toIsoDate(new Date());
  const selectedAccountId = accounts.some(
    (account) => account.id === accountId,
  )
    ? accountId
    : undefined;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/recurring-transactions"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para recorrências
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Nova recorrência
        </h1>
        <p className="mt-2 text-slate-600">
          Configure o calendário; os lançamentos serão gerados como previstos.
        </p>
      </div>
      {hasError || accounts.length === 0 || categories.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          Cadastre ao menos uma conta e uma categoria ativa antes de criar uma
          recorrência.
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <RecurringTransactionForm
            accounts={accounts}
            categories={categories}
            values={{
              accountId: selectedAccountId,
              amountMinor: "0,00",
              frequency: "monthly",
              startDate: today,
              nextOccurrence: today,
            }}
          />
        </section>
      )}
    </main>
  );
}
