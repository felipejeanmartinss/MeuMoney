import Link from "next/link";
import { CreditCardForm } from "@/components/forms/credit-card-form";
import { getCurrentProfile } from "@/services/auth/server-auth";
import { getCreditCardFormOptions } from "@/services/finance/credit-cards-service";

export const metadata = { title: "Novo cartão" };

export default async function NewCreditCardPage() {
  const [{ profile }, { accounts }] = await Promise.all([
    getCurrentProfile(),
    getCreditCardFormOptions(),
  ]);
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link href="/credit-cards" className="text-sm font-semibold text-blue-700">
          ← Voltar para cartões
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold text-slate-950">
          Novo cartão
        </h1>
        <p className="mt-2 text-slate-600">
          Defina ciclo, limite e uma conta opcional para pagamento.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CreditCardForm
          values={{ currency: profile?.preferred_currency ?? "BRL" }}
          accounts={accounts}
        />
      </section>
    </main>
  );
}
