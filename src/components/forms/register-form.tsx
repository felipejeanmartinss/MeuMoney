"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, FormMessage, PasswordInput, SubmitButton, inputClass } from "./form-controls";
import { getAuthErrorMessage, signUp } from "@/services/auth/auth-service";
import { registerSchema } from "@/utils/auth-validation";

export function RegisterForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({ fullName: form.get("fullName"), email: form.get("email"), password: form.get("password"), passwordConfirmation: form.get("passwordConfirmation"), acceptedTerms: form.get("acceptedTerms") === "on" });
    if (!parsed.success) { setErrors(parsed.error.flatten().fieldErrors); return; }
    setErrors({}); setMessage(undefined); setPending(true);
    const { data, error } = await signUp(parsed.data);
    if (error) { setMessage(getAuthErrorMessage(error)); setPending(false); return; }
    router.replace(data.session ? "/dashboard" : "/auth/status?state=pending");
    router.refresh();
  }

  return <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
    {message ? <FormMessage>{message}</FormMessage> : null}
    <Field label="Nome completo" error={errors.fullName?.[0]}><input className={inputClass(Boolean(errors.fullName))} name="fullName" autoComplete="name" aria-invalid={Boolean(errors.fullName)} /></Field>
    <Field label="E-mail" error={errors.email?.[0]}><input className={inputClass(Boolean(errors.email))} name="email" type="email" autoComplete="email" inputMode="email" aria-invalid={Boolean(errors.email)} /></Field>
    <Field label="Senha" error={errors.password?.[0]}><PasswordInput name="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} /></Field>
    <Field label="Confirme a senha" error={errors.passwordConfirmation?.[0]}><PasswordInput name="passwordConfirmation" autoComplete="new-password" aria-invalid={Boolean(errors.passwordConfirmation)} /></Field>
    <label className="flex items-start gap-3 text-sm text-slate-700"><input name="acceptedTerms" type="checkbox" className="mt-1 size-4 rounded border-slate-300" /><span>Li e aceito os <a href="/terms" className="font-semibold text-blue-700 underline">Termos de Uso</a> e a <a href="/privacy" className="font-semibold text-blue-700 underline">Política de Privacidade</a>.</span></label>
    {errors.acceptedTerms?.[0] ? <p className="-mt-3 text-xs text-red-700">{errors.acceptedTerms[0]}</p> : null}
    <SubmitButton pending={pending}>Criar conta</SubmitButton>
  </form>;
}
