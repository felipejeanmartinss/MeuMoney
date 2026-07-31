"use client";

import { useActionState } from "react";
import {
  createInvestmentPosition,
  updateInvestmentPosition,
  type InvestmentFormState,
} from "@/app/actions/investments";
import { CONTEXT_LABELS, FINANCIAL_CONTEXTS } from "@/domain/accounts";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "@/domain/currencies";
import {
  INVESTMENT_CLASSES,
  INVESTMENT_CLASS_LABELS,
} from "@/domain/investments";
import type {
  FinancialContext,
  InvestmentClass,
  SupportedCurrency,
} from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type InvestmentPositionFormValues = {
  id?: string;
  institution?: string;
  investmentClass?: InvestmentClass;
  assetName?: string;
  currency?: SupportedCurrency;
  quantity?: string;
  accumulatedCostMinor?: string;
  currentValueMinor?: string;
  positionDate?: string;
  minPositionDate?: string;
  maxPositionDate?: string;
  context?: FinancialContext;
  historyIsComplete?: boolean;
  notes?: string;
};

const initialState: InvestmentFormState = { status: "idle" };

export function InvestmentPositionForm({
  values,
}: {
  values: InvestmentPositionFormValues;
}) {
  const action = values.id
    ? updateInvestmentPosition
    : createInvestmentPosition;
  const [state, formAction, pending] = useActionState(action, initialState);
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Instituição"
          error={state.fieldErrors?.institution?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.institution))}
            name="institution"
            defaultValue={values.institution}
            placeholder="Ex.: Banco ou corretora"
            maxLength={120}
            required
            aria-invalid={Boolean(state.fieldErrors?.institution)}
          />
        </Field>

        <Field label="Classe" error={state.fieldErrors?.investmentClass?.[0]}>
          <select
            className={inputClass(
              Boolean(state.fieldErrors?.investmentClass),
            )}
            name="investmentClass"
            defaultValue={values.investmentClass ?? "fixed_income"}
            required
            aria-invalid={Boolean(state.fieldErrors?.investmentClass)}
          >
            {INVESTMENT_CLASSES.map((investmentClass) => (
              <option key={investmentClass} value={investmentClass}>
                {INVESTMENT_CLASS_LABELS[investmentClass]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Ativo" error={state.fieldErrors?.assetName?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.assetName))}
          name="assetName"
          defaultValue={values.assetName}
          placeholder="Ex.: Tesouro Selic 2029, PETR4 ou Bitcoin"
          maxLength={120}
          required
          aria-invalid={Boolean(state.fieldErrors?.assetName)}
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
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {CURRENCY_LABELS[currency]}
              </option>
            ))}
          </select>
          {currencyIsLocked ? (
            <span className="text-xs font-normal text-slate-500">
              A moeda fica bloqueada para preservar o histórico.
            </span>
          ) : null}
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Quantidade" error={state.fieldErrors?.quantity?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.quantity))}
            name="quantity"
            defaultValue={values.quantity ?? "0"}
            inputMode="decimal"
            placeholder="0,00000000"
            required
            aria-invalid={Boolean(state.fieldErrors?.quantity)}
          />
          <span className="text-xs font-normal text-slate-500">
            Até 12 casas decimais, sem notação científica.
          </span>
        </Field>

        <Field
          label="Custo acumulado"
          error={state.fieldErrors?.accumulatedCostMinor?.[0]}
        >
          <input
            className={inputClass(
              Boolean(state.fieldErrors?.accumulatedCostMinor),
            )}
            name="accumulatedCostMinor"
            defaultValue={values.accumulatedCostMinor ?? "0,00"}
            inputMode="decimal"
            placeholder="0,00"
            required
            aria-invalid={Boolean(state.fieldErrors?.accumulatedCostMinor)}
          />
        </Field>

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
      </div>

      <Field
        label="Data da posição"
        error={state.fieldErrors?.positionDate?.[0]}
      >
        <input
          className={inputClass(Boolean(state.fieldErrors?.positionDate))}
          name="positionDate"
          type="date"
          defaultValue={values.positionDate}
          min={values.minPositionDate}
          max={values.maxPositionDate}
          required
          aria-invalid={Boolean(state.fieldErrors?.positionDate)}
        />
      </Field>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <input
          type="checkbox"
          name="historyIsComplete"
          value="true"
          defaultChecked={values.historyIsComplete}
          className="mt-1 size-4"
        />
        <span>
          <strong className="block text-slate-950">
            O histórico financeiro está completo desde o início
          </strong>
          Marque somente se todos os aportes, resgates e rendas da posição forem
          registrados. O resultado total só será calculado nesse caso.
        </span>
      </label>

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
        <textarea
          className={`${inputClass(Boolean(state.fieldErrors?.notes))} min-h-28 py-3`}
          name="notes"
          defaultValue={values.notes}
          placeholder="Informações úteis sobre a posição."
          maxLength={1000}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
        />
      </Field>

      <SubmitButton pending={pending}>
        {values.id ? "Salvar e registrar posição" : "Cadastrar posição"}
      </SubmitButton>
    </form>
  );
}
