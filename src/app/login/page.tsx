import Link from "next/link";
import { LoginForm } from "@/components/forms/login-form";
import { AuthPage } from "@/components/layout/auth-page";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; message?: string }> }) {
  const params = await searchParams;
  return <AuthPage title="Acesse sua conta" description="Entre com seu e-mail e senha para continuar.">
    {params.message === "logged-out" ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Sessão encerrada com segurança.</p> : null}
    <LoginForm nextPath={params.next} />
    <div className="flex flex-col gap-2 text-center text-sm"><Link href="/forgot-password" className="font-semibold text-blue-700 hover:underline">Esqueci minha senha</Link><p className="text-slate-600">Ainda não tem conta? <Link href="/register" className="font-semibold text-blue-700 hover:underline">Cadastre-se</Link></p></div>
  </AuthPage>;
}
