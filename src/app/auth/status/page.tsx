import Link from "next/link";
import { AuthPage } from "@/components/layout/auth-page";
import { getSafeRedirectPath } from "@/utils/redirects";

const states = {
  pending: { title: "Verifique seu e-mail", description: "Enviamos um link de confirmação. Abra-o no mesmo navegador para concluir seu acesso.", tone: "text-blue-800", action: "/login", label: "Voltar ao login" },
  confirmed: { title: "E-mail confirmado", description: "Sua identidade foi confirmada e sua sessão está protegida.", tone: "text-emerald-800", action: "/dashboard", label: "Continuar" },
  invalid: { title: "Link inválido ou expirado", description: "Não foi possível validar este link. Solicite um novo cadastro ou uma nova recuperação de senha.", tone: "text-red-800", action: "/login", label: "Voltar ao login" },
  "password-updated": { title: "Senha atualizada", description: "Todas as sessões foram encerradas por segurança. Entre novamente usando sua nova senha.", tone: "text-emerald-800", action: "/login", label: "Entrar novamente" },
} as const;

export default async function AuthStatusPage({ searchParams }: { searchParams: Promise<{ state?: string; next?: string }> }) {
  const params = await searchParams;
  const state = states[params.state as keyof typeof states] ?? states.invalid;
  const action = params.state === "confirmed" ? getSafeRedirectPath(params.next) : state.action;
  return <AuthPage title={state.title} description={state.description}><div className={`rounded-2xl bg-slate-50 p-4 text-sm font-medium ${state.tone}`}>O MeuMoney nunca solicitará sua senha por e-mail.</div><Link href={action} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800">{state.label}</Link></AuthPage>;
}
