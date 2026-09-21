import Link from "next/link";
import { PageHeader, PageHelp } from "@/components/layout/page-header";
import { getCurrentUserDataQuality } from "@/services/finance/data-quality-service";

export const metadata = { title: "Qualidade dos dados" };

export default async function DataQualityPage() {
  const data = await getCurrentUserDataQuality();
  return (
    <main className="app-page max-w-5xl">
      <PageHeader title="Qualidade dos dados" back={{ href: "/dashboard", label: "Início" }} />
      {data.hasError ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Algumas verificações não puderam ser carregadas.</p> : null}
      <section className="grid grid-cols-2 gap-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Itens para revisar</p><p className="mt-1 text-3xl font-black text-slate-950">{data.hasError ? `${data.attentionCount} (parcial)` : data.attentionCount}</p><p className="mt-1 text-xs text-slate-600">verificações com pendências</p></article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Sem pendência</p><p className="mt-1 text-3xl font-black text-emerald-950">{data.hasError ? "—" : data.checks.filter((check) => check.count === 0).length}</p><p className="mt-1 text-xs text-emerald-900">verificações em ordem</p></article>
      </section>
      <section className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Verificações de qualidade">
        {data.checks.map((check) => (
          <Link key={check.id} href={check.href} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-950">{check.title}</p><p className="text-xs text-slate-600">{check.description}</p></div>
            <span className={`shrink-0 text-lg font-semibold ${check.count > 0 ? "text-slate-950" : "text-emerald-800"}`}>{check.count > 0 ? check.count : data.hasError ? "—" : "✓"}</span>
          </Link>
        ))}
      </section>
      <PageHelp title="Sobre as verificações">
        Os indicadores são recalculados ao abrir esta página. Revise as pendências no módulo de origem.
        Se algum dado não carregar, os resultados ficam parciais e não confirmam que tudo está em ordem.
      </PageHelp>
    </main>
  );
}
