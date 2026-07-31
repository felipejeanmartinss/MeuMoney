import Link from "next/link";
import { NetWorthItemForm } from "@/components/forms/net-worth-item-form";
import { getCurrentProfile } from "@/services/auth/server-auth";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Novo item patrimonial" };

export default async function NewNetWorthItemPage() {
  const { profile } = await getCurrentProfile();

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/net-worth"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para patrimônio
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Novo item patrimonial
        </h1>
        <p className="mt-2 text-slate-600">
          Registre um bem ou uma dívida sem alterar suas contas e movimentações.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <NetWorthItemForm
          values={{
            currency: profile?.preferred_currency ?? "BRL",
            valuationDate: toIsoDate(new Date()),
            maxValuationDate: toIsoDate(new Date()),
          }}
        />
      </section>
    </main>
  );
}
