"use client";

import { useActionState, useState } from "react";
import {
  createInvestmentCashFlow,
  type InvestmentFormState,
} from "@/app/actions/investments";
import {
  INVESTMENT_CASH_FLOW_LABELS,
  INVESTMENT_CASH_FLOW_TYPES,
  INVESTMENT_INCOME_TYPE_LABELS,
} from "@/domain/investments";
import type { InvestmentCashFlowType } from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: InvestmentFormState = { status: "idle" };

export function InvestmentCashFlowForm({
  positionId,
  maxDate,
  accounts,
  assetName,
}: {
  positionId: string;
  maxDate: string;
  accounts: { id: string; name: string; currency: string }[];
  assetName: string;
}) {
  const [state, formAction, pending] = useActionState(
    createInvestmentCashFlow,
    initialState,
  );
  const [cashFlowType, setCashFlowType] = useState<InvestmentCashFlowType>("contribution");
  const [accountId, setAccountId] = useState("");

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="positionId" value={positionId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field label="Tipo" error={state.fieldErrors?.cashFlowType?.[0]}>
        <select
          className={inputClass(Boolean(state.fieldErrors?.cashFlowType))}
          name="cashFlowType"
          value={cashFlowType}
          onChange={(event) => setCashFlowType(event.target.value as InvestmentCashFlowType)}
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

      <Field label="Lançamento na conta de investimento" error={state.fieldErrors?.accountId?.[0]}>
        <select className={inputClass(Boolean(state.fieldErrors?.accountId))} name="accountId"
          value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Não criar lançamento na conta</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
        </select>
      </Field>
      {accountId ? <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Descrição no extrato" error={state.fieldErrors?.description?.[0]}>
          <input className={inputClass(Boolean(state.fieldErrors?.description))} name="description"
            defaultValue={`${INVESTMENT_CASH_FLOW_LABELS[cashFlowType]} · ${assetName}`}
            key={cashFlowType} maxLength={180} required />
        </Field>
        {cashFlowType === "income" ? <Field label="Tipo de renda" error={state.fieldErrors?.incomeType?.[0]}>
          <select className={inputClass(Boolean(state.fieldErrors?.incomeType))} name="incomeType" defaultValue="dividend">
            {Object.entries(INVESTMENT_INCOME_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field> : null}
      </div> : null}

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
        {accountId ? "O lançamento e o vínculo à posição serão criados juntos; a conta e a posição devem ter a mesma moeda e contexto." : "Este movimento ficará apenas no histórico da posição, sem alterar o extrato."}
      </FormMessage>
      <SubmitButton pending={pending}>Registrar no histórico</SubmitButton>
    </form>
  );
}
