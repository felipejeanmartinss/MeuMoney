"use client";

import { useActionState } from "react";
import { confirmFinancingImport } from "@/app/actions/financing-imports";
import { Field, FormMessage, SubmitButton, inputClass } from "./form-controls";

const initialState = { status: "idle" as const };

export function FinancingImportConfirmationForm({
  jobId,
  suggestedName,
}: {
  jobId: string;
  suggestedName: string;
}) {
  const [state, formAction, pending] = useActionState(
    confirmFinancingImport,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <Field label="Nome do compromisso" error={state.fieldErrors?.name?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.name))}
          name="name"
          defaultValue={suggestedName}
          maxLength={100}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" error={state.fieldErrors?.productType?.[0]}>
          <select className={inputClass()} name="productType" defaultValue="financing">
            <option value="financing">Financiamento</option>
            <option value="loan">Empréstimo</option>
          </select>
        </Field>
        <Field label="Contexto" error={state.fieldErrors?.context?.[0]}>
          <select className={inputClass()} name="context" defaultValue="personal">
            <option value="personal">Pessoal</option>
            <option value="professional">Profissional</option>
          </select>
        </Field>
      </div>
      <SubmitButton pending={pending}>Confirmar e criar financiamento</SubmitButton>
    </form>
  );
}
