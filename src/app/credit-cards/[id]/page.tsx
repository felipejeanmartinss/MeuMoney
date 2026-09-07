import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryDisplayName } from "@/domain/categories";
import { cancelCreditCardPurchase } from "@/app/actions/credit-cards";
import { formatMoney } from "@/domain/money";
import { getCurrentUserCreditCardDetails } from "@/services/finance/credit-cards-service";

const messages: Record<string, string> = {
  updated: "Cartão atualizado.",
  "purchase-created": "Compra registrada e parcelas geradas.",
  "purchase-updated": "Compra atualizada.",
  "purchase-cancelled": "Compra cancelada.",
  "purchase-error": "A compra não pôde ser cancelada.",
};

export default async function CreditCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { card, purchases, installments, invoices, categories, hasError } =
    await getCurrentUserCreditCardDetails(id);
  if (!card) notFound();
  const categoryById = new Map(
    categories.map((item) => [
      item.id,
      getCategoryDisplayName(item, categories),
    ]),
  );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link href="/credit-cards" className="text-sm font-semibold text-blue-700">
          ← Voltar para cartões
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-950">{card.name}</h1>
            <p className="mt-2 text-slate-600">
              {card.issuer} · final {card.last_four_digits} · fecha dia{" "}
              {card.closing_day} · vence dia {card.due_day}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/credit-cards/${card.id}/edit`}
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-semibold"
            >
              Editar cartão
            </Link>
            <Link
              href={`/credit-cards/${card.id}/invoices`}
              className="inline-flex min-h-11 items-center rounded-xl border border-blue-700 px-4 font-semibold text-blue-700"
            >
              Ver faturas
            </Link>
            {card.is_active ? (
              <>
                <Link
                  href={`/imports/new?creditCardId=${card.id}`}
                  className="inline-flex min-h-11 items-center rounded-xl border border-blue-700 px-4 font-semibold text-blue-700"
                >
                  Importar compras
                </Link>
                <Link
                  href={`/credit-cards/${card.id}/purchases/new`}
                  className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-4 font-semibold text-white"
                >
                  Nova compra
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {query.message && messages[query.message] ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
          {messages[query.message]}
        </p>
      ) : null}
      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Parte dos dados não pôde ser carregada.
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Limite total", card.credit_limit],
          ["Saldo atual do cartão", card.current_balance_minor],
          ["Limite disponível", card.available_limit],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-extrabold text-slate-950">
              {formatMoney(Number(value), card.currency)}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="text-xl font-bold text-slate-950">Compras</h2>
        {purchases.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
            Nenhuma compra registrada.
          </p>
        ) : null}
        {purchases.map((purchase) => (
          <article
            key={purchase.id}
            className={`rounded-2xl border bg-white p-5 ${
              purchase.status === "cancelled" ? "opacity-60" : ""
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-950">{purchase.description}</h3>
                <p className="text-sm text-slate-600">
                  {categoryById.get(purchase.category_id) ?? "Categoria"} ·{" "}
                  {purchase.purchase_date} · {purchase.installment_count}x
                </p>
              </div>
              <p className="text-lg font-extrabold text-slate-950">
                {formatMoney(purchase.total_amount, card.currency)}
              </p>
            </div>
            <div className="mt-3 flex gap-2 border-t pt-3">
              {purchase.status === "active" ? (
                <>
                  <Link
                    href={`/credit-cards/${card.id}/purchases/${purchase.id}/edit`}
                    className="inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold"
                  >
                    Editar
                  </Link>
                  <form action={cancelCreditCardPurchase}>
                    <input type="hidden" name="cardId" value={card.id} />
                    <input type="hidden" name="purchaseId" value={purchase.id} />
                    <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-rose-700">
                      Cancelar
                    </button>
                  </form>
                </>
              ) : (
                <span className="text-sm font-semibold text-slate-600">Cancelada</span>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-950">
            Parcelas e próximas faturas
          </h2>
          <Link
            href={`/credit-cards/${card.id}/invoices`}
            className="text-sm font-semibold text-blue-700"
          >
            Ver todas
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border bg-white p-5">
            <h3 className="font-bold text-slate-950">Parcelas futuras</h3>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700">
              {installments
                .filter((item) => item.status === "pending")
                .slice(0, 6)
                .map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between gap-3 border-b border-slate-100 pb-2"
                  >
                    <span>
                      {item.competence_date.slice(0, 7)} ·{" "}
                      {item.installment_number}/{item.installment_count}
                    </span>
                    <strong>{formatMoney(item.amount, card.currency)}</strong>
                  </li>
                ))}
              {!installments.some((item) => item.status === "pending") ? (
                <li>Nenhuma parcela futura.</li>
              ) : null}
            </ul>
          </article>
          <article className="rounded-2xl border bg-white p-5">
            <h3 className="font-bold text-slate-950">Fatura atual e próximas</h3>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700">
              {invoices
                .filter((item) => item.status !== "paid")
                .slice(0, 6)
                .map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/credit-cards/${card.id}/invoices/${item.id}`}
                      className="flex justify-between gap-3 border-b border-slate-100 pb-2 hover:text-blue-700"
                    >
                      <span>{item.reference_month.slice(0, 7)}</span>
                      <strong>{formatMoney(item.total_amount, card.currency)}</strong>
                    </Link>
                  </li>
                ))}
              {!invoices.some((item) => item.status !== "paid") ? (
                <li>Nenhuma fatura em aberto.</li>
              ) : null}
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
