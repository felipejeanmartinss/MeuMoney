import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCardPurchaseForm } from "@/components/forms/credit-card-purchase-form";
import { getCreditCardPurchaseFormOptions } from "@/services/finance/credit-cards-service";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Nova compra" };

export default async function NewCreditCardPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { card, categories } = await getCreditCardPurchaseFormOptions(id);
  if (!card || !card.is_active) notFound();
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href={`/credit-cards/${id}`}
          className="text-sm font-semibold text-blue-700"
        >
          ← Voltar para {card.name}
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold text-slate-950">
          Nova compra
        </h1>
        <p className="mt-2 text-slate-600">
          O consumo será categorizado agora; a conta só será movimentada no
          pagamento da fatura.
        </p>
      </div>
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <CreditCardPurchaseForm
          cardId={card.id}
          closingDay={card.closing_day}
          dueDay={card.due_day}
          currency={card.currency}
          categories={categories}
          values={{ purchaseDate: toIsoDate(new Date()), installmentCount: 1 }}
        />
      </section>
    </main>
  );
}
