"use client";

import { useActionState } from "react";
import { addGoalContribution, createFinancialGoal, type FinancialGoalFormState } from "@/app/actions/financial-goals";
import { FINANCIAL_GOAL_TYPE_LABELS, FINANCIAL_GOAL_TYPES } from "@/domain/financial-goals";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: FinancialGoalFormState = { status: "idle" };

export function FinancialGoalForm({ defaultCurrency = "BRL" }: { defaultCurrency?: "BRL" | "USD" | "EUR" }) {
  const [state, formAction, pending] = useActionState(createFinancialGoal, initialState);
  return (
    <form action={formAction} className="grid gap-5">
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome da meta" error={state.fieldErrors?.name?.[0]}>
          <input className={inputClass(Boolean(state.fieldErrors?.name))} name="name" placeholder="Ex.: Reserva de emergência" maxLength={120} required />
        </Field>
        <Field label="Tipo" error={state.fieldErrors?.goalType?.[0]}>
          <select className={inputClass(Boolean(state.fieldErrors?.goalType))} name="goalType" defaultValue="emergency_fund" required>
            {FINANCIAL_GOAL_TYPES.map((type) => <option key={type} value={type}>{FINANCIAL_GOAL_TYPE_LABELS[type]}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Valor alvo" error={state.fieldErrors?.targetAmountMinor?.[0]}>
          <input className={inputClass(Boolean(state.fieldErrors?.targetAmountMinor))} name="targetAmount" placeholder="0,00" inputMode="decimal" required />
        </Field>
        <Field label="Moeda" error={state.fieldErrors?.currency?.[0]}>
          <select className={inputClass(Boolean(state.fieldErrors?.currency))} name="currency" defaultValue={defaultCurrency} required>
            {SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{CURRENCY_LABELS[currency]}</option>)}
          </select>
        </Field>
        <Field label="Prazo" error={state.fieldErrors?.targetDate?.[0]}>
          <input className={inputClass(Boolean(state.fieldErrors?.targetDate))} name="targetDate" type="date" required />
        </Field>
      </div>
      <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
        <textarea className={inputClass(Boolean(state.fieldErrors?.notes))} name="notes" rows={3} placeholder="Opcional" maxLength={1000} />
      </Field>
      <SubmitButton pending={pending}>Criar meta</SubmitButton>
    </form>
  );
}

export function GoalContributionForm({ goalId, currency }: { goalId: string; currency: "BRL" | "USD" | "EUR" }) {
  const [state, formAction, pending] = useActionState(addGoalContribution, initialState);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="goalId" value={goalId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Valor" error={state.fieldErrors?.amountMinor?.[0]}><input className={inputClass(Boolean(state.fieldErrors?.amountMinor))} name="amount" placeholder="0,00" inputMode="decimal" required /></Field>
        <Field label="Moeda" error={state.fieldErrors?.currency?.[0]}><select className={inputClass(Boolean(state.fieldErrors?.currency))} name="currency" defaultValue={currency}>{SUPPORTED_CURRENCIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
        <Field label="Data" error={state.fieldErrors?.contributionDate?.[0]}><input className={inputClass(Boolean(state.fieldErrors?.contributionDate))} name="contributionDate" type="date" required /></Field>
      </div>
      <Field label="Descrição" error={state.fieldErrors?.description?.[0]}><input className={inputClass(Boolean(state.fieldErrors?.description))} name="description" placeholder="Ex.: aporte mensal" maxLength={240} /></Field>
      <SubmitButton pending={pending} compact>Registrar contribuição</SubmitButton>
    </form>
  );
}
