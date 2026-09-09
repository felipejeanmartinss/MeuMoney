import Link from "next/link";
import { InvestmentUnitPriceForm } from "@/components/forms/investment-unit-price-form";
import { listCurrentUserMarketPricedInvestmentPositions } from "@/services/finance/investments-service";

export const metadata = { title: "Atualizar cotações" };

export default async function InvestmentPricesPage() {
  const { positions, hasError } =
    await listCurrentUserMarketPricedInvestmentPositions();

  return (
    <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/investments" className="w-fit text-sm font-bold text-emerald-700">
        ← Voltar para investimentos
      </Link>
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
          Ações e fundos imobiliários
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">
          Atualizar cotações
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          O valor atual será recalculado pela quantidade multiplicada pelo valor unitário.
        </p>
      </header>
      {hasError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
          Não foi possível carregar as posições.
        </p>
      ) : positions.length ? (
        <InvestmentUnitPriceForm positions={positions} />
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          Nenhuma ação ou fundo imobiliário ativo para atualizar.
        </section>
      )}
    </main>
  );
}
