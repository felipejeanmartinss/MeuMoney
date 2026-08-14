"use client";

import { useActionState, useState } from "react";
import {
  createRecurringTransaction,
  updateRecurringTransaction,
} from "@/app/actions/recurring-transactions";
import type { FinancialFormState } from "@/app/actions/accounts";
import type { CategoryGroupItem } from "@/domain/categories";
import {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
} from "@/domain/recurring-transactions";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "@/domain/transactions";
import type {
  FinancialContext,
  RecurrenceFrequency,
  SupportedCurrency,
  TransactionType,
} from "@/types/database";
import { CategoryCombobox } from "./category-combobox";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type AccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  context: FinancialContext;
};

type CategoryOption = {
  id: string;
  group_id: string;
  parent_id: string | null;
  name: string;
  kind: TransactionType;
  context: FinancialContext;
};

type RecurringTransactionFormValues = {
  id?: string;
  accountId?: string;
  categoryId?: string;
  transactionType?: TransactionType;
  description?: string;
  amountMinor?: string;
  frequency?: RecurrenceFrequency;
  startDate?: string;
  endDate?: string;
  nextOccurrence?: string;
  notes?: string;
};

const initialState: FinancialFormState = { status: "idle" };

export function RecurringTransactionForm({
  accounts,
  categories,
  groups,
  values,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  groups: CategoryGroupItem[];
  values: RecurringTransactionFormValues;
}) {
  const action = values.id
    ? updateRecurringTransaction
    : createRecurringTransaction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [transactionType, setTransactionType] = useState<TransactionType>(
    values.transactionType ?? "expense",
  );
  const [categoryId, setCategoryId] = useState(values.categoryId ?? "");
  const [startDate, setStartDate] = useState(values.startDate ?? "");
  const [nextOccurrence, setNextOccurrence] = useState(
    values.nextOccurrence ?? values.startDate ?? "",
  );
  void groups;

  function changeTransactionType(type: TransactionType) {
    setTransactionType(type);
    const selected = categories.find((category) => category.id === categoryId);
    if (!selected || selected.kind !== type) setCategoryId("");
  }

  function changeStartDate(date: string) {
    if (!values.id && (!nextOccurrence || nextOccurrence === startDate)) {
      setNextOccurrence(date);
    }
    setStartDate(date);
  }

  return (
    <form action={formAction} className="grid gap-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field
        label="Tipo"
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
              ? "Ex.: Salário mensal"
              : "Ex.: Aluguel"
          }
          required
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Conta" error={state.fieldErrors?.accountId?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.accountId))}
            name="accountId"
            defaultValue={values.accountId ?? ""}
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

        <Field label="Categoria" error={state.fieldErrors?.categoryId?.[0]}>
          <CategoryCombobox
            name="categoryId"
            categories={categories}
            transactionType={transactionType}
            value={categoryId}
            onValueChange={setCategoryId}
            invalid={Boolean(state.fieldErrors?.categoryId)}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
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

        <Field label="Frequência" error={state.fieldErrors?.frequency?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.frequency))}
            name="frequency"
            defaultValue={values.frequency ?? "monthly"}
            required
          >
            {RECURRENCE_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {RECURRENCE_FREQUENCY_LABELS[frequency]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Data inicial" error={state.fieldErrors?.startDate?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.startDate))}
            name="startDate"
            type="date"
            value={startDate}
            onChange={(event) => changeStartDate(event.target.value)}
            required
          />
        </Field>

        <Field
          label="Próxima ocorrência"
          error={state.fieldErrors?.nextOccurrence?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.nextOccurrence))}
            name="nextOccurrence"
            type="date"
            value={nextOccurrence}
            onChange={(event) => setNextOccurrence(event.target.value)}
            required
          />
        </Field>

        <Field
          label="Data final (opcional)"
          error={state.fieldErrors?.endDate?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.endDate))}
            name="endDate"
            type="date"
            defaultValue={values.endDate}
          />
        </Field>
      </div>

      <FormMessage tone="info">
        A geração cria apenas lançamentos previstos. Editar a recorrência não
        altera previsões que já foram geradas.
      </FormMessage>

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
        {values.id ? "Salvar alterações" : "Criar recorrência"}
      </SubmitButton>
    </form>
  );
}
