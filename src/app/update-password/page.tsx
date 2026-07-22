import Link from "next/link";
import { AuthPage } from "@/components/layout/auth-page";
import { UpdatePasswordForm } from "@/components/forms/update-password-form";

export const metadata = { title: "Atualizar senha" };
export default function UpdatePasswordPage() {
  return <AuthPage title="Defina uma nova senha" description="O link é validado antes de permitir a alteração."><UpdatePasswordForm /><Link href="/forgot-password" className="text-center text-sm font-semibold text-blue-700 hover:underline">Solicitar um novo link</Link></AuthPage>;
}
