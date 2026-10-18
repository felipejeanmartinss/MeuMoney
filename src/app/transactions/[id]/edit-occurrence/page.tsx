import Link from "next/link";
import { notFound } from "next/navigation";
import { updateRecurringOccurrence } from "@/app/actions/transactions";
import { minorUnitsToInput } from "@/domain/money";
import { transactionIdSchema } from "@/domain/transactions";
import { getCurrentUserRecurringOccurrence } from "@/services/finance/transactions-service";

export const metadata = { title: "Editar ocorrência" };

export default async function EditRecurringOccurrencePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const parsedId = transactionIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const { transaction, hasError } = await getCurrentUserRecurringOccurrence(parsedId.data);
  if (hasError || !transaction) notFound();
  const message = (await searchParams).message;

  return <main className="mx-auto grid max-w-xl gap-4 px-4 py-6 sm:py-10">
    <div>
      <Link href={`/accounts/${transaction.account_id}#account-register`} className="text-sm font-semibold text-emerald-700 hover:underline">← Voltar ao extrato</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Editar ocorrência</h1>
      <p className="mt-1 text-sm text-slate-600">Esta alteração vale só para este lançamento. A regra e as próximas previsões permanecem iguais.</p>
    </div>
    {message ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {message === "invalid" ? "Confira descrição, valor e data." : "Não foi possível salvar. Os dados anteriores foram mantidos."}
    </p> : null}
    <form action={updateRecurringOccurrence} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="id" value={transaction.id} />
      <input type="hidden" name="accountId" value={transaction.account_id} />
      <label className="grid gap-1 text-sm font-semibold text-slate-700">Descrição
        <input name="description" defaultValue={transaction.description} maxLength={180} required className="min-h-10 rounded-lg border border-slate-300 px-3" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">Valor
          <input name="amountMinor" defaultValue={minorUnitsToInput(transaction.amount_minor)} inputMode="decimal" required className="min-h-10 rounded-lg border border-slate-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">Data
          <input name="transactionDate" type="date" defaultValue={transaction.transaction_date} required className="min-h-10 rounded-lg border border-slate-300 px-3" />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">Observações
        <textarea name="notes" defaultValue={transaction.notes ?? ""} maxLength={1000} rows={2} className="rounded-lg border border-slate-300 px-3 py-2" />
      </label>
      <p className="text-xs text-slate-500">O saldo e a conciliação da conta serão recalculados. Referência original: {transaction.scheduled_date}.</p>
      <button className="min-h-10 rounded-lg bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800">Salvar ocorrência</button>
    </form>
  </main>;
}
