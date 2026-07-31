"use client";

import { useActionState, useState } from "react";
import {
  createTransaction,
  updateTransaction,
} from "@/app/actions/transactions";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "@/domain/transactions";
import { CONTEXT_LABELS } from "@/domain/accounts";
import { getCategoryDisplayName } from "@/domain/categories";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type {
  FinancialContext,
  SupportedCurrency,
  TransactionStatus,
  TransactionType,
} from "@/types/database";

type AccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  context: FinancialContext;
};

type CategoryOption = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: TransactionType;
  context: FinancialContext;
  is_system: boolean;
  archived_at: string | null;
};

type TransactionFormValues = {
  id?: string;
  accountId?: string;
  categoryId?: string;
  transactionType?: TransactionType;
  description?: string;
  amountMinor?: string;
  transactionDate?: string;
  status?: TransactionStatus;
  notes?: string;
};

const initialState: FinancialFormState = { status: "idle" };

export function TransactionForm({
  accounts,
  categories,
  values,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  values: TransactionFormValues;
}) {
  const action = values.id ? updateTransaction : createTransaction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [transactionType, setTransactionType] = useState<TransactionType>(
    values.transactionType ?? "expense",
  );
  const [categoryId, setCategoryId] = useState(values.categoryId ?? "");
  const filteredCategories = categories.filter(
    (category) => category.kind === transactionType,
  );

  function changeTransactionType(type: TransactionType) {
    setTransactionType(type);
    const selected = categories.find((category) => category.id === categoryId);
    if (!selected || selected.kind !== type) setCategoryId("");
  }

  return (
    <form action={formAction} className="grid gap-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field
        label="Tipo de lançamento"
        error={state.fieldErrors?.transactionType?.[0]}
      >
        <select
          className={inputClass(Boolean(state.fieldErrors?.transactionType))}
          name="transactionType"
          value={transactionType}
          onChange={(event) =>
            changeTransactionType(event.target.value as TransactionType)
          }
          required
        >
          {TRANSACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {TRANSACTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.description))}
          name="description"
          defaultValue={values.description}
          maxLength={180}
          placeholder={
            transactionType === "income"
              ? "Ex.: Salário"
              : "Ex.: Compra do supermercado"
          }
          required
          aria-invalid={Boolean(state.fieldErrors?.description)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Conta" error={state.fieldErrors?.accountId?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.accountId))}
            name="accountId"
            defaultValue={values.accountId ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors?.accountId)}
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

        <Field label="Categoria" error={state.fieldErrors?.categoryId?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.categoryId))}
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            required
            aria-invalid={Boolean(state.fieldErrors?.categoryId)}
          >
            <option value="" disabled>
              Selecione
            </option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {getCategoryDisplayName(category, categories)} ·{" "}
                {CONTEXT_LABELS[category.context]}
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
            aria-invalid={Boolean(state.fieldErrors?.amountMinor)}
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
            aria-invalid={Boolean(state.fieldErrors?.transactionDate)}
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

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
        <textarea
          className={`${inputClass(Boolean(state.fieldErrors?.notes))} min-h-28 py-3`}
          name="notes"
          defaultValue={values.notes}
          maxLength={1000}
          placeholder="Opcional"
          aria-invalid={Boolean(state.fieldErrors?.notes)}
        />
      </Field>

      <SubmitButton pending={pending}>
        {values.id ? "Salvar alterações" : "Criar lançamento"}
      </SubmitButton>
    </form>
  );
}
