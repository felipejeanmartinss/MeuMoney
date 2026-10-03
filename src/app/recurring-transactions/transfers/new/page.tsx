import Link from "next/link";
import { RecurringTransferForm } from "@/components/forms/recurring-transfer-form";
import { getRecurringTransactionFormOptions } from "@/services/finance/recurring-transactions-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Nova transferência recorrente" };

export default async function NewRecurringTransferPage() {
  const { accounts, hasError } = await getRecurringTransactionFormOptions();
  const today = toIsoDate(new Date());
  return <main className="mx-auto grid max-w-3xl gap-4 px-4 py-6 sm:px-6">
    <Link href="/recurring-transactions" className="text-sm font-semibold text-emerald-700">← Recorrências</Link>
    <h1 className="text-2xl font-extrabold text-slate-950">Transferência recorrente</h1>
    {hasError || accounts.length < 2 ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">São necessárias duas contas ativas.</p>
      : <section className="rounded-xl border bg-white p-4 sm:p-6"><RecurringTransferForm accounts={accounts}
          values={{ startDate: today, nextOccurrence: today, amountMinor: "0,00" }} /></section>}
  </main>;
}
