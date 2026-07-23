import Link from "next/link";
import { AccountForm } from "@/components/forms/account-form";
import { getCurrentProfile } from "@/services/auth/server-auth";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Nova conta" };

export default async function NewAccountPage() {
  const { profile } = await getCurrentProfile();

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/accounts"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para contas
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Nova conta
        </h1>
        <p className="mt-2 text-slate-600">
          Informe os dados básicos e o saldo conhecido na data de referência.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <AccountForm
          values={{
            currency: profile?.preferred_currency ?? "BRL",
            openingBalanceDate: toIsoDate(new Date()),
          }}
        />
      </section>
    </main>
  );
}
