import Link from "next/link";
import { getCurrentUserDataQuality } from "@/services/finance/data-quality-service";

export const metadata = { title: "Qualidade dos dados" };

export default async function DataQualityPage() {
  const data = await getCurrentUserDataQuality();
  return (
    <main className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">Confiabilidade</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Qualidade dos dados</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">Uma visão rápida do que pode distorcer seus saldos, relatórios e decisões.</p>
      </header>
      {data.hasError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Algumas verificações não puderam ser carregadas.</p> : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Itens para revisar</p><p className="mt-1 text-3xl font-black text-slate-950">{data.attentionCount}</p><p className="mt-1 text-xs text-slate-600">categorias de qualidade com pendências</p></article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Sem pendência</p><p className="mt-1 text-3xl font-black text-emerald-950">{data.checks.filter((check) => check.count === 0).length}</p><p className="mt-1 text-xs text-emerald-900">verificações em ordem</p></article>
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Critério</p><p className="mt-1 text-sm font-black text-slate-950">Atualização e consistência</p><p className="mt-1 text-xs text-slate-600">A lista é recalculada ao abrir a página.</p></article>
      </section>
      <section className="grid gap-2" aria-label="Verificações de qualidade">
        {data.checks.map((check) => (
          <Link key={check.id} href={check.href} className={`flex flex-col gap-2 rounded-xl border px-4 py-3 transition hover:-translate-y-px hover:shadow-sm sm:flex-row sm:items-center sm:justify-between ${check.count > 0 ? check.tone === "attention" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="min-w-0"><p className="font-bold text-slate-950">{check.title}</p><p className="text-xs text-slate-600">{check.description}</p></div>
            <span className={`shrink-0 text-xl font-black ${check.count > 0 ? "text-slate-950" : "text-emerald-800"}`}>{check.count > 0 ? check.count : "✓"}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
