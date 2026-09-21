import Link from "next/link";
import { FinancialGoalForm } from "@/components/forms/financial-goal-form";
import { getCurrentProfile } from "@/services/auth/server-auth";

export const metadata = { title: "Nova meta" };

export default async function NewGoalPage() {
  const { profile } = await getCurrentProfile();
  return <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6"><div><Link href="/goals" className="text-sm font-bold text-emerald-700 hover:text-emerald-900">← Voltar para metas</Link><h1 className="mt-4 text-3xl font-black text-slate-950">Nova meta</h1><p className="mt-1 text-sm text-slate-600">Escolha um objetivo e acompanhe o progresso sem perder de vista o prazo.</p></div><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><FinancialGoalForm defaultCurrency={profile?.preferred_currency ?? "BRL"} /></section></main>;
}
