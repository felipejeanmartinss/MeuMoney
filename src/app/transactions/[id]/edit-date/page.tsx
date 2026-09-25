import Link from "next/link";
import { notFound } from "next/navigation";
import { updateAutomaticTransactionDate } from "@/app/actions/transactions";
import { transactionIdSchema } from "@/domain/transactions";
import { getCurrentUserAutomaticTransaction } from "@/services/finance/transactions-service";

export const metadata = { title: "Ajustar data do lançamento" };

export default async function AutomaticTransactionDatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = transactionIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const { transaction } = await getCurrentUserAutomaticTransaction(parsed.data);
  if (!transaction) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-extrabold text-slate-950">Ajustar data</h1>
      <p className="mt-1 text-sm text-slate-600">{transaction.description}</p>
      <form action={updateAutomaticTransactionDate} className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="id" value={transaction.id} />
        <input type="hidden" name="accountId" value={transaction.account_id} />
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Data do lançamento
          <input name="transactionDate" type="date" defaultValue={transaction.transaction_date} required className="rounded-lg border border-slate-300 px-3 py-2 text-slate-950" />
        </label>
        <div className="flex items-center justify-end gap-3">
          <Link href={`/accounts/${transaction.account_id}#account-register`} className="text-sm font-semibold text-slate-700">Cancelar</Link>
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Salvar data</button>
        </div>
      </form>
    </main>
  );
}
