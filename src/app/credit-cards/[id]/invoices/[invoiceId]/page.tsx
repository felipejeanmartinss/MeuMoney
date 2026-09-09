import Link from "next/link";
import { notFound } from "next/navigation";
import {
  closeCreditCardInvoice,
  reverseCreditCardInvoicePayment,
  updateCreditCardInstallmentAmount,
} from "@/app/actions/credit-cards";
import { InvoicePaymentForm } from "@/components/forms/invoice-payment-form";
import {
  CREDIT_CARD_INVOICE_STATUS_LABELS,
  effectiveInvoiceStatus,
} from "@/domain/credit-cards";
import { formatMoney, minorUnitsToInput } from "@/domain/money";
import { getCurrentUserCreditCardInvoice } from "@/services/finance/credit-cards-service";
import {
  formatIsoDatePtBr,
  formatReferenceMonthPtBr,
  toIsoDate,
} from "@/utils/dates";

const messages: Record<string, string> = {
  "invoice-closed": "Fatura fechada. As parcelas não podem mais ser alteradas.",
  "invoice-paid": "Pagamento registrado e saldo da conta atualizado.",
  "payment-reversed": "Pagamento estornado com segurança.",
  "installment-updated": "Valor da parcela atualizado.",
  "installment-error": "A parcela só pode ser alterada em uma fatura aberta.",
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
    <main className="mx-auto grid max-w-[1500px] gap-4 px-3 py-5 sm:px-5 lg:px-6">
      <Link
        href={`/credit-cards/${id}/invoices`}
        className="w-fit text-sm font-semibold text-emerald-700"
      >
        ← Voltar para faturas
      </Link>

      <header className="rounded-3xl bg-slate-950 px-6 py-6 text-white shadow-sm lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-300">
              {card.name}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold">
              Fatura {formatReferenceMonthPtBr(invoice.reference_month)}
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Fecha {formatIsoDatePtBr(invoice.closing_date)} · vence{" "}
              {formatIsoDatePtBr(invoice.due_date)}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-400">
              Total da fatura
            </p>
            <p className="mt-1 text-3xl font-extrabold">
              {formatMoney(invoice.total_amount, card.currency)}
            </p>
            <span className="mt-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
              {CREDIT_CARD_INVOICE_STATUS_LABELS[status]}
            </span>
          </div>
        </div>
      </header>

      {query.message && messages[query.message] ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900">
          {messages[query.message]}
        </p>
      ) : null}
      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Parte dos dados da fatura não pôde ser carregada.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-extrabold text-slate-950">Extrato da fatura</h2>
            {invoice.status === "open" ? (
              <p className="text-xs text-slate-500">
                Valores podem ser ajustados enquanto a fatura estiver aberta.
              </p>
            ) : null}
          </div>
          {invoice.status === "open" ? (
            <form action={closeCreditCardInvoice}>
              <input type="hidden" name="cardId" value={card.id} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
                Fechar fatura
              </button>
            </form>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Descrição</th>
                <th className="px-4 py-2 text-center">Parcela</th>
                <th className="px-4 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((installment) => {
                const purchase = purchaseById.get(installment.purchase_id);
                return (
                  <tr key={installment.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {purchase
                        ? formatIsoDatePtBr(purchase.purchase_date)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-slate-950">
                      {purchase?.description ?? "Compra"}
                      {purchase?.is_recurring ? (
                        <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                          Assinatura
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {installment.installment_number}/
                      {installment.installment_count}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right">
                      {invoice.status === "open" &&
                      installment.status === "pending" ? (
                        <form
                          action={updateCreditCardInstallmentAmount}
                          className="flex items-center justify-end gap-2"
                        >
                          <input type="hidden" name="cardId" value={card.id} />
                          <input
                            type="hidden"
                            name="invoiceId"
                            value={invoice.id}
                          />
                          <input
                            type="hidden"
                            name="installmentId"
                            value={installment.id}
                          />
                          <input
                            aria-label={`Valor da parcela ${installment.installment_number}`}
                            className="h-9 w-32 rounded-lg border border-slate-300 px-3 text-right font-bold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                            name="amount"
                            defaultValue={minorUnitsToInput(installment.amount)}
                            inputMode="decimal"
                            required
                          />
                          <button className="h-9 rounded-lg border px-3 text-xs font-bold text-emerald-700">
                            Salvar
                          </button>
                        </form>
                      ) : (
                        <strong>{formatMoney(installment.amount, card.currency)}</strong>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!installments.length ? (
          <p className="p-8 text-center text-slate-600">
            Nenhuma parcela nesta fatura.
          </p>
        ) : null}
      </section>

      {invoice.status === "paid" ? (
        <form
          action={reverseCreditCardInvoicePayment}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white p-4"
        >
          <input type="hidden" name="cardId" value={card.id} />
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <label className="flex items-center gap-2 text-sm text-rose-900">
            <input type="checkbox" name="confirmation" value="yes" required />
            Confirmo o estorno deste pagamento.
          </label>
          <button className="min-h-10 rounded-xl border border-rose-300 px-4 text-sm font-semibold text-rose-700">
            Estornar pagamento
          </button>
        </form>
      ) : null}

      {invoice.status === "closed" || invoice.status === "overdue" ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-extrabold text-slate-950">Pagar fatura</h2>
          <div className="mt-4">
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
