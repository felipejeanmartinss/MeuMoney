import Link from "next/link";
import { notFound } from "next/navigation";
import { InvestmentPositionForm } from "@/components/forms/investment-position-form";
import { investmentPositionIdSchema } from "@/domain/investments";
import { minorUnitsToInput } from "@/domain/money";
import { getCurrentUserInvestmentPosition } from "@/services/finance/investments-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Editar investimento" };

export default async function EditInvestmentPositionPage({
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
          href="/investments"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para investimentos
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Atualizar posição
        </h1>
        <p className="mt-2 text-slate-600">
          Mudanças de quantidade, custo, valor ou data registram uma nova
          fotografia no histórico.
        </p>
      </div>
      {!position.is_active ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Esta posição está arquivada e não compõe o patrimônio líquido.
        </p>
      ) : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <InvestmentPositionForm
          values={{
            id: position.id,
            institution: position.institution,
            investmentClass: position.investment_class,
            assetName: position.asset_name,
            currency: position.currency,
            quantity: position.quantity.replace(".", ","),
            accumulatedCostMinor: minorUnitsToInput(
              position.accumulated_cost_minor,
            ),
            currentValueMinor: minorUnitsToInput(position.current_value_minor),
            positionDate: position.position_date,
            minPositionDate: position.position_date,
            maxPositionDate: toIsoDate(new Date()),
            context: position.context,
            historyIsComplete: position.history_is_complete,
            notes: position.notes ?? "",
          }}
        />
      </section>
    </main>
  );
}
