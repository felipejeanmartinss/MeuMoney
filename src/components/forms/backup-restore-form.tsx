"use client";

import { useActionState } from "react";
import {
  restoreBackup,
  type SecurityActionState,
} from "@/app/actions/security";
import { Field, FormMessage, SubmitButton, inputClass } from "./form-controls";

const initialState: SecurityActionState = { status: "idle" };

export function BackupRestoreForm() {
  const [state, action, pending] = useActionState(restoreBackup, initialState);

  return (
    <form action={action} className="grid gap-4">
      {state.message ? (
        <FormMessage tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormMessage>
      ) : null}
      <Field label="Arquivo de backup">
        <input
          className={inputClass()}
          name="backup"
          type="file"
          accept="application/json,.json"
          required
        />
      </Field>
      <p className="text-sm text-slate-600">
        A restauração é atômica: se qualquer item falhar, seus dados atuais
        permanecem intactos. Limite de 10 MB.
      </p>
      <SubmitButton pending={pending}>Restaurar backup</SubmitButton>
    </form>
  );
}
