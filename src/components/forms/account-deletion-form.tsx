"use client";

import { useActionState } from "react";
import {
  deleteAccount,
  type SecurityActionState,
} from "@/app/actions/security";
import {
  Field,
  FormMessage,
  PasswordInput,
  inputClass,
} from "./form-controls";

const initialState: SecurityActionState = { status: "idle" };

export function AccountDeletionForm() {
  const [state, action, pending] = useActionState(deleteAccount, initialState);

  return (
    <form action={action} className="grid gap-4">
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <Field label="Senha atual">
        <PasswordInput
          name="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </Field>
      <Field label='Digite "EXCLUIR MINHA CONTA"'>
        <input
          className={inputClass()}
          name="confirmation"
          autoComplete="off"
          required
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-red-700 px-5 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "Excluindo…" : "Excluir conta definitivamente"}
      </button>
    </form>
  );
}
