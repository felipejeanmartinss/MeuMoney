import Link from "next/link";
import { notFound } from "next/navigation";
import { InvestmentCashFlowForm } from "@/components/forms/investment-cash-flow-form";
import {
  INVESTMENT_CLASS_LABELS,
  investmentPositionIdSchema,
} from "@/domain/investments";
import { getCurrentUserInvestmentPosition } from "@/services/finance/investments-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Registrar histórico de investimento" };

export default async function NewInvestmentCashFlowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsedId = investmentPositionIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const { position, hasError } =
    await getCurrentUserInvestmentPosition(parsedId.data);
  if (hasError || !position) notFound();

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
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <InvestmentCashFlowForm
          positionId={position.id}
          maxDate={toIsoDate(new Date())}
        />
      </section>
    </main>
  );
}
