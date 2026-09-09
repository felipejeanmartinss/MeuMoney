import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CREDIT_CARD_INVOICE_STATUS_LABELS,
  effectiveInvoiceStatus,
} from "@/domain/credit-cards";
import { formatMoney } from "@/domain/money";
import { listCurrentUserCreditCardInvoices } from "@/services/finance/credit-cards-service";
import {
  formatIsoDatePtBr,
  formatReferenceMonthPtBr,
  toIsoDate,
} from "@/utils/dates";

export const metadata = { title: "Faturas" };

export default async function CreditCardInvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { card, invoices, hasError } =
    await listCurrentUserCreditCardInvoices(id);
  if (!card) notFound();
  const today = toIsoDate(new Date());
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
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
          const status = effectiveInvoiceStatus(
            invoice.status,
            invoice.due_date,
            today,
          );
                return (
                  <tr key={invoice.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-950">
                      <Link href={`/credit-cards/${id}/invoices/${invoice.id}`}>
                        {formatReferenceMonthPtBr(invoice.reference_month)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {formatIsoDatePtBr(invoice.closing_date)}
                    </td>
                    <td className="px-4 py-2.5">
                      {formatIsoDatePtBr(invoice.due_date)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-blue-700">
                      {CREDIT_CARD_INVOICE_STATUS_LABELS[status]}
                    </td>
                    <td className="px-4 py-2.5 text-right font-extrabold">
                      {formatMoney(invoice.total_amount, card.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!hasError && invoices.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
            As faturas aparecerão quando uma compra gerar parcelas.
          </p>
        ) : null}
      </section>
    </main>
  );
}
