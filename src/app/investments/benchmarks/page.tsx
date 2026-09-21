import Link from "next/link";
import { INVESTMENT_BENCHMARKS } from "@/domain/investment-benchmarks";

export const metadata = { title: "Benchmarks de investimentos" };

export default function InvestmentBenchmarksPage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/investments" className="text-sm font-bold text-emerald-700 hover:underline">← Voltar para investimentos</Link>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">Contexto de performance</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Benchmarks</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Compare carteira e ativos com referências do mesmo período, sem misturar retorno nominal e inflação.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Séries em preparação</span>
      </header>
      <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">As referências estão cadastradas para a comparação, mas os pontos históricos ainda precisam ser sincronizados por uma fonte de mercado. Nenhuma taxa é inventada quando a série não está disponível.</section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Benchmarks disponíveis">
        {INVESTMENT_BENCHMARKS.map((benchmark) => <article key={benchmark.code} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-black text-slate-950">{benchmark.label}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">Pendente</span></div><p className="mt-2 text-sm text-slate-600">{benchmark.description}</p></article>)}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="font-black text-slate-950">Comparações que a central vai exibir</h2><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700"><strong>Retorno do período:</strong> carteira ou ativo contra a série escolhida.</p><p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700"><strong>Spread:</strong> quantos pontos percentuais acima ou abaixo do benchmark.</p><p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700"><strong>Retorno real:</strong> rentabilidade descontada do IPCA.</p><p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700"><strong>Metas:</strong> percentual do patrimônio-alvo e renda passiva mensal.</p></div></section>
    </main>
  );
}
