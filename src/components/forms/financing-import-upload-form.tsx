"use client";

import { useActionState } from "react";
import { uploadFinancingPdf } from "@/app/actions/financing-imports";
import { Field, FormMessage, SubmitButton, inputClass } from "./form-controls";

const initialState = { status: "idle" as const };

export function FinancingImportUploadForm() {
  const [state, formAction, pending] = useActionState(
    uploadFinancingPdf,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-5">
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <Field label="Extrato financeiro em PDF" error={state.fieldErrors?.file?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.file))}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
        />
      </Field>
      <FormMessage tone="info">
        O arquivo é lido no servidor, convertido em uma prévia estruturada e
        descartado. Nenhum contrato é criado antes da sua confirmação.
      </FormMessage>
      <SubmitButton pending={pending}>Ler PDF e revisar</SubmitButton>
    </form>
  );
}
