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
  values,
}: {
  accounts: AccountOption[];
  values: TransferFormValues;
}) {
  const action = values.id ? updateTransfer : createTransfer;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [sourceId, setSourceId] = useState(values.sourceAccountId ?? "");
  const [destinationId, setDestinationId] = useState(
    values.destinationAccountId ?? "",
  );
  const source = accounts.find((account) => account.id === sourceId);
  const destinationOptions = accounts.filter(
    (account) =>
      account.id !== sourceId &&
      (!source || account.currency === source.currency),
  );

  function changeSource(id: string) {
    setSourceId(id);
    const nextSource = accounts.find((account) => account.id === id);
    const destination = accounts.find(
      (account) => account.id === destinationId,
    );
    if (
      !destination ||
      destination.id === id ||
      destination.currency !== nextSource?.currency
    ) {
      setDestinationId("");
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
          label="Conta de destino"
          error={state.fieldErrors?.destinationAccountId?.[0]}
        >
          <select
            className={inputClass(
              Boolean(state.fieldErrors?.destinationAccountId),
            )}
            name="destinationAccountId"
            value={destinationId}
            onChange={(event) => setDestinationId(event.target.value)}
            required
          >
            <option value="" disabled>
              {sourceId
                ? "Selecione uma conta da mesma moeda"
                : "Escolha primeiro a origem"}
            </option>
            {destinationOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency} ·{" "}
                {CONTEXT_LABELS[account.context]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Valor" error={state.fieldErrors?.amountMinor?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.amountMinor))}
            name="amountMinor"
            defaultValue={values.amountMinor}
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
        {values.id ? "Salvar alterações" : "Criar transferência"}
      </SubmitButton>
    </form>
  );
}
