"use client";

import { useActionState } from "react";
import { updateInvestmentCashFlow, type InvestmentFormState } from "@/app/actions/investments";
import { minorUnitsToInput } from "@/domain/money";
import type { InvestmentCashFlowType } from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: InvestmentFormState = { status: "idle" };

export function InvestmentCashFlowEditForm({ flow, sourceDescription, maxDate }: {
  flow: {
    id: string;
    position_id: string;
    cash_flow_type: InvestmentCashFlowType;
    amount_minor: number;
    quantity: string | null;
    cash_flow_date: string;
    notes: string | null;
  };
  sourceDescription: string | null;
  maxDate: string;
}) {
  const [state, action, pending] = useActionState(updateInvestmentCashFlow, initialState);
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="cashFlowId" value={flow.id} />
    <input type="hidden" name="positionId" value={flow.position_id} />
    <input type="hidden" name="cashFlowType" value={flow.cash_flow_type} />
    {state.message ? <FormMessage>{state.message}</FormMessage> : null}
    {sourceDescription !== null ? <Field label="Descrição no extrato" error={state.fieldErrors?.description?.[0]}>
      <input name="description" defaultValue={sourceDescription} maxLength={180} required className={inputClass(Boolean(state.fieldErrors?.description))} />
    </Field> : null}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Valor" error={state.fieldErrors?.amountMinor?.[0]}>
        <input name="amountMinor" defaultValue={minorUnitsToInput(flow.amount_minor)} inputMode="decimal" required className={inputClass(Boolean(state.fieldErrors?.amountMinor))} />
      </Field>
      <Field label="Quantidade (opcional)" error={state.fieldErrors?.quantity?.[0]}>
        <input name="quantity" defaultValue={flow.quantity ?? ""} inputMode="decimal" className={inputClass(Boolean(state.fieldErrors?.quantity))} />
      </Field>
    </div>
    <Field label="Data" error={state.fieldErrors?.cashFlowDate?.[0]}>
      <input name="cashFlowDate" type="date" defaultValue={flow.cash_flow_date} max={maxDate} required className={inputClass(Boolean(state.fieldErrors?.cashFlowDate))} />
    </Field>
    <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
      <textarea name="notes" defaultValue={flow.notes ?? ""} maxLength={1000} rows={2} className={inputClass(Boolean(state.fieldErrors?.notes))} />
    </Field>
    <p className="text-xs text-slate-600">O movimento, a posição e o lançamento vinculado serão atualizados juntos. Movimentos posteriores podem impedir a alteração se o saldo ficar incompatível.</p>
    <SubmitButton pending={pending}>Salvar movimento</SubmitButton>
  </form>;
}
