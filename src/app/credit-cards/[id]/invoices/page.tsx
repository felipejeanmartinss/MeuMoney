import Link from "next/link";
import { notFound } from "next/navigation";
import { openZeroCreditCardInvoice } from "@/app/actions/credit-cards";
import {
  CREDIT_CARD_INVOICE_STATUS_LABELS,
  buildCreditCardInvoiceListRows,
  effectiveInvoiceStatus,
  getInvoiceBillingMonth,
} from "@/domain/credit-cards";
import { formatMoney } from "@/domain/money";
import { listCurrentUserCreditCardInvoices } from "@/services/finance/credit-cards-service";
import {
  formatIsoDatePtBr,
  formatReferenceMonthPtBr,
  currentIsoDate,
} from "@/utils/dates";

export const metadata = { title: "Faturas" };

export default async function CreditCardInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { card, invoices, hasError } =
    await listCurrentUserCreditCardInvoices(id);
  if (!card) notFound();
  const today = currentIsoDate();
  const rows = hasError
    ? []
    : buildCreditCardInvoiceListRows(
        invoices,
        today,
        card.closing_day,
        card.due_day,
      );
  return (
    <main className="mx-auto grid max-w-[1400px] gap-4 px-3 py-5 sm:px-5 lg:px-6">
      <div>
        <Link href={`/credit-cards/${id}`} className="text-sm font-semibold text-blue-700">
          ← Voltar para {card.name}
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">Faturas</h1>
      </div>
      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          Não foi possível carregar as faturas.
        </p>
      ) : null}
      {query.message === "open-error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          Não foi possível abrir a fatura. Faturas com valor ou pagamento registrado não podem ser reabertas como zeradas.
        </p>
      ) : null}
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2">Fatura</th>
                <th className="px-4 py-2">Fechamento</th>
                <th className="px-4 py-2">Vencimento</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const invoice = row.invoice;
                const status = invoice
                  ? effectiveInvoiceStatus(invoice.status, row.dueDate, today)
                  : null;
                return (
                  <tr key={row.referenceMonth} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-950">
                      {invoice ? (
                        <Link href={`/credit-cards/${id}/invoices/${invoice.id}`} className="text-emerald-700 hover:underline">
                          {formatReferenceMonthPtBr(getInvoiceBillingMonth(row.dueDate))}
                        </Link>
                      ) : (
                        formatReferenceMonthPtBr(getInvoiceBillingMonth(row.dueDate))
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {formatIsoDatePtBr(row.closingDate)}
                    </td>
                    <td className="px-4 py-2.5">
                      {formatIsoDatePtBr(row.dueDate)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-blue-700">
                      {status ? CREDIT_CARD_INVOICE_STATUS_LABELS[status] : "Zerada"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-extrabold">
                      {formatMoney(invoice?.total_amount ?? 0, card.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!invoice ||
                      (invoice.status === "paid" &&
                        invoice.total_amount === 0 &&
                        !invoice.payment_transaction_id &&
                        !invoice.payment_account_id) ? (
                        <form action={openZeroCreditCardInvoice}>
                          <input type="hidden" name="cardId" value={card.id} />
                          <input type="hidden" name="referenceMonth" value={row.referenceMonth} />
                          <button className="rounded-lg border border-emerald-700 px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-50">
                            {invoice ? "Reabrir" : "Abrir fatura"}
                          </button>
                        </form>
                      ) : invoice ? (
                        <Link href={`/credit-cards/${id}/invoices/${invoice.id}`} className="font-semibold text-emerald-700 hover:underline">
                          Ver fatura
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
