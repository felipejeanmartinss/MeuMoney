"use client";

import { useState, type FormEvent } from "react";
import { Field, FormMessage, SubmitButton, inputClass } from "./form-controls";
import { requestPasswordReset } from "@/services/auth/auth-service";
import { forgotPasswordSchema } from "@/utils/auth-validation";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message); return; }
    setError(undefined); setPending(true);
    await requestPasswordReset(parsed.data.email);
    setSent(true); setPending(false);
  }
  if (sent) return <FormMessage tone="success">Se houver uma conta vinculada a esse e-mail, você receberá as instruções para criar uma nova senha.</FormMessage>;
  return <form onSubmit={handleSubmit} className="grid gap-5" noValidate><Field label="E-mail" error={error}><input className={inputClass(Boolean(error))} name="email" type="email" autoComplete="email" inputMode="email" aria-invalid={Boolean(error)} /></Field><SubmitButton pending={pending}>Enviar instruções</SubmitButton></form>;
}
