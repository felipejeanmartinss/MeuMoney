"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, FormMessage, PasswordInput, SubmitButton, inputClass } from "./form-controls";
import { getAuthErrorMessage, signIn } from "@/services/auth/auth-service";
import { loginSchema } from "@/utils/auth-validation";
import { getSafeRedirectPath } from "@/utils/redirects";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) { setErrors(parsed.error.flatten().fieldErrors); return; }
    setErrors({}); setMessage(undefined); setPending(true);
    const { error } = await signIn(parsed.data.email, parsed.data.password);
    if (error) { setMessage(getAuthErrorMessage(error)); setPending(false); return; }
    router.replace(getSafeRedirectPath(nextPath));
    router.refresh();
  }

  return <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
    {message ? <FormMessage>{message}</FormMessage> : null}
    <Field label="E-mail" error={errors.email?.[0]}><input className={inputClass(Boolean(errors.email))} name="email" type="email" autoComplete="email" inputMode="email" placeholder="voce@exemplo.com" aria-invalid={Boolean(errors.email)} /></Field>
    <Field label="Senha" error={errors.password?.[0]}><PasswordInput name="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} /></Field>
    <SubmitButton pending={pending}>Entrar</SubmitButton>
  </form>;
}
