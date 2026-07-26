"use client";

import { useActionState } from "react";
import {
  createCreditCard,
  updateCreditCard,
} from "@/app/actions/credit-cards";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  CREDIT_CARD_BRANDS,
  CREDIT_CARD_BRAND_LABELS,
} from "@/domain/credit-cards";
import {
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
} from "@/domain/currencies";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type {
  CreditCardBrand,
  SupportedCurrency,
} from "@/types/database";

type AccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
};

type Values = {
  id?: string;
  name?: string;
  issuer?: string;
  brand?: CreditCardBrand;
  lastFourDigits?: string;
  creditLimit?: string;
  closingDay?: number;
  dueDay?: number;
  currency?: SupportedCurrency;
  linkedAccountId?: string | null;
};

const initialState: FinancialFormState = { status: "idle" };

export function CreditCardForm({
  values,
  accounts,
}: {
  values: Values;
  accounts: AccountOption[];
}) {
  const action = values.id ? updateCreditCard : createCreditCard;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome do cartão" error={state.fieldErrors?.name?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.name))}
            name="name"
            defaultValue={values.name}
            placeholder="Ex.: Cartão principal"
            maxLength={80}
            required
          />
        </Field>
        <Field label="Emissor" error={state.fieldErrors?.issuer?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.issuer))}
            name="issuer"
            defaultValue={values.issuer}
            placeholder="Ex.: Banco"
            maxLength={80}
            required
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Bandeira" error={state.fieldErrors?.brand?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.brand))}
            name="brand"
            defaultValue={values.brand ?? "visa"}
          >
            {CREDIT_CARD_BRANDS.map((brand) => (
              <option key={brand} value={brand}>
                {CREDIT_CARD_BRAND_LABELS[brand]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Quatro últimos dígitos"
          error={state.fieldErrors?.lastFourDigits?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.lastFourDigits))}
            name="lastFourDigits"
            defaultValue={values.lastFourDigits}
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="1234"
            required
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Limite total"
          error={state.fieldErrors?.creditLimit?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.creditLimit))}
            name="creditLimit"
            defaultValue={values.creditLimit ?? "0,00"}
            inputMode="decimal"
            required
          />
        </Field>
        <Field label="Moeda" error={state.fieldErrors?.currency?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.currency))}
            name="currency"
            defaultValue={values.currency ?? "BRL"}
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {CURRENCY_LABELS[currency]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Dia de fechamento"
          error={state.fieldErrors?.closingDay?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.closingDay))}
            name="closingDay"
            type="number"
            min={1}
            max={31}
            defaultValue={values.closingDay ?? 20}
            required
          />
        </Field>
        <Field label="Dia de vencimento" error={state.fieldErrors?.dueDay?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.dueDay))}
            name="dueDay"
            type="number"
            min={1}
            max={31}
            defaultValue={values.dueDay ?? 10}
            required
          />
        </Field>
      </div>

      <Field
        label="Conta de pagamento padrão (opcional)"
        error={state.fieldErrors?.linkedAccountId?.[0]}
      >
        <select
          className={inputClass(Boolean(state.fieldErrors?.linkedAccountId))}
          name="linkedAccountId"
          defaultValue={values.linkedAccountId ?? ""}
        >
          <option value="">Escolher no pagamento</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-slate-500">
          A conta precisa usar a mesma moeda do cartão.
        </span>
      </Field>

      <SubmitButton pending={pending}>
        {values.id ? "Salvar alterações" : "Cadastrar cartão"}
      </SubmitButton>
    </form>
  );
}
