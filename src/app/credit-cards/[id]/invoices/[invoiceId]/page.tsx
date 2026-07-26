import Link from "next/link";
import { notFound } from "next/navigation";
import {
  closeCreditCardInvoice,
  reverseCreditCardInvoicePayment,
} from "@/app/actions/credit-cards";
import { InvoicePaymentForm } from "@/components/forms/invoice-payment-form";
import {
  CREDIT_CARD_INVOICE_STATUS_LABELS,
  effectiveInvoiceStatus,
} from "@/domain/credit-cards";
import { formatMoney } from "@/domain/money";
import { getCurrentUserCreditCardInvoice } from "@/services/finance/credit-cards-service";
import { toIsoDate } from "@/utils/dates";

const messages: Record<string, string> = {
  "invoice-closed": "Fatura fechada. Novas alterações estruturais foram bloqueadas.",
  "invoice-paid": "Pagamento registrado e saldo da conta atualizado.",
  "payment-reversed": "Pagamento estornado com segurança.",
  "invoice-error": "Não foi possível concluir a operação.",
};

export default async function CreditCardInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ id, invoiceId }, query] = await Promise.all([params, searchParams]);
  const { card, invoice, installments, purchases, accounts, hasError } =
    await getCurrentUserCreditCardInvoice(id, invoiceId);
  if (!card || !invoice) notFound();
  const today = toIsoDate(new Date());
  const status = effectiveInvoiceStatus(invoice.status, invoice.due_date, today);
  const purchaseById = new Map(
    purchases.map((purchase) => [purchase.id, purchase]),
  );
  const paymentAccounts = accounts.filter(
    (account) => account.currency === card.currency,
  );

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href={`/credit-cards/${id}/invoices`}
          className="text-sm font-semibold text-blue-700"
        >
          ← Voltar para faturas
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-950">
              Fatura {invoice.reference_month.slice(0, 7)}
            </h1>
            <p className="mt-2 text-slate-600">
              {card.name} · fecha {invoice.closing_date} · vence{" "}
              {invoice.due_date}
            </p>
          </div>
          <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">
            {CREDIT_CARD_INVOICE_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {query.message && messages[query.message] ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
          {messages[query.message]}
        </p>
      ) : null}
      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          Parte dos dados da fatura não pôde ser carregada.
        </p>
      ) : null}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Total da fatura</p>
        <p className="mt-1 text-3xl font-extrabold text-slate-950">
          {formatMoney(invoice.total_amount, card.currency)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {invoice.status === "open" ? (
            <form action={closeCreditCardInvoice}>
              <input type="hidden" name="cardId" value={card.id} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button className="min-h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white">
                Fechar fatura
              </button>
            </form>
          ) : null}
          {invoice.status === "paid" ? (
            <form
              action={reverseCreditCardInvoicePayment}
              className="grid gap-2 rounded-xl border border-rose-200 p-3"
            >
              <input type="hidden" name="cardId" value={card.id} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <label className="flex items-start gap-2 text-sm text-rose-900">
                <input
                  className="mt-1"
                  type="checkbox"
                  name="confirmation"
                  value="yes"
                  required
                />
                Confirmo o estorno deste pagamento.
              </label>
              <button className="min-h-11 rounded-xl border border-rose-300 px-4 font-semibold text-rose-700">
                Estornar pagamento
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-xl font-bold text-slate-950">Itens</h2>
        {installments.map((installment) => {
          const purchase = purchaseById.get(installment.purchase_id);
          return (
            <article
              key={installment.id}
              className="flex items-center justify-between gap-4 rounded-2xl border bg-white p-5"
            >
              <div>
                <h3 className="font-bold text-slate-950">
                  {purchase?.description ?? "Compra"}
                </h3>
                <p className="text-sm text-slate-600">
                  Parcela {installment.installment_number}/
                  {installment.installment_count}
                </p>
              </div>
              <p className="font-extrabold text-slate-950">
                {formatMoney(installment.amount, card.currency)}
              </p>
            </article>
          );
        })}
      </section>

      {invoice.status === "closed" || invoice.status === "overdue" ? (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Pagar fatura</h2>
          <p className="mt-1 text-sm text-slate-600">
            O pagamento integral cria uma movimentação técnica realizada.
          </p>
          <div className="mt-5">
            <InvoicePaymentForm
              cardId={card.id}
              invoiceId={invoice.id}
              paymentDate={today}
              linkedAccountId={card.linked_account_id}
              accounts={paymentAccounts}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}
