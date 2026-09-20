import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCardPurchaseForm } from "@/components/forms/credit-card-purchase-form";
import { minorUnitsToInput } from "@/domain/money";
import {
  getCreditCardPurchaseFormOptions,
  getCurrentUserCreditCardPurchase,
} from "@/services/finance/credit-cards-service";

export const metadata = { title: "Editar compra" };

export default async function EditCreditCardPurchasePage({
  params,
}: {
  params: Promise<{ id: string; purchaseId: string }>;
}) {
  const { id, purchaseId } = await params;
  const [{ card, categories }, { purchase, installments }] = await Promise.all([
    getCreditCardPurchaseFormOptions(id),
    getCurrentUserCreditCardPurchase(id, purchaseId),
  ]);
  if (!card || !purchase || purchase.status !== "active") notFound();
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link href={`/credit-cards/${id}`} className="text-sm font-semibold text-blue-700">
          ← Voltar para {card.name}
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold text-slate-950">
          Editar lançamento
        </h1>
        <p className="mt-2 text-slate-600">
          Alterações estruturais são bloqueadas se alguma fatura envolvida já
          já tiver sido paga. Em faturas ainda não pagas, a data pode ser
          corrigida e o lançamento será realocado para o ciclo correto.
        </p>
      </div>
      <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <CreditCardPurchaseForm
          cardId={card.id}
          closingDay={card.closing_day}
          dueDay={card.due_day}
          currency={card.currency}
          categories={categories}
          values={{
            purchaseId: purchase.id,
            entryKind: purchase.entry_kind,
            categoryId: purchase.category_id,
            description: purchase.description,
            totalAmount: minorUnitsToInput(purchase.total_amount),
            purchaseDate: purchase.purchase_date,
            installmentCount: purchase.installment_count,
            installmentAmounts: installments.map((installment) =>
              minorUnitsToInput(installment.amount),
            ),
            isRecurring: purchase.is_recurring,
            notes: purchase.notes,
          }}
          targetInvoiceId={
            purchase.entry_kind === "purchase"
              ? null
              : installments[0]?.invoice_id ?? null
          }
          entryKinds={
            purchase.entry_kind === "purchase"
              ? ["purchase", "refund", "cashback"]
              : ["refund", "cashback"]
          }
        />
      </section>
    </main>
  );
}
