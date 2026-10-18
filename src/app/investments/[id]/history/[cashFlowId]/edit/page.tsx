import Link from "next/link";
import { notFound } from "next/navigation";
import { InvestmentCashFlowEditForm } from "@/components/forms/investment-cash-flow-edit-form";
import { investmentCashFlowIdSchema, investmentPositionIdSchema } from "@/domain/investments";
import { getCurrentUserInvestmentCashFlow, getCurrentUserInvestmentPosition } from "@/services/finance/investments-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Editar movimento de investimento" };

export default async function EditInvestmentCashFlowPage({ params }: {
  params: Promise<{ id: string; cashFlowId: string }>;
}) {
  const values = await params;
  const positionId = investmentPositionIdSchema.safeParse(values.id);
  const cashFlowId = investmentCashFlowIdSchema.safeParse(values.cashFlowId);
  if (!positionId.success || !cashFlowId.success) notFound();
  const [positionResult, flowResult] = await Promise.all([
    getCurrentUserInvestmentPosition(positionId.data),
    getCurrentUserInvestmentCashFlow(cashFlowId.data),
  ]);
  const position = positionResult.position;
  const flow = flowResult.cashFlow;
  if (positionResult.hasError || flowResult.hasError || !position || !flow || flow.position_id !== position.id) notFound();

  return <main className="mx-auto grid max-w-xl gap-4 px-4 py-6 sm:py-10">
    <div>
      <Link href={`/investments/${position.id}/history`} className="text-sm font-semibold text-emerald-700 hover:underline">← Voltar ao histórico</Link>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Editar movimento</h1>
      <p className="mt-1 text-sm text-slate-600">{position.asset_name}</p>
    </div>
    {flow.source_transfer_id ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      Este movimento vem de uma transferência. Edite a origem para atualizar as duas contas e a posição juntas.
      <Link href={`/transfers/${flow.source_transfer_id}/edit`} className="mt-2 block font-bold underline">Editar transferência</Link>
    </section> : <section className="rounded-xl border border-slate-200 bg-white p-4">
      <InvestmentCashFlowEditForm flow={flow} sourceDescription={flowResult.sourceDescription} maxDate={toIsoDate(new Date())} />
    </section>}
  </main>;
}
