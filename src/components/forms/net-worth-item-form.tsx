"use client";

import { useActionState } from "react";
import {
  createNetWorthItem,
  updateNetWorthItem,
  type NetWorthFormState,
} from "@/app/actions/net-worth";
import { CONTEXT_LABELS, FINANCIAL_CONTEXTS } from "@/domain/accounts";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "@/domain/currencies";
import {
  NET_WORTH_ASSET_TYPES,
  NET_WORTH_ITEM_TYPE_LABELS,
  NET_WORTH_LIABILITY_TYPES,
} from "@/domain/net-worth";
import type {
  FinancialContext,
  NetWorthItemKind,
  NetWorthItemType,
  SupportedCurrency,
} from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type NetWorthItemFormValues = {
  id?: string;
  kind?: NetWorthItemKind;
  itemType?: NetWorthItemType;
  name?: string;
  currency?: SupportedCurrency;
  currentValueMinor?: string;
  valuationDate?: string;
  maxValuationDate?: string;
  context?: FinancialContext;
  notes?: string;
};

const initialState: NetWorthFormState = { status: "idle" };

export function NetWorthItemForm({
  values,
}: {
  values: NetWorthItemFormValues;
}) {
  const action = values.id ? updateNetWorthItem : createNetWorthItem;
  const [state, formAction, pending] = useActionState(action, initialState);
  const availableAssetTypes =
    values.kind === "liability" ? [] : NET_WORTH_ASSET_TYPES;
  const availableLiabilityTypes =
    values.kind === "asset" ? [] : NET_WORTH_LIABILITY_TYPES;
  const currencyIsLocked = Boolean(values.id);

  return (
    <form action={formAction} className="grid gap-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {currencyIsLocked ? (
        <input
          type="hidden"
          name="currency"
          value={values.currency ?? "BRL"}
        />
      ) : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field label="Tipo do item" error={state.fieldErrors?.itemType?.[0]}>
        <select
          className={inputClass(Boolean(state.fieldErrors?.itemType))}
          name="itemType"
          defaultValue={values.itemType ?? "real_estate"}
          required
          aria-invalid={Boolean(state.fieldErrors?.itemType)}
        >
          {availableAssetTypes.length ? (
            <optgroup label="Ativos">
              {availableAssetTypes.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {NET_WORTH_ITEM_TYPE_LABELS[itemType]}
                </option>
              ))}
            </optgroup>
          ) : null}
          {availableLiabilityTypes.length ? (
            <optgroup label="Passivos">
              {availableLiabilityTypes.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {NET_WORTH_ITEM_TYPE_LABELS[itemType]}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </Field>

      <Field label="Nome" error={state.fieldErrors?.name?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.name))}
          name="name"
          defaultValue={values.name}
          placeholder="Ex.: Apartamento residencial"
          autoComplete="off"
          maxLength={100}
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Contexto" error={state.fieldErrors?.context?.[0]}>
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

        <Field label="Moeda" error={state.fieldErrors?.currency?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.currency))}
            name={currencyIsLocked ? undefined : "currency"}
            defaultValue={values.currency ?? "BRL"}
            disabled={currencyIsLocked}
            required
            aria-invalid={Boolean(state.fieldErrors?.currency)}
            aria-describedby={currencyIsLocked ? "currency-help" : undefined}
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {CURRENCY_LABELS[currency]}
              </option>
            ))}
          </select>
          {currencyIsLocked ? (
            <span
              id="currency-help"
              className="text-xs font-normal text-slate-500"
            >
              A moeda fica bloqueada para preservar um histórico consistente.
            </span>
          ) : null}
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Valor atual"
          error={state.fieldErrors?.currentValueMinor?.[0]}
        >
          <input
            className={inputClass(
              Boolean(state.fieldErrors?.currentValueMinor),
            )}
            name="currentValueMinor"
            defaultValue={values.currentValueMinor ?? "0,00"}
            inputMode="decimal"
            placeholder="0,00"
            required
            aria-invalid={Boolean(state.fieldErrors?.currentValueMinor)}
          />
        </Field>

        <Field
          label="Data da avaliação"
          error={state.fieldErrors?.valuationDate?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.valuationDate))}
            name="valuationDate"
            type="date"
            defaultValue={values.valuationDate}
            min={values.id ? values.valuationDate : undefined}
            max={values.maxValuationDate}
            required
            aria-invalid={Boolean(state.fieldErrors?.valuationDate)}
          />
        </Field>
      </div>

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
        <textarea
          className={`${inputClass(Boolean(state.fieldErrors?.notes))} min-h-28 py-3`}
          name="notes"
          defaultValue={values.notes}
          placeholder="Informações úteis sobre o bem ou a dívida."
          maxLength={1000}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
        />
      </Field>

      <SubmitButton pending={pending}>
        {values.id ? "Salvar e registrar avaliação" : "Cadastrar item"}
      </SubmitButton>
    </form>
  );
}
