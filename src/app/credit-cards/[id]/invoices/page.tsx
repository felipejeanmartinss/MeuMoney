import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CREDIT_CARD_INVOICE_STATUS_LABELS,
  effectiveInvoiceStatus,
} from "@/domain/credit-cards";
import { formatMoney } from "@/domain/money";
import { listCurrentUserCreditCardInvoices } from "@/services/finance/credit-cards-service";
import { toIsoDate } from "@/utils/dates";

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
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link href={`/credit-cards/${id}`} className="text-sm font-semibold text-blue-700">
          ← Voltar para {card.name}
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold text-slate-950">Faturas</h1>
        <p className="mt-2 text-slate-600">
          Cada fatura consolida as parcelas de uma competência mensal.
        </p>
      </div>
      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          Não foi possível carregar as faturas.
        </p>
      ) : null}
      <section className="grid gap-3">
        {invoices.map((invoice) => {
          const status = effectiveInvoiceStatus(
            invoice.status,
            invoice.due_date,
            today,
          );
          return (
            <Link
              key={invoice.id}
              href={`/credit-cards/${id}/invoices/${invoice.id}`}
              className="rounded-2xl border bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-slate-950">
                    {invoice.reference_month.slice(0, 7)}
                  </h2>
                  <p className="text-sm text-slate-600">
                    Fecha {invoice.closing_date} · vence {invoice.due_date}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-slate-950">
                    {formatMoney(invoice.total_amount, card.currency)}
                  </p>
                  <p className="text-sm font-semibold text-blue-700">
                    {CREDIT_CARD_INVOICE_STATUS_LABELS[status]}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
        {!hasError && invoices.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-600">
            As faturas aparecerão quando uma compra gerar parcelas.
          </p>
        ) : null}
      </section>
    </main>
  );
}
