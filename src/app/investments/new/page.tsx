import Link from "next/link";
import { InvestmentPositionForm } from "@/components/forms/investment-position-form";
import { getCurrentProfile } from "@/services/auth/server-auth";
import { toIsoDate } from "@/utils/dates";

export const metadata = { title: "Nova posição de investimento" };

export default async function NewInvestmentPositionPage() {
  const { profile } = await getCurrentProfile();
  const today = toIsoDate(new Date());

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/investments"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para investimentos
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">
          Posição sem movimentação
        </h1>
        <p className="mt-2 text-slate-600">
          Cadastre posições anteriores a 2026 ou sem lançamento disponível.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <InvestmentPositionForm
          values={{
            currency: profile?.preferred_currency ?? "BRL",
            positionDate: today,
            maxPositionDate: today,
          }}
        />
      </section>
    </main>
  );
}
