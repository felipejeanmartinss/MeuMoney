import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCardForm } from "@/components/forms/credit-card-form";
import { minorUnitsToInput } from "@/domain/money";
import {
  getCreditCardFormOptions,
  getCurrentUserCreditCard,
} from "@/services/finance/credit-cards-service";

export const metadata = { title: "Editar cartão" };

export default async function EditCreditCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { card } = await getCurrentUserCreditCard(id);
  if (!card) notFound();
  const { accounts } = await getCreditCardFormOptions(
    card.linked_account_id ?? undefined,
  );
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href={`/credit-cards/${card.id}`}
          className="text-sm font-semibold text-blue-700"
        >
          ← Voltar para o cartão
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold text-slate-950">
          Editar cartão
        </h1>
      </div>
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <CreditCardForm
          accounts={accounts}
          values={{
            id: card.id,
            name: card.name,
            issuer: card.issuer,
            brand: card.brand,
            lastFourDigits: card.last_four_digits,
            creditLimit: minorUnitsToInput(card.credit_limit),
            closingDay: card.closing_day,
            dueDay: card.due_day,
            currency: card.currency,
            linkedAccountId: card.linked_account_id,
          }}
        />
      </section>
    </main>
  );
}
