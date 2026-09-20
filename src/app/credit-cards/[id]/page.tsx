import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryDisplayName } from "@/domain/categories";
import { cancelCreditCardPurchase } from "@/app/actions/credit-cards";
import { CreditCardPurchaseForm } from "@/components/forms/credit-card-purchase-form";
import {
  CREDIT_CARD_ENTRY_KIND_LABELS,
  buildCreditCardInvoiceForecast,
  getInvoiceBillingMonth,
  getInvoiceDueDate,
  getPurchaseReferenceMonth,
  selectNextCreditCardInvoice,
} from "@/domain/credit-cards";
import { formatMoney } from "@/domain/money";
import { getCurrentUserCreditCardDetails } from "@/services/finance/credit-cards-service";
import {
  formatIsoDatePtBr,
  formatReferenceMonthPtBr,
  toIsoDate,
} from "@/utils/dates";

const messages: Record<string, string> = {
  updated: "Cartão atualizado.",
  "purchase-created": "Lançamento registrado na fatura.",
  "purchase-updated": "Compra atualizada.",
  "purchase-cancelled": "Compra excluída das compras e das faturas abertas.",
  "purchase-error": "A compra não pôde ser excluída.",
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
  const purchaseById = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  const pendingInstallments = installments.filter(
    (item) => item.status === "pending",
  );
  const openInvoices = invoices.filter((item) => item.status !== "paid");
  const nextOpenInvoice = selectNextCreditCardInvoice(openInvoices);
  const forecastStart =
    nextOpenInvoice?.reference_month ??
    new Date().toISOString().slice(0, 7) + "-01";
  const invoiceForecast = buildCreditCardInvoiceForecast({
    referenceMonth: forecastStart,
    invoices: openInvoices.map((invoice) => ({
      id: invoice.id,
      referenceMonth: invoice.reference_month,
      totalAmountMinor: invoice.total_amount,
    })),
    subscriptions: purchases
      .filter(
        (purchase) =>
          purchase.is_recurring && purchase.entry_kind === "purchase",
      )
      .map((purchase) => ({
        amountMinor: purchase.total_amount,
        firstReferenceMonth: getPurchaseReferenceMonth(
          purchase.purchase_date,
          card.closing_day,
        ),
      })),
  });

  return (
    <main className="mx-auto grid max-w-[1600px] gap-4 px-3 py-5 sm:px-5 lg:px-6">
      <Link
        href="/credit-cards"
        className="w-fit text-sm font-semibold text-emerald-700"
      >
        ← Voltar para cartões
      </Link>

      <header className="rounded-3xl bg-slate-950 px-6 py-6 text-white shadow-sm lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-300">
              {card.issuer} · final {card.last_four_digits}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold">{card.name}</h1>
            <p className="mt-1 text-sm text-slate-300">
              Fecha dia {card.closing_day} · vence dia {card.due_day}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            {[
              ["Próxima fatura", nextOpenInvoice?.total_amount ?? 0],
              ["Comprometido", card.used_limit],
              ["Limite disponível", card.available_limit],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-36 text-right">
                <p className="text-xs font-bold uppercase text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-xl font-extrabold">
                  {formatMoney(Number(value), card.currency)}
                </p>
              </div>
            ))}
            <Link
              href={`/credit-cards/${card.id}/edit`}
              className="inline-flex min-h-10 items-center rounded-xl border border-slate-600 px-4 text-sm font-semibold"
            >
              Editar cartão
            </Link>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
        <Link
          href={`/credit-cards/${card.id}/invoices`}
          className="inline-flex min-h-10 items-center rounded-xl border px-4 text-sm font-semibold"
        >
          Faturas
        </Link>
        {card.is_active ? (
          <>
            <Link
              href={`/imports/new?creditCardId=${card.id}`}
              className="inline-flex min-h-10 items-center rounded-xl border px-4 text-sm font-semibold"
            >
              Importar
            </Link>
          </>
        ) : null}
      </nav>

      {card.is_active ? (
        <details className="group overflow-hidden rounded-2xl border bg-white shadow-sm">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 marker:hidden">
            <span className="font-extrabold text-slate-950">Novo lançamento</span>
            <span className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white group-open:bg-slate-900">
              <span className="group-open:hidden">Novo lançamento</span>
              <span className="hidden group-open:inline">Fechar</span>
            </span>
          </summary>
          <div className="border-t bg-slate-50/60 p-3 sm:p-4">
            <CreditCardPurchaseForm
              cardId={card.id}
              closingDay={card.closing_day}
              dueDay={card.due_day}
              currency={card.currency}
              categories={categories}
              compact
              values={{
                entryKind: "purchase",
                purchaseDate: toIsoDate(new Date()),
                installmentCount: 1,
              }}
            />
          </div>
        </details>
      ) : null}

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

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-extrabold text-slate-950">Extrato do cartão</h2>
          <span className="text-xs text-slate-500">{purchases.length} lançamentos</span>
        </div>
        {purchases.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[0.82rem]">
              <thead className="bg-slate-100 text-left text-[0.68rem] uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Descrição</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Categoria</th>
                  <th className="px-4 py-2 text-center">Parcelas</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    className={`border-t ${
                      purchase.status === "cancelled" ? "opacity-55" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {formatIsoDatePtBr(purchase.purchase_date)}
                    </td>
                    <td className="px-4 py-2 font-semibold text-slate-950">
                      <span>{purchase.description}</span>
                      {purchase.is_recurring ? (
                        <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                          Assinatura
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {CREDIT_CARD_ENTRY_KIND_LABELS[purchase.entry_kind]}
                    </td>
                    <td className="max-w-96 px-4 py-2 text-slate-600">
                      {purchase.category_id
                        ? categoryById.get(purchase.category_id) ?? "Categoria"
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-center text-slate-600">
                      {purchase.is_recurring
                        ? "—"
                        : `${purchase.installment_count}x`}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-2.5 text-right font-extrabold ${
                        purchase.entry_kind === "purchase"
                          ? "text-slate-950"
                          : "text-emerald-700"
                      }`}
                    >
                      {purchase.entry_kind === "purchase" ? "" : "+ "}
                      {formatMoney(purchase.total_amount, card.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {purchase.status === "active" ? (
                        <div className="flex justify-end gap-3">
                          <Link
                            href={`/credit-cards/${card.id}/purchases/${purchase.id}/edit`}
                            className="font-semibold text-emerald-700"
                          >
                            Editar
                          </Link>
                          <form action={cancelCreditCardPurchase}>
                            <input type="hidden" name="cardId" value={card.id} />
                            <input
                              type="hidden"
                              name="purchaseId"
                              value={purchase.id}
                            />
                            <button className="font-semibold text-rose-700">
                              Excluir
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-500">
                          Cancelada
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-center text-slate-600">
            Nenhuma compra registrada.
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="font-extrabold text-slate-950">Parcelas futuras</h2>
          </div>
          <ul className="divide-y text-sm">
            {pendingInstallments.slice(0, 8).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <span>
                  {formatReferenceMonthPtBr(
                    getInvoiceBillingMonth(
                      getInvoiceDueDate(
                        item.competence_date,
                        card.closing_day,
                        card.due_day,
                      ),
                    ),
                  )}{" "}
                  · parcela{" "}
                  {item.installment_number}/{item.installment_count}
                </span>
                <strong>
                  {purchaseById.get(item.purchase_id)?.entry_kind === "purchase"
                    ? ""
                    : "− "}
                  {formatMoney(item.amount, card.currency)}
                </strong>
              </li>
            ))}
            {!pendingInstallments.length ? (
              <li className="px-4 py-6 text-slate-600">Nenhuma parcela futura.</li>
            ) : null}
          </ul>
        </article>

        <article className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-extrabold text-slate-950">Faturas</h2>
            <Link
              href={`/credit-cards/${card.id}/invoices`}
              className="text-sm font-semibold text-emerald-700"
            >
              Ver todas
            </Link>
          </div>
          <ul className="divide-y text-sm">
            {invoiceForecast.map((item) => (
              <li key={item.referenceMonth}>
                {item.invoiceId ? (
                  <Link
                    href={`/credit-cards/${card.id}/invoices/${item.invoiceId}`}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-slate-50"
                  >
                    <span>
                      {formatReferenceMonthPtBr(
                        getInvoiceBillingMonth(
                          openInvoices.find(
                            (invoice) => invoice.id === item.invoiceId,
                          )?.due_date ??
                            getInvoiceDueDate(
                              item.referenceMonth,
                              card.closing_day,
                              card.due_day,
                            ),
                        ),
                      )}
                      {item.projected ? (
                        <small className="ml-2 text-slate-500">projeção</small>
                      ) : null}
                    </span>
                    <strong>{formatMoney(item.amountMinor, card.currency)}</strong>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-slate-600">
                    <span>
                      {formatReferenceMonthPtBr(
                        getInvoiceBillingMonth(
                          getInvoiceDueDate(
                            item.referenceMonth,
                            card.closing_day,
                            card.due_day,
                          ),
                        ),
                      )}{" "}
                      · projeção
                    </span>
                    <strong className="text-slate-900">
                      {formatMoney(item.amountMinor, card.currency)}
                    </strong>
                  </div>
                )}
              </li>
            ))}
            {!invoiceForecast.some((item) => item.amountMinor > 0) ? (
              <li className="px-4 py-6 text-slate-600">Nenhuma fatura em aberto.</li>
            ) : null}
          </ul>
        </article>
      </section>
    </main>
  );
}
