import Link from "next/link";
import { AuthPage } from "@/components/layout/auth-page";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

export const metadata = { title: "Recuperar senha" };
export default function ForgotPasswordPage() {
  return <AuthPage title="Recupere sua senha" description="Informe seu e-mail para receber as instruções."><ForgotPasswordForm /><Link href="/login" className="text-center text-sm font-semibold text-blue-700 hover:underline">Voltar para o login</Link></AuthPage>;
}
