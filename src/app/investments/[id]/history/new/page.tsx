import Link from "next/link";
import { notFound } from "next/navigation";
import { InvestmentCashFlowForm } from "@/components/forms/investment-cash-flow-form";
import { linkInvestmentBankIncome } from "@/app/actions/investments";
import { formatMoney } from "@/domain/money";
import {
  INVESTMENT_CLASS_LABELS,
  INVESTMENT_INCOME_TYPE_LABELS,
  investmentPositionIdSchema,
} from "@/domain/investments";
import { getCurrentUserInvestmentPosition, listCurrentUserBankIncomeCandidates } from "@/services/finance/investments-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Registrar histórico de investimento" };

export default async function NewInvestmentCashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const parsedId = investmentPositionIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const { position, hasError } =
    await getCurrentUserInvestmentPosition(parsedId.data);
  if (hasError || !position) notFound();
  const [{ candidates, hasError: candidateError }, query] = await Promise.all([
    listCurrentUserBankIncomeCandidates(position.id), searchParams,
  ]);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href={`/investments/${position.id}/history`}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para o histórico
        </Link>
        <p className="mt-5 text-sm font-bold uppercase tracking-widest text-blue-700">
          {INVESTMENT_CLASS_LABELS[position.investment_class]} ·{" "}
          {position.currency}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
          Registrar histórico de {position.asset_name}
        </h1>
        <p className="mt-2 text-slate-600">
          Registre um aporte, resgate ou renda efetivamente ocorrido.
        </p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-slate-950">Vincular receita já registrada no extrato</h2>
        <p className="mt-1 text-sm text-slate-600">Para dividendos ou juros já recebidos, use o lançamento bancário existente. Nenhuma entrada adicional será criada.</p>
        {query.message === "link-error" ? <p role="alert" className="mt-2 text-sm text-red-700">Não foi possível vincular. Confira se a receita ainda está disponível.</p> : null}
        {candidateError ? <p role="alert" className="mt-3 text-sm text-amber-700">Não foi possível carregar os lançamentos. Verifique se a migração desta funcionalidade foi aplicada.</p> : candidates.length ? (
          <form action={linkInvestmentBankIncome} className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <input type="hidden" name="positionId" value={position.id} />
            <label className="grid gap-1 text-xs font-semibold text-slate-700">Receita no extrato
              <select name="transactionId" required className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Selecione</option>
                {candidates.map((item) => <option key={item.id} value={item.id}>{item.transaction_date} · {item.accountName} · {item.description} · {formatMoney(item.amount_minor, position.currency)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">Tipo de renda
              <select name="incomeType" defaultValue="dividend" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {Object.entries(INVESTMENT_INCOME_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white">Vincular</button>
          </form>
        ) : <p className="mt-3 text-sm text-slate-500">Nenhuma receita bancária disponível para esta moeda e contexto.</p>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="mb-3 font-bold text-slate-950">Registrar movimento sem lançamento bancário</h2>
        <InvestmentCashFlowForm
          positionId={position.id}
          maxDate={toIsoDate(new Date())}
        />
      </section>
    </main>
  );
}
