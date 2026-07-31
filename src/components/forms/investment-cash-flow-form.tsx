"use client";

import { useActionState } from "react";
import {
  createInvestmentCashFlow,
  type InvestmentFormState,
} from "@/app/actions/investments";
import {
  INVESTMENT_CASH_FLOW_LABELS,
  INVESTMENT_CASH_FLOW_TYPES,
} from "@/domain/investments";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: InvestmentFormState = { status: "idle" };

export function InvestmentCashFlowForm({
  positionId,
  maxDate,
}: {
  positionId: string;
  maxDate: string;
}) {
  const [state, formAction, pending] = useActionState(
    createInvestmentCashFlow,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="positionId" value={positionId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field label="Tipo" error={state.fieldErrors?.cashFlowType?.[0]}>
        <select
          className={inputClass(Boolean(state.fieldErrors?.cashFlowType))}
          name="cashFlowType"
          defaultValue="contribution"
          required
          aria-invalid={Boolean(state.fieldErrors?.cashFlowType)}
        >
          {INVESTMENT_CASH_FLOW_TYPES.map((type) => (
            <option key={type} value={type}>
              {INVESTMENT_CASH_FLOW_LABELS[type]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Valor" error={state.fieldErrors?.amountMinor?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.amountMinor))}
            name="amountMinor"
            inputMode="decimal"
            placeholder="0,00"
            required
            aria-invalid={Boolean(state.fieldErrors?.amountMinor)}
          />
        </Field>

        <Field
          label="Quantidade movimentada (opcional)"
          error={state.fieldErrors?.quantity?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.quantity))}
            name="quantity"
            inputMode="decimal"
            placeholder="0,00000000"
            aria-invalid={Boolean(state.fieldErrors?.quantity)}
          />
        </Field>
      </div>

      <Field label="Data" error={state.fieldErrors?.cashFlowDate?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.cashFlowDate))}
          name="cashFlowDate"
          type="date"
          defaultValue={maxDate}
          max={maxDate}
          required
          aria-invalid={Boolean(state.fieldErrors?.cashFlowDate)}
        />
      </Field>

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
        <textarea
          className={`${inputClass(Boolean(state.fieldErrors?.notes))} min-h-24 py-3`}
          name="notes"
          maxLength={1000}
          aria-invalid={Boolean(state.fieldErrors?.notes)}
        />
      </Field>

      <FormMessage tone="info">
        O registro histórico não altera automaticamente a posição atual. Se a
        quantidade, o custo ou o valor atual mudaram, atualize também a posição.
      </FormMessage>
      <SubmitButton pending={pending}>Registrar no histórico</SubmitButton>
    </form>
  );
}
