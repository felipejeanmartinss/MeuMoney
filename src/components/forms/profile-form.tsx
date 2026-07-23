"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileActionState } from "@/app/actions/profile";
import {
  CURRENCY_LABELS,
  SUPPORTED_CURRENCIES,
} from "@/domain/currencies";
import type { SupportedCurrency } from "@/types/database";
import { Field, FormMessage, inputClass } from "./form-controls";

const initialState: ProfileActionState = { status: "idle" };
export function ProfileForm({
  fullName,
  email,
  preferredCurrency,
}: {
  fullName: string;
  email: string;
  preferredCurrency: SupportedCurrency;
}) {
  const [state, action, pending] = useActionState(updateProfile, initialState);
  return <form action={action} className="grid gap-5">
    {state.message ? <FormMessage tone={state.status === "success" ? "success" : "error"}>{state.message}</FormMessage> : null}
    <Field label="Nome completo"><input className={inputClass()} name="fullName" defaultValue={fullName} autoComplete="name" required /></Field>
    <Field label="E-mail"><input className={`${inputClass()} bg-slate-100 text-slate-600`} value={email} readOnly aria-readonly="true" /></Field>
    <Field label="Moeda preferencial">
      <select
        className={inputClass()}
        name="preferredCurrency"
        defaultValue={preferredCurrency}
        required
      >
        {SUPPORTED_CURRENCIES.map((currency) => (
          <option key={currency} value={currency}>
            {CURRENCY_LABELS[currency]}
          </option>
        ))}
      </select>
      <span className="text-xs font-normal text-slate-500">
        Novas contas usarão esta moeda como sugestão inicial.
      </span>
    </Field>
    <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{pending ? "Salvando…" : "Salvar alterações"}</button>
  </form>;
}
