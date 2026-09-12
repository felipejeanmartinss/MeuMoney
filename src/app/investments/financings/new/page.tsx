import Link from "next/link";
import { ManualFinancingForm } from "@/components/forms/manual-financing-form";

export const metadata = { title: "Cadastrar financiamento" };

export default function NewFinancingPage() {
  return (
    <main className="mx-auto grid max-w-[96rem] gap-5 px-4 py-6 sm:px-6 lg:py-8">
      <header>
        <Link
          href="/investments?tab=financing"
          className="text-sm font-bold text-emerald-700 hover:underline"
        >
          ← Voltar para financiamentos
        </Link>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
          Cadastro histórico
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
          Financiamento
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Informe o resumo do contrato e as parcelas conhecidas em uma única
          tabela. Os totais pagos serão consolidados automaticamente.
        </p>
      </header>

      <ManualFinancingForm />
    </main>
  );
}
