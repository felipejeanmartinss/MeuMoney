import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { calculateIrpf2026 } from "@/domain/irpf-simulator";
import { formatMoney } from "@/domain/money";
import { getCurrentUserIrpfSimulation } from "@/services/finance/irpf-simulator-service";

export const metadata = { title: "Simulador IRPF" };

const money = (value: number) => formatMoney(value, "BRL");
const monthLabel = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${month}-01T12:00:00Z`)).replace(".", "");

export default async function IrpfSimulatorPage() {
  const { months, hasError, classifiedCount } = await getCurrentUserIrpfSimulation(2026);
  if (hasError) return <main className="app-page grid gap-4"><PageHeader title="Simulador IRPF" /><p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Não foi possível carregar todos os lançamentos. Tente abrir a página novamente.</p></main>;
  const simulation = calculateIrpf2026(months);
  return <main className="app-page grid gap-4">
    <PageHeader title="Simulador IRPF" description="Ano-calendário 2026 · compare as deduções legais com o desconto simplificado." />
    {!hasError && classifiedCount === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Nenhum lançamento elegível foi encontrado. Classifique salários, férias, INSS, plano de saúde e IR nas categorias correspondentes.</p> : null}
    <p className="text-sm text-slate-600">Os valores vêm de lançamentos realizados em BRL. Confira se os salários cadastrados são <strong>brutos</strong>; depósitos líquidos não representam a base tributável. Férias, 13º salário, dependentes e outras deduções podem exigir tratamento adicional.</p>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="monthly-tax-title">
      <div className="border-b border-slate-200 px-4 py-3"><h2 id="monthly-tax-title" className="font-semibold">Fluxo mensal</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[910px] text-right text-sm tabular-nums">
        <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-3 py-2 text-left">Mês</th><th className="px-3 py-2">Salário</th><th className="px-3 py-2">Férias</th><th className="px-3 py-2">INSS</th><th className="px-3 py-2">Plano de saúde</th><th className="px-3 py-2">Reembolso saúde</th><th className="px-3 py-2">Previdência</th><th className="px-3 py-2">IR pago</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{months.map((row) => <tr key={row.month}><th className="px-3 py-2 text-left font-medium capitalize">{monthLabel(row.month)}</th><td className="px-3 py-2">{money(row.salaryMinor)}</td><td className="px-3 py-2">{money(row.vacationMinor)}</td><td className="px-3 py-2">{money(row.inssMinor)}</td><td className="px-3 py-2">{money(row.healthMinor)}</td><td className="px-3 py-2">{money(row.healthReimbursementMinor)}</td><td className="px-3 py-2">{money(row.pensionMinor)}</td><td className="px-3 py-2">{money(row.withheldTaxMinor)}</td></tr>)}</tbody>
        <tfoot className="bg-slate-50 font-semibold"><tr><th className="px-3 py-3 text-left">Total</th><td className="px-3 py-3">{money(months.reduce((sum, row) => sum + row.salaryMinor, 0))}</td><td className="px-3 py-3">{money(months.reduce((sum, row) => sum + row.vacationMinor, 0))}</td><td className="px-3 py-3">{money(simulation.inssMinor)}</td><td className="px-3 py-3">{money(months.reduce((sum, row) => sum + row.healthMinor, 0))}</td><td className="px-3 py-3">{money(months.reduce((sum, row) => sum + row.healthReimbursementMinor, 0))}</td><td className="px-3 py-3">{money(simulation.pensionMinor)}</td><td className="px-3 py-3">{money(simulation.withheldTaxMinor)}</td></tr></tfoot>
      </table></div>
    </section>
    {classifiedCount > 0 ? <section className="grid gap-3 sm:grid-cols-2" aria-label="Comparação de regimes">
      {(["complete", "simplified"] as const).map((regime) => {
        const result = simulation[regime];
        return <article key={regime} className={`rounded-xl border bg-white p-4 ${simulation.advantageous === regime ? "border-emerald-500" : "border-slate-200"}`}>
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{regime === "complete" ? "Deduções legais" : "Desconto simplificado"}</h2>{simulation.advantageous === regime ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Menor imposto estimado</span> : null}</div>
          <dl className="mt-3 grid gap-1 text-sm"><div className="flex justify-between"><dt>Rendimentos considerados</dt><dd>{money(simulation.incomeMinor)}</dd></div><div className="flex justify-between"><dt>Desconto</dt><dd>{money(result.deductionMinor)}</dd></div><div className="flex justify-between"><dt>Base estimada</dt><dd>{money(result.baseMinor)}</dd></div><div className="flex justify-between"><dt>Imposto após redução</dt><dd>{money(result.dueMinor)}</dd></div><div className="flex justify-between border-t pt-2 font-semibold"><dt>Diferença após IR pago</dt><dd>{money(result.balanceMinor)}</dd></div></dl>
        </article>;
      })}
    </section> : null}
    <p className="text-xs leading-relaxed text-slate-600">Previdência dedutível limitada a 12% dos rendimentos considerados: {money(simulation.deductiblePensionMinor)}. O desconto simplificado é 20%, limitado a R$ 17.640,00 em 2026. Valores positivos na diferença indicam imposto estimado ainda não coberto pelo IR registrado; negativos, possível crédito. Isto não substitui a declaração oficial nem inclui todas as situações fiscais.</p>
    <div className="flex flex-wrap gap-3 text-xs"><Link className="text-emerald-800 underline" href="/investments">Marcar previdência elegível</Link><Link className="text-emerald-800 underline" href="/accounts">Conferir contas de previdência</Link><a className="text-emerald-800 underline" href="https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026" target="_blank" rel="noopener noreferrer">Tabela oficial 2026</a></div>
  </main>;
}
