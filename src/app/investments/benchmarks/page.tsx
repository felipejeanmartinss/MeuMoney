import { PageHeader, PageHelp } from "@/components/layout/page-header";
import { INVESTMENT_BENCHMARKS } from "@/domain/investment-benchmarks";

export const metadata = { title: "Benchmarks de investimentos" };

export default function InvestmentBenchmarksPage() {
  return (
    <main className="app-page max-w-5xl">
      <PageHeader title="Benchmarks" back={{ href: "/investments", label: "Investimentos" }} />
      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Comparações ainda indisponíveis: aguardando sincronização das séries históricas.</section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Referências previstas">
        {INVESTMENT_BENCHMARKS.map((benchmark) => <article key={benchmark.code} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-black text-slate-950">{benchmark.label}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">Pendente</span></div><p className="mt-2 text-sm text-slate-600">{benchmark.description}</p></article>)}
      </section>
      <PageHelp title="Como será a comparação?">
        Carteira ou ativo e benchmark serão comparados no mesmo período, com diferença em pontos percentuais
        e retorno real descontado do IPCA. Não há resultados enquanto as séries não estiverem disponíveis.
      </PageHelp>
    </main>
  );
}
