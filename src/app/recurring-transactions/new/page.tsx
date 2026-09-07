import Link from "next/link";
import { RecurringTransactionForm } from "@/components/forms/recurring-transaction-form";
import { getRecurringTransactionFormOptions } from "@/services/finance/recurring-transactions-service";
import { minorUnitsToInput } from "@/domain/money";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Nova conta a pagar" };

export default async function NewRecurringTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{
    accountId?: string;
    categoryId?: string;
    transactionType?: string;
    description?: string;
    amountMinor?: string;
    startDate?: string;
    nextOccurrence?: string;
    notes?: string;
  }>;
}) {
  const query = await searchParams;
  const { accountId } = query;
  const { accounts, categories, groups, hasError } =
    await getRecurringTransactionFormOptions(
      accountId ? { accountId } : undefined,
    );
  const today = toIsoDate(new Date());
  const selectedAccountId = accounts.some(
    (account) => account.id === accountId,
  )
    ? accountId
    : undefined;
  const selectedCategory = categories.find(
    (category) => category.id === query.categoryId,
  );
  const transactionType =
    query.transactionType === "income" || query.transactionType === "expense"
      ? query.transactionType
      : selectedCategory?.kind;
  const selectedCategoryId =
    selectedCategory && selectedCategory.kind === transactionType
      ? selectedCategory.id
      : undefined;
  const parsedAmount = Number(query.amountMinor);
  const amountMinor = Number.isSafeInteger(parsedAmount) && parsedAmount > 0
    ? minorUnitsToInput(parsedAmount)
    : "0,00";
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(query.startDate ?? "")
    ? query.startDate!
    : today;
  const nextOccurrence = /^\d{4}-\d{2}-\d{2}$/.test(
    query.nextOccurrence ?? "",
  )
    ? query.nextOccurrence!
    : startDate;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/recurring-transactions"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para Contas a Pagar
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Nova conta a pagar
        </h1>
        <p className="mt-2 text-slate-600">
          Configure o calendário; os lançamentos serão gerados como previstos.
        </p>
      </div>
      {hasError || accounts.length === 0 || categories.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          Cadastre ao menos uma conta e uma categoria ativa antes de criar uma
          conta a pagar.
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <RecurringTransactionForm
            accounts={accounts}
            categories={categories}
            groups={groups}
            values={{
              accountId: selectedAccountId,
              categoryId: selectedCategoryId,
              transactionType,
              description: query.description?.slice(0, 180),
              amountMinor,
              frequency: "monthly",
              startDate,
              nextOccurrence,
              notes: query.notes?.slice(0, 1000),
            }}
          />
        </section>
      )}
    </main>
  );
}
