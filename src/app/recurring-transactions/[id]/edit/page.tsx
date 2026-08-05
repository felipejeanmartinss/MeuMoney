import Link from "next/link";
import { notFound } from "next/navigation";
import { RecurringTransactionForm } from "@/components/forms/recurring-transaction-form";
import { minorUnitsToInput } from "@/domain/money";
import { recurringTransactionIdSchema } from "@/domain/recurring-transactions";
import {
  getCurrentUserRecurringTransaction,
  getRecurringTransactionFormOptions,
} from "@/services/finance/recurring-transactions-service";

export const metadata = { title: "Editar recorrência" };

export default async function EditRecurringTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsedId = recurringTransactionIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const { recurrence, hasError } =
    await getCurrentUserRecurringTransaction(parsedId.data);
  if (hasError || !recurrence || recurrence.ended_at) notFound();

  const options = await getRecurringTransactionFormOptions({
    accountId: recurrence.account_id,
    categoryId: recurrence.category_id,
  });
  if (options.hasError) notFound();

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
          Editar recorrência
        </h1>
        <p className="mt-2 text-slate-600">
          A alteração vale para gerações futuras; previsões existentes são
          preservadas.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <RecurringTransactionForm
          accounts={options.accounts}
          categories={options.categories}
          groups={options.groups}
          values={{
            id: recurrence.id,
            accountId: recurrence.account_id,
            categoryId: recurrence.category_id,
            transactionType: recurrence.transaction_type,
            description: recurrence.description,
            amountMinor: minorUnitsToInput(recurrence.amount_minor),
            frequency: recurrence.frequency,
            startDate: recurrence.start_date,
            endDate: recurrence.end_date ?? "",
            nextOccurrence: recurrence.next_occurrence,
            notes: recurrence.notes ?? "",
          }}
        />
      </section>
    </main>
  );
}
