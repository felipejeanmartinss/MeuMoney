"use client";

import { useActionState } from "react";
import {
  createAccount,
  updateAccount,
  type FinancialFormState,
} from "@/app/actions/accounts";
import {
  ACCOUNT_TYPE_LABELS,
  CONTEXT_LABELS,
  EDITABLE_ACCOUNT_TYPES,
  FINANCIAL_CONTEXTS,
} from "@/domain/accounts";
import {
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
} from "@/domain/currencies";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type {
  AccountType,
  FinancialContext,
  SupportedCurrency,
} from "@/types/database";

type AccountFormValues = {
  id?: string;
  name?: string;
  type?: AccountType;
  context?: FinancialContext;
  currency?: SupportedCurrency;
  openingBalanceMinor?: string;
  openingBalanceDate?: string;
};

const initialState: FinancialFormState = { status: "idle" };

export function AccountForm({
  values,
}: {
  values: AccountFormValues;
}) {
  const action = values.id ? updateAccount : createAccount;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field label="Nome da conta" error={state.fieldErrors?.name?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.name))}
          name="name"
          defaultValue={values.name}
          placeholder="Ex.: Conta principal"
          autoComplete="off"
          maxLength={80}
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tipo de conta" error={state.fieldErrors?.type?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.type))}
            name="type"
            defaultValue={values.type ?? "checking"}
            required
            aria-invalid={Boolean(state.fieldErrors?.type)}
          >
            {EDITABLE_ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Uso da conta" error={state.fieldErrors?.context?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.context))}
            name="context"
            defaultValue={values.context ?? "personal"}
            required
            aria-invalid={Boolean(state.fieldErrors?.context)}
          >
            {FINANCIAL_CONTEXTS.map((context) => (
              <option key={context} value={context}>
                {CONTEXT_LABELS[context]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Moeda" error={state.fieldErrors?.currency?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.currency))}
            name="currency"
            defaultValue={values.currency ?? "BRL"}
            required
            aria-invalid={Boolean(state.fieldErrors?.currency)}
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {CURRENCY_LABELS[currency]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Saldo inicial"
          error={state.fieldErrors?.openingBalanceMinor?.[0]}
        >
          <input
            className={inputClass(
              Boolean(state.fieldErrors?.openingBalanceMinor),
            )}
            name="openingBalanceMinor"
            defaultValue={values.openingBalanceMinor ?? "0,00"}
            inputMode="decimal"
            placeholder="0,00"
            required
            aria-invalid={Boolean(state.fieldErrors?.openingBalanceMinor)}
            aria-describedby="opening-balance-help"
          />
          <span
            id="opening-balance-help"
            className="text-xs font-normal text-slate-500"
          >
            Use valor negativo se a conta começou com saldo devedor.
          </span>
        </Field>
      </div>

      <Field
        label="Data de referência do saldo inicial"
        error={state.fieldErrors?.openingBalanceDate?.[0]}
      >
        <input
          className={inputClass(
            Boolean(state.fieldErrors?.openingBalanceDate),
          )}
          name="openingBalanceDate"
          type="date"
          defaultValue={values.openingBalanceDate}
          required
          aria-invalid={Boolean(state.fieldErrors?.openingBalanceDate)}
        />
      </Field>

      <SubmitButton pending={pending}>
        {values.id ? "Salvar alterações" : "Cadastrar conta"}
      </SubmitButton>
    </form>
  );
}
