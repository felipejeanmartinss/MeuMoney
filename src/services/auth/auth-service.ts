import { createClient } from "@/services/supabase/client";

type SignUpInput = { fullName: string; email: string; password: string };

export function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (message.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (message.includes("user already registered")) return "Não foi possível concluir o cadastro. Tente entrar ou recuperar sua senha.";
  if (message.includes("password")) return "A senha não atende aos requisitos de segurança.";
  if (message.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return "Não foi possível concluir a operação. Tente novamente.";
}

export async function signUp({ fullName, email, password }: SignUpInput) {
  const supabase = createClient();
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
    },
  });
}

export async function signIn(email: string, password: string) {
  return createClient().auth.signInWithPassword({ email, password });
}

export async function requestPasswordReset(email: string) {
  return createClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
  });
}

export async function updatePassword(password: string) {
  const supabase = createClient();
  const result = await supabase.auth.updateUser({ password });
  if (!result.error) await supabase.auth.signOut({ scope: "global" });
  return result;
}

export async function hasRecoverySession() {
  const { data } = await createClient().auth.getSession();
  return Boolean(data.session);
}
