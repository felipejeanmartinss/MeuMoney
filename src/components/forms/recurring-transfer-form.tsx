"use client";

import { useActionState, useState } from "react";
import { saveRecurringTransfer } from "@/app/actions/recurring-transactions";
import type { FinancialFormState } from "@/app/actions/accounts";
import { RECURRENCE_FREQUENCIES, RECURRENCE_FREQUENCY_LABELS } from "@/domain/recurring-transactions";
import type { RecurrenceFrequency, SupportedCurrency } from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type Account = { id: string; name: string; currency: SupportedCurrency };
type Values = {
  id?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  description?: string;
  amountMinor?: string;
  destinationAmountMinor?: string;
  frequency?: RecurrenceFrequency;
  startDate: string;
  nextOccurrence: string;
  endDate?: string | null;
  notes?: string | null;
};

export function RecurringTransferForm({ accounts, values }: { accounts: Account[]; values: Values }) {
  const [state, action, pending] = useActionState<FinancialFormState, FormData>(
    saveRecurringTransfer, { status: "idle" },
  );
  const [sourceId, setSourceId] = useState(values.sourceAccountId ?? "");
  const [destinationId, setDestinationId] = useState(values.destinationAccountId ?? "");
  const source = accounts.find((account) => account.id === sourceId);
  const destination = accounts.find((account) => account.id === destinationId);
  return <form action={action} className="grid gap-4">
    {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
    {state.message ? <FormMessage>{state.message}</FormMessage> : null}
    <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
      <input className={inputClass(Boolean(state.fieldErrors?.description))} name="description"
        defaultValue={values.description} maxLength={180} placeholder="Ex.: Previdência privada Tegra" required />
    </Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Sai de" error={state.fieldErrors?.sourceAccountId?.[0]}>
        <select className={inputClass(Boolean(state.fieldErrors?.sourceAccountId))}
          name="sourceAccountId" value={sourceId} onChange={(event) => {
            const nextSourceId = event.target.value;
            setSourceId(nextSourceId);
            if (destinationId === nextSourceId) setDestinationId("");
          }} required>
          <option value="" disabled>Selecione</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
        </select>
      </Field>
      <Field label="Entra em" error={state.fieldErrors?.destinationAccountId?.[0]}>
        <select className={inputClass(Boolean(state.fieldErrors?.destinationAccountId))}
          name="destinationAccountId" value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required>
          <option value="" disabled>Selecione</option>
          {accounts.filter((account) => account.id !== sourceId).map((account) =>
            <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
        </select>
      </Field>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`Valor que sai${source ? ` (${source.currency})` : ""}`} error={state.fieldErrors?.amountMinor?.[0]}>
        <input className={inputClass(Boolean(state.fieldErrors?.amountMinor))}
          name="amountMinor" defaultValue={values.amountMinor} inputMode="decimal" required />
      </Field>
      <Field label={`Valor que entra${destination ? ` (${destination.currency})` : ""}`} error={state.fieldErrors?.destinationAmountMinor?.[0]}>
        <input className={inputClass(Boolean(state.fieldErrors?.destinationAmountMinor))}
          name="destinationAmountMinor" defaultValue={values.destinationAmountMinor ?? values.amountMinor}
          inputMode="decimal" required />
      </Field>
    </div>
    <p className="text-xs text-slate-500">Na mesma moeda, os dois valores devem ser iguais. Em moedas diferentes, informe o valor exato recebido; a taxa não é estimada.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Frequência" error={state.fieldErrors?.frequency?.[0]}>
        <select name="frequency" className={inputClass(Boolean(state.fieldErrors?.frequency))}
          defaultValue={values.frequency ?? "monthly"}>
          {RECURRENCE_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>
            {RECURRENCE_FREQUENCY_LABELS[frequency]}</option>)}
        </select>
      </Field>
      <Field label="Data inicial" error={state.fieldErrors?.startDate?.[0]}>
        <input name="startDate" type="date" defaultValue={values.startDate}
          className={inputClass(Boolean(state.fieldErrors?.startDate))} required />
      </Field>
      <Field label="Próxima ocorrência" error={state.fieldErrors?.nextOccurrence?.[0]}>
        <input name="nextOccurrence" type="date" defaultValue={values.nextOccurrence}
          className={inputClass(Boolean(state.fieldErrors?.nextOccurrence))} required />
      </Field>
      <Field label="Data final (opcional)" error={state.fieldErrors?.endDate?.[0]}>
        <input name="endDate" type="date" defaultValue={values.endDate ?? ""}
          className={inputClass(Boolean(state.fieldErrors?.endDate))} />
      </Field>
    </div>
    <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
      <textarea name="notes" defaultValue={values.notes ?? ""}
        className={`${inputClass(Boolean(state.fieldErrors?.notes))} min-h-20 py-2`}
        maxLength={1000} />
    </Field>
    <FormMessage tone="info">A previsão gera uma transferência pendente com saída e entrada vinculadas; só afeta os saldos realizados após a confirmação.</FormMessage>
    <SubmitButton pending={pending}>{values.id ? "Salvar transferência recorrente" : "Criar transferência recorrente"}</SubmitButton>
  </form>;
}
