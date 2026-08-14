"use client";

import { useActionState } from "react";
import { deleteArchivedAccount } from "@/app/actions/accounts";
import type { FinancialFormState } from "@/app/actions/accounts";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: FinancialFormState = { status: "idle" };

export function ArchivedAccountDeletionForm({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteArchivedAccount,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={accountId} />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <p className="text-sm leading-6 text-red-900">
        Excluir <strong>{accountName}</strong> removerá definitivamente seu
        extrato, transferências, recorrências e importações vinculadas. Cartões
        ligados à conta serão apenas desvinculados.
      </p>
      <Field
        label="Confirmação"
        error={state.fieldErrors?.confirmation?.[0]}
      >
        <input
          className={inputClass(Boolean(state.fieldErrors?.confirmation))}
          name="confirmation"
          placeholder="Digite EXCLUIR"
          autoComplete="off"
          required
        />
      </Field>
      <SubmitButton pending={pending}>
        Excluir conta e histórico definitivamente
      </SubmitButton>
    </form>
  );
}
