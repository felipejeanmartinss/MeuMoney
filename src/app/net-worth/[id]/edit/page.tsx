import Link from "next/link";
import { notFound } from "next/navigation";
import { NetWorthItemForm } from "@/components/forms/net-worth-item-form";
import { netWorthItemIdSchema } from "@/domain/net-worth";
import { minorUnitsToInput } from "@/domain/money";
import { getCurrentUserNetWorthItem } from "@/services/finance/net-worth-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Editar item patrimonial" };

export default async function EditNetWorthItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsedId = netWorthItemIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const { item, hasError } = await getCurrentUserNetWorthItem(parsedId.data);
  if (hasError || !item) notFound();

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/net-worth"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para patrimônio
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Editar item patrimonial
        </h1>
        <p className="mt-2 text-slate-600">
          Uma mudança de valor ou data atualiza a posição e registra a avaliação
          no histórico.
        </p>
      </div>
      {!item.is_active ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Este item está arquivado. As informações podem ser corrigidas, mas ele
          só volta ao resumo após a reativação.
        </p>
      ) : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <NetWorthItemForm
          values={{
            id: item.id,
            kind: item.kind,
            itemType: item.item_type,
            name: item.name,
            currency: item.currency,
            currentValueMinor: minorUnitsToInput(item.current_value_minor),
            valuationDate: item.valuation_date,
            maxValuationDate: toIsoDate(new Date()),
            context: item.context,
            notes: item.notes ?? "",
          }}
        />
      </section>
    </main>
  );
}
