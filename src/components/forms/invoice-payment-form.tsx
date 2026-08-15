"use client";

import { useActionState } from "react";
import { payCreditCardInvoice } from "@/app/actions/credit-cards";
import type { FinancialFormState } from "@/app/actions/accounts";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: FinancialFormState = { status: "idle" };

export function InvoicePaymentForm({
  cardId,
  invoiceId,
  paymentDate,
  linkedAccountId,
  accounts,
}: {
  cardId: string;
  invoiceId: string;
  paymentDate: string;
  linkedAccountId: string | null;
  accounts: { id: string; name: string; currency: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    payCreditCardInvoice,
    initialState,
  );
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <Field label="Conta de pagamento" error={state.fieldErrors?.accountId?.[0]}>
        <select
          className={inputClass(Boolean(state.fieldErrors?.accountId))}
          name="accountId"
          defaultValue={linkedAccountId ?? ""}
          required
        >
          <option value="" disabled>
            Selecione
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Data do pagamento" error={state.fieldErrors?.paymentDate?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.paymentDate))}
          name="paymentDate"
          type="date"
          defaultValue={paymentDate}
          required
        />
      </Field>
      <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <input className="mt-1" type="checkbox" name="confirmation" value="yes" />
        Confirmo a transferência integral da conta para o cartão. Ela será uma
        saída no regime de caixa, sem duplicar a despesa por competência.
      </label>
      {state.fieldErrors?.confirmation?.[0] ? (
        <p className="text-sm text-red-700">
          {state.fieldErrors.confirmation[0]}
        </p>
      ) : null}
      <SubmitButton pending={pending}>Transferir e pagar fatura</SubmitButton>
    </form>
  );
}
