import Link from "next/link";

export function FinancingNavigation({ base, active }: { base: string; active: "general" | "simulation" | "summary" | "flow" }) {
  return <nav aria-label="Financiamento" className="flex flex-wrap gap-1 rounded-xl border bg-white p-2 text-sm font-bold">
    {([["general", "Parcelas", ""], ["simulation", "Simulações", "?aba=simular"], ["summary", "Resumo", "?aba=relatorio"], ["flow", "Fluxo", "/edit"]] as const).map(([key, label, suffix]) =>
      <Link key={key} href={base + suffix} aria-current={active === key ? "page" : undefined}
        className={"rounded-lg px-4 py-2 " + (active === key ? "bg-emerald-700 text-white" : "text-emerald-800 hover:bg-emerald-50")}>{label}</Link>)}
  </nav>;
}
