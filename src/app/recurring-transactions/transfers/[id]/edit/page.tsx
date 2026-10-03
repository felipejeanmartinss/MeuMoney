import Link from "next/link";
import { notFound } from "next/navigation";
import { RecurringTransferForm } from "@/components/forms/recurring-transfer-form";
import { minorUnitsToInput } from "@/domain/money";
import { recurringTransactionIdSchema } from "@/domain/recurring-transactions";
import { getRecurringTransactionFormOptions } from "@/services/finance/recurring-transactions-service";
import { getCurrentUserRecurringTransfer } from "@/services/finance/recurring-transfers-service";

export const metadata = { title: "Editar transferência recorrente" };

export default async function EditRecurringTransferPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const id = recurringTransactionIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const [{ transfer, hasError }, options] = await Promise.all([
    getCurrentUserRecurringTransfer(id.data), getRecurringTransactionFormOptions(),
  ]);
  if (hasError || options.hasError || !transfer || transfer.ended_at) notFound();
  return <main className="mx-auto grid max-w-3xl gap-4 px-4 py-6 sm:px-6">
    <Link href="/recurring-transactions" className="text-sm font-semibold text-emerald-700">← Recorrências</Link>
    <h1 className="text-2xl font-extrabold text-slate-950">Editar transferência recorrente</h1>
    <section className="rounded-xl border bg-white p-4 sm:p-6"><RecurringTransferForm accounts={options.accounts}
      values={{ id: transfer.id, sourceAccountId: transfer.source_account_id,
        destinationAccountId: transfer.destination_account_id, description: transfer.description,
        amountMinor: minorUnitsToInput(transfer.amount_minor),
        destinationAmountMinor: minorUnitsToInput(transfer.destination_amount_minor),
        frequency: transfer.frequency, startDate: transfer.start_date,
        nextOccurrence: transfer.next_occurrence, endDate: transfer.end_date,
        notes: transfer.notes }} /></section>
  </main>;
}
