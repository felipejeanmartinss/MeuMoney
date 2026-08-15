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
  creditCardTransferDestinationValue,
  parseTransferDestinationTarget,
  type CreditCardTransferDestination,
} from "@/domain/transfers";
import { formatMoney } from "@/domain/money";
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
  destinationCreditCardId?: string;
  destinationTarget?: string;
  amountMinor?: string;
  transactionDate?: string;
  status?: TransactionStatus;
  description?: string;
  notes?: string;
};

const initialState: FinancialFormState = { status: "idle" };

export function TransferForm({
  accounts,
  creditCards = [],
  values,
}: {
  accounts: AccountOption[];
  creditCards?: CreditCardTransferDestination[];
  values: TransferFormValues;
}) {
  const action = values.id ? updateTransfer : createTransfer;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [sourceId, setSourceId] = useState(values.sourceAccountId ?? "");
  const [destinationTarget, setDestinationTarget] = useState(
    values.destinationTarget ??
      (values.destinationAccountId
      ? accountTransferDestinationValue(values.destinationAccountId)
      : values.destinationCreditCardId
        ? creditCardTransferDestinationValue(values.destinationCreditCardId)
        : ""),
  );
  const [amountInput, setAmountInput] = useState(values.amountMinor ?? "0,00");
  const source = accounts.find((account) => account.id === sourceId);
  const parsedDestination = parseTransferDestinationTarget(destinationTarget);
  const destinationAccountId =
    parsedDestination?.kind === "account" ? parsedDestination.id : "";
  const selectedCreditCard =
    parsedDestination?.kind === "credit_card"
      ? creditCards.find(
          (destination) => destination.id === parsedDestination.id,
        )
      : undefined;
  const destinationOptions = accounts.filter(
    (account) =>
      account.id !== sourceId &&
      (!source || account.currency === source.currency),
  );
  const creditCardOptions = creditCards.filter(
    (destination) => !source || destination.currency === source.currency,
  );

  function destinationCurrency(target: string) {
    const parsed = parseTransferDestinationTarget(target);
    if (parsed?.kind === "account") {
      return accounts.find((account) => account.id === parsed.id)?.currency;
    }
    if (parsed?.kind === "credit_card") {
      return creditCards.find(
        (destination) => destination.id === parsed.id,
      )?.currency;
    }
    return undefined;
  }

  function changeDestination(target: string) {
    setDestinationTarget(target);
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
          <select
            className={inputClass(
              Boolean(
                state.fieldErrors?.destinationTarget ??
                  state.fieldErrors?.destinationAccountId,
              ),
            )}
            name="destinationTarget"
            value={destinationTarget}
            onChange={(event) => changeDestination(event.target.value)}
            required
          >
            <option value="" disabled>
              {sourceId
                ? "Selecione uma conta ou cartão da mesma moeda"
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
            {creditCardOptions.length > 0 ? (
              <optgroup label="Cartões de crédito">
                {creditCardOptions.map((destination) => (
                  <option
                    key={destination.id}
                    value={creditCardTransferDestinationValue(
                      destination.id,
                    )}
                  >
                    {destination.cardName} · saldo{" "}
                    {formatMoney(
                      destination.currentBalanceMinor,
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
        </Field>
      </div>

      {selectedCreditCard ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          A transferência reduz o caixa da conta de origem e o saldo devedor
          de {selectedCreditCard.cardName}. Ela entra apenas no regime de
          caixa; as compras continuam no mês de competência.
        </p>
      ) : null}

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

      <SubmitButton pending={pending}>
        {values.id
          ? "Salvar alterações"
          : selectedCreditCard
            ? "Transferir para o cartão"
            : "Criar transferência"}
      </SubmitButton>
    </form>
  );
}
