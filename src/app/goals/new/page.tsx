import { PageHeader } from "@/components/layout/page-header";
import { FinancialGoalForm } from "@/components/forms/financial-goal-form";
import { getCurrentProfile } from "@/services/auth/server-auth";

export const metadata = { title: "Nova meta" };

export default async function NewGoalPage() {
  const { profile } = await getCurrentProfile();
  return <main className="app-page max-w-3xl"><PageHeader title="Nova meta" back={{ href: "/goals", label: "Metas" }} /><section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><FinancialGoalForm defaultCurrency={profile?.preferred_currency ?? "BRL"} /></section></main>;
}
