import Link from "next/link";
import { AuthPage } from "@/components/layout/auth-page";
import { RegisterForm } from "@/components/forms/register-form";

export const metadata = { title: "Criar conta" };
export default function RegisterPage() {
  return <AuthPage title="Crie sua conta" description="Comece com seu perfil protegido. Os dados financeiros virão depois."><RegisterForm /><p className="text-center text-sm text-slate-600">Já tem conta? <Link href="/login" className="font-semibold text-blue-700 hover:underline">Entrar</Link></p></AuthPage>;
}
