import Link from "next/link";
import { notFound } from "next/navigation";
import { TransactionForm } from "@/components/forms/transaction-form";
import { minorUnitsToInput } from "@/domain/money";
import { transactionIdSchema } from "@/domain/transactions";
import {
  getCurrentUserTransaction,
  getTransactionFormOptions,
} from "@/services/finance/transactions-service";

export const metadata = { title: "Editar lançamento" };

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsedId = transactionIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const { transaction, hasError } = await getCurrentUserTransaction(
    parsedId.data,
  );
  if (hasError || !transaction || transaction.origin_type !== "manual") {
    notFound();
  }
  if (!transaction.category_id) notFound();
  const options = await getTransactionFormOptions({
    accountId: transaction.account_id,
    categoryId: transaction.category_id,
  });
  if (options.hasError) notFound();

  const hasAccount = options.accounts.some(
    (account) => account.id === transaction.account_id,
  );
  const hasCategory = options.categories.some(
    (category) => category.id === transaction.category_id,
  );
  if (!hasAccount || !hasCategory) notFound();

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
          Editar lançamento
        </h1>
        <p className="mt-2 text-slate-600">
          O saldo será recalculado automaticamente após a alteração.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <TransactionForm
          accounts={options.accounts}
          categories={options.categories}
          groups={options.groups}
          values={{
            id: transaction.id,
            accountId: transaction.account_id,
            categoryId: transaction.category_id,
            transactionType: transaction.transaction_type,
            description: transaction.description,
            amountMinor: minorUnitsToInput(transaction.amount_minor),
            transactionDate: transaction.transaction_date,
            status: transaction.status,
            notes: transaction.notes ?? "",
          }}
        />
      </section>
    </main>
  );
}
