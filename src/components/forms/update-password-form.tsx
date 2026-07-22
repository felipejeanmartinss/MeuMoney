"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field, FormMessage, PasswordInput, SubmitButton } from "./form-controls";
import { getAuthErrorMessage, hasRecoverySession, updatePassword } from "@/services/auth/auth-service";
import { updatePasswordSchema } from "@/utils/auth-validation";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [validSession, setValidSession] = useState<boolean>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  useEffect(() => { void hasRecoverySession().then(setValidSession); }, []);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !validSession) return;
    const form = new FormData(event.currentTarget);
    const parsed = updatePasswordSchema.safeParse({ password: form.get("password"), passwordConfirmation: form.get("passwordConfirmation") });
    if (!parsed.success) { setErrors(parsed.error.flatten().fieldErrors); return; }
    setErrors({}); setMessage(undefined); setPending(true);
    const { error } = await updatePassword(parsed.data.password);
    if (error) { setMessage(getAuthErrorMessage(error)); setPending(false); return; }
    router.replace("/auth/status?state=password-updated"); router.refresh();
  }
  if (validSession === undefined) return <FormMessage tone="info">Validando o link de recuperação…</FormMessage>;
  if (!validSession) return <FormMessage>Este link é inválido ou expirou. Solicite uma nova recuperação de senha.</FormMessage>;
  return <form onSubmit={handleSubmit} className="grid gap-5" noValidate>{message ? <FormMessage>{message}</FormMessage> : null}<Field label="Nova senha" error={errors.password?.[0]}><PasswordInput name="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} /></Field><Field label="Confirme a nova senha" error={errors.passwordConfirmation?.[0]}><PasswordInput name="passwordConfirmation" autoComplete="new-password" aria-invalid={Boolean(errors.passwordConfirmation)} /></Field><SubmitButton pending={pending}>Atualizar senha</SubmitButton></form>;
}
