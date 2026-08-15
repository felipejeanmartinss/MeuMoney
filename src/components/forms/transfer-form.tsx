"use client";

import { useActionState, useState } from "react";
import {
  createTransfer,
  updateTransfer,
} from "@/app/actions/transfers";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
} from "@/domain/transactions";
import { CONTEXT_LABELS } from "@/domain/accounts";
import {
  accountTransferDestinationValue,
  cardInvoiceTransferDestinationValue,
  parseTransferDestinationTarget,
  type CreditCardPaymentDestination,
} from "@/domain/transfers";
import { formatMoney, minorUnitsToInput } from "@/domain/money";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type {
  FinancialContext,
  SupportedCurrency,
  TransactionStatus,
} from "@/types/database";

type AccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  context: FinancialContext;
};

type TransferFormValues = {
  id?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  amountMinor?: string;
  transactionDate?: string;
  status?: TransactionStatus;
  description?: string;
  notes?: string;
};

const initialState: FinancialFormState = { status: "idle" };

export function TransferForm({
  accounts,
  creditCardPaymentDestinations = [],
  values,
}: {
  accounts: AccountOption[];
  creditCardPaymentDestinations?: CreditCardPaymentDestination[];
  values: TransferFormValues;
}) {
  const action = values.id ? updateTransfer : createTransfer;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [sourceId, setSourceId] = useState(values.sourceAccountId ?? "");
  const [destinationTarget, setDestinationTarget] = useState(
    values.destinationAccountId
      ? accountTransferDestinationValue(values.destinationAccountId)
      : "",
  );
  const [amountInput, setAmountInput] = useState(values.amountMinor ?? "0,00");
  const source = accounts.find((account) => account.id === sourceId);
  const parsedDestination = parseTransferDestinationTarget(destinationTarget);
  const destinationAccountId =
    parsedDestination?.kind === "account" ? parsedDestination.id : "";
  const selectedCardPayment =
    parsedDestination?.kind === "credit_card_invoice"
      ? creditCardPaymentDestinations.find(
          (destination) => destination.invoiceId === parsedDestination.id,
        )
      : undefined;
  const destinationOptions = accounts.filter(
    (account) =>
      account.id !== sourceId &&
      (!source || account.currency === source.currency),
  );
  const cardPaymentOptions = creditCardPaymentDestinations.filter(
    (destination) => !source || destination.currency === source.currency,
  );

  function destinationCurrency(target: string) {
    const parsed = parseTransferDestinationTarget(target);
    if (parsed?.kind === "account") {
      return accounts.find((account) => account.id === parsed.id)?.currency;
    }
    if (parsed?.kind === "credit_card_invoice") {
      return creditCardPaymentDestinations.find(
        (destination) => destination.invoiceId === parsed.id,
      )?.currency;
    }
    return undefined;
  }

  function changeDestination(target: string) {
    setDestinationTarget(target);
    const parsed = parseTransferDestinationTarget(target);
    const cardPayment =
      parsed?.kind === "credit_card_invoice"
        ? creditCardPaymentDestinations.find(
            (destination) => destination.invoiceId === parsed.id,
          )
        : undefined;
    setAmountInput(
      cardPayment
        ? minorUnitsToInput(cardPayment.amountMinor)
        : values.amountMinor ?? "0,00",
    );
  }

  function changeSource(id: string) {
    setSourceId(id);
    const nextSource = accounts.find((account) => account.id === id);
    if (
      !destinationTarget ||
      destinationAccountId === id ||
      destinationCurrency(destinationTarget) !== nextSource?.currency
    ) {
      setDestinationTarget("");
      if (selectedCardPayment) setAmountInput(values.amountMinor ?? "0,00");
    }
  }

  return (
    <form action={formAction} className="grid gap-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Conta de origem"
          error={state.fieldErrors?.sourceAccountId?.[0]}
        >
          <select
            className={inputClass(
              Boolean(state.fieldErrors?.sourceAccountId),
            )}
            name="sourceAccountId"
            value={sourceId}
            onChange={(event) => changeSource(event.target.value)}
            required
          >
            <option value="" disabled>
              Selecione
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency} ·{" "}
                {CONTEXT_LABELS[account.context]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Conta ou cartão de destino"
          error={
            state.fieldErrors?.destinationTarget?.[0] ??
            state.fieldErrors?.destinationAccountId?.[0]
          }
        >
          {values.id ? (
            <input
              type="hidden"
              name="destinationAccountId"
              value={destinationAccountId}
            />
          ) : null}
          <select
            className={inputClass(
              Boolean(
                state.fieldErrors?.destinationTarget ??
                  state.fieldErrors?.destinationAccountId,
              ),
            )}
            name={values.id ? undefined : "destinationTarget"}
            value={destinationTarget}
            onChange={(event) => changeDestination(event.target.value)}
            required
          >
            <option value="" disabled>
              {sourceId
                ? "Selecione uma conta da mesma moeda"
                : "Escolha primeiro a origem"}
            </option>
            {destinationOptions.length > 0 ? (
              <optgroup label="Contas">
                {destinationOptions.map((account) => (
                  <option
                    key={account.id}
                    value={accountTransferDestinationValue(account.id)}
                  >
                    {account.name} · {account.currency} ·{" "}
                    {CONTEXT_LABELS[account.context]}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {!values.id && cardPaymentOptions.length > 0 ? (
              <optgroup label="Cartões de crédito — faturas a pagar">
                {cardPaymentOptions.map((destination) => (
                  <option
                    key={destination.invoiceId}
                    value={cardInvoiceTransferDestinationValue(
                      destination.invoiceId,
                    )}
                  >
                    {destination.cardName} · fatura{" "}
                    {destination.referenceMonth.slice(5, 7)}/
                    {destination.referenceMonth.slice(0, 4)} ·{" "}
                    {formatMoney(
                      destination.amountMinor,
                      destination.currency,
                    )}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Valor" error={state.fieldErrors?.amountMinor?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.amountMinor))}
            name="amountMinor"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            readOnly={Boolean(selectedCardPayment)}
            aria-readonly={selectedCardPayment ? "true" : undefined}
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </Field>

        <Field label="Data" error={state.fieldErrors?.transactionDate?.[0]}>
          <input
            className={inputClass(
              Boolean(state.fieldErrors?.transactionDate),
            )}
            name="transactionDate"
            type="date"
            defaultValue={values.transactionDate}
            required
          />
        </Field>

        <Field label="Status" error={state.fieldErrors?.status?.[0]}>
          {selectedCardPayment ? (
            <>
              <input type="hidden" name="status" value="completed" />
              <div className={`${inputClass()} flex items-center bg-slate-50`}>
                Realizado
              </div>
            </>
          ) : (
            <select
              className={inputClass(Boolean(state.fieldErrors?.status))}
              name="status"
              defaultValue={values.status ?? "completed"}
              required
            >
              {TRANSACTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TRANSACTION_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {selectedCardPayment ? (
        <>
          <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <input
              className="mt-1"
              type="checkbox"
              name="confirmation"
              value="yes"
              required
            />
            Confirmo a transferência integral para pagar a fatura de{" "}
            {selectedCardPayment.cardName}. Ela será uma saída no regime de
            caixa, sem duplicar as compras reconhecidas por competência.
          </label>
          {state.fieldErrors?.confirmation?.[0] ? (
            <p className="text-sm text-red-700">
              {state.fieldErrors.confirmation[0]}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <Field
            label="Descrição opcional"
            error={state.fieldErrors?.description?.[0]}
          >
            <input
              className={inputClass(Boolean(state.fieldErrors?.description))}
              name="description"
              defaultValue={values.description}
              maxLength={180}
              placeholder="Ex.: Reserva para emergência"
            />
          </Field>

          <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
            <textarea
              className={`${inputClass(Boolean(state.fieldErrors?.notes))} min-h-28 py-3`}
              name="notes"
              defaultValue={values.notes}
              maxLength={1000}
              placeholder="Opcional"
            />
          </Field>
        </>
      )}

      <SubmitButton pending={pending}>
        {values.id
          ? "Salvar alterações"
          : selectedCardPayment
            ? "Transferir e pagar fatura"
            : "Criar transferência"}
      </SubmitButton>
    </form>
  );
}
