import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelFinancingImport } from "@/app/actions/financing-imports";
import { FinancingImportConfirmationForm } from "@/components/forms/financing-import-confirmation-form";
import { calculateFinancingIndicators } from "@/domain/financing-imports";
import { formatMoney } from "@/domain/money";
import { getCurrentUserFinancingImport } from "@/services/finance/financing-imports-service";
import { formatFinancialDate } from "@/utils/financial-formatters";

function maskedReference(reference: string) {
  return reference.length <= 4
    ? reference
    : `${"•".repeat(Math.min(reference.length - 4, 8))}${reference.slice(-4)}`;
}

export default async function FinancingImportReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { job, schedule, extraAmortizations, hasError } =
    await getCurrentUserFinancingImport(id);
  if (!job) notFound();
  if (job.status === "completed" && job.contract_id) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="text-2xl font-black text-slate-950">Importação concluída</h1>
        <Link
          href={`/investments/financings/${job.contract_id}`}
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 font-bold text-white"
        >
          Abrir financiamento
        </Link>
      </main>
    );
  }
  if (job.status !== "review") notFound();

  const indicators = calculateFinancingIndicators(schedule, extraAmortizations);
  const suggestedName = `${job.institution} · ${maskedReference(job.contract_reference)}`;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/investments?tab=financing"
            className="text-sm font-bold text-emerald-700 hover:underline"
          >
            ← Voltar para financiamentos
          </Link>
          <p className="mt-5 text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Revisão do extrato
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">
            {job.institution} · contrato {maskedReference(job.contract_reference)}
          </h1>
          <p className="mt-2 text-slate-600">
            {job.file_name} · {job.source_page_count} páginas · original descartado
          </p>
        </div>
        <form action={cancelFinancingImport}>
          <input type="hidden" name="jobId" value={job.id} />
          <button className="min-h-11 rounded-xl border border-rose-300 bg-white px-4 font-bold text-rose-700">
            Cancelar prévia
          </button>
        </form>
      </header>

      {hasError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          Parte da prévia não pôde ser carregada. Não confirme antes de revisar.
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Saldo devedor", job.current_balance_minor],
          ["Total pago", indicators.totalPaidMinor],
          ["Juros pagos", indicators.interestPaidMinor],
          ["Amortizações extras", indicators.extraCashMinor + indicators.extraFgtsMinor],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-black text-slate-950">
              {formatMoney(Number(value), job.currency)}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Dados reconhecidos</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Valor original</dt><dd className="font-bold">{formatMoney(job.original_principal_minor, job.currency)}</dd></div>
            <div><dt className="text-slate-500">Data do contrato</dt><dd className="font-bold">{formatFinancialDate(job.contract_date)}</dd></div>
            <div><dt className="text-slate-500">Sistema</dt><dd className="font-bold">{job.amortization_system ?? "Não informado"}</dd></div>
            <div><dt className="text-slate-500">Indexador</dt><dd className="font-bold">{job.indexer ?? "Não informado"}</dd></div>
            <div><dt className="text-slate-500">Prazo original</dt><dd className="font-bold">{job.original_term_months ? `${job.original_term_months} meses` : "Não informado"}</dd></div>
            <div><dt className="text-slate-500">Data-base do saldo</dt><dd className="font-bold">{formatFinancialDate(job.balance_date)}</dd></div>
          </dl>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Criar compromisso</h2>
          <p className="mt-1 text-sm text-slate-600">
            A confirmação cria um único passivo patrimonial vinculado ao contrato.
          </p>
          <div className="mt-4">
            <FinancingImportConfirmationForm jobId={job.id} suggestedName={suggestedName} />
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-black text-slate-950">Amostra das parcelas</h2>
          <p className="mt-1 text-sm text-slate-600">
            {schedule.length} registros reconhecidos; confira valores e datas principais.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Parcela</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Principal</th><th className="px-4 py-3">Juros</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Situação</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedule.slice(0, 12).map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 font-bold">{entry.installment_number}</td>
                  <td className="px-4 py-3">{formatFinancialDate(entry.due_date)}</td>
                  <td className="px-4 py-3">{formatMoney(entry.principal_minor, job.currency)}</td>
                  <td className="px-4 py-3">{formatMoney(entry.interest_minor, job.currency)}</td>
                  <td className="px-4 py-3 font-bold">{formatMoney(entry.total_amount_minor, job.currency)}</td>
                  <td className="px-4 py-3">{entry.payment_status === "paid" ? "Paga" : "A vencer"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
