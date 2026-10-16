import Link from "next/link";
import { saveIrpfProjections } from "@/app/actions/irpf-simulator";
import { PageHeader } from "@/components/layout/page-header";
import {
  applyIrpfMonthlyProjections,
  calculateIrpf2026,
  currentIrpfMonth,
  type IrpfMonthField,
} from "@/domain/irpf-simulator";
import { formatMoney, minorUnitsToInput } from "@/domain/money";
import { getCurrentUserIrpfSimulation } from "@/services/finance/irpf-simulator-service";

export const metadata = { title: "Simulador IRPF" };

const money = (value: number) => formatMoney(value, "BRL");
const cellAmount = (value: number) => new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value / 100);
const monthLabel = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "short" })
  .format(new Date(`${month}-01T12:00:00Z`)).replace(".", "");
const fields: { key: IrpfMonthField; label: string }[] = [
  { key: "salaryMinor", label: "Salário bruto" },
  { key: "vacationMinor", label: "Férias tributáveis" },
  { key: "inssMinor", label: "INSS" },
  { key: "healthMinor", label: "Plano de saúde" },
  { key: "healthReimbursementMinor", label: "Reembolso saúde" },
  { key: "pensionMinor", label: "Previdência elegível" },
  { key: "withheldTaxMinor", label: "IR pago" },
];

export default async function IrpfSimulatorPage({ searchParams }: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ months: actualMonths, projections, hasError, classifiedCount }, query] = await Promise.all([
    getCurrentUserIrpfSimulation(2026), searchParams,
  ]);
  if (hasError) return <main className="app-page grid gap-4">
    <PageHeader title="Simulador IRPF" />
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      Não foi possível carregar todos os lançamentos ou projeções. Tente abrir a página novamente.
    </p>
  </main>;

  const currentMonth = currentIrpfMonth();
  const months = applyIrpfMonthlyProjections(actualMonths, projections, currentMonth);
  const simulation = calculateIrpf2026(months);
  const projectedByMonth = new Map(projections.map((row) => [row.month, row]));
  const hasProjection = projections.some((row) => row.month >= currentMonth && fields.some(({ key }) => row[key] !== null && row[key] !== undefined));
  const hasValues = classifiedCount > 0 || hasProjection;
  const feedback = query.status === "saved" ? "Projeções salvas. Nenhum lançamento real foi alterado."
    : query.status === "invalid" ? "Revise os valores: informe montantes positivos no formato 2.028,65."
      : query.status === "error" ? "Não foi possível salvar as projeções. Tente novamente." : null;

  return <main className="app-page grid gap-4">
    <PageHeader title="Simulador IRPF" description="Ano-calendário 2026 · rendimentos, deduções e IR pago." />
    {feedback ? <p role={query.status === "saved" ? "status" : "alert"} className={`rounded-xl border p-3 text-sm ${query.status === "saved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{feedback}</p> : null}
    {!hasValues ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Nenhum lançamento elegível foi encontrado. Classifique salários, férias, INSS, plano de saúde e IR ou informe uma projeção.</p> : null}
    <p className="text-sm text-slate-600">Use valores brutos de salário. Meses anteriores mostram apenas lançamentos realizados; do mês atual em diante, um valor informado substitui o total daquele mês somente nesta simulação. Campo vazio usa o realizado, inclusive zero.</p>

    <form action={saveIrpfProjections} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div><h2 className="font-semibold">Fluxo mensal</h2><p className="text-xs text-slate-500">Valores em R$ · estimativas não criam lançamentos</p></div>
        {currentMonth <= "2026-12" ? <button type="submit" className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">Salvar estimativas</button> : null}
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1580px] text-right text-sm tabular-nums">
        <thead className="bg-slate-50 text-xs text-slate-600"><tr>
          <th scope="col" className="sticky left-0 z-10 min-w-48 bg-slate-50 px-3 py-2 text-left">Item</th>
          {months.map((month) => <th scope="col" key={month.month} className={`min-w-28 px-2 py-2 text-center capitalize ${month.month === currentMonth ? "bg-emerald-50 text-emerald-900" : ""}`}>
            {monthLabel(month.month)}{month.month >= currentMonth && month.month <= "2026-12" ? <span className="block text-[10px] font-normal normal-case">Estimativa</span> : null}
          </th>)}
          <th scope="col" className="min-w-32 px-3 py-2">Total</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{fields.map(({ key, label }) => <tr key={key}>
          <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium">{label}</th>
          {months.map((month, index) => {
            const actual = actualMonths[index][key];
            const forecast = projectedByMonth.get(month.month)?.[key];
            const editable = month.month >= currentMonth && month.month <= "2026-12";
            return <td key={month.month} className={`px-1.5 py-1.5 ${editable ? "bg-emerald-50/40" : ""}`}>
              {editable ? <><input
                aria-label={`${label}, ${monthLabel(month.month)} de 2026, total estimado em reais`}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right text-xs tabular-nums focus:border-emerald-700"
                name={`${month.month}.${key}`} inputMode="decimal"
                defaultValue={forecast === null || forecast === undefined ? "" : minorUnitsToInput(forecast)}
                placeholder={cellAmount(actual)}
              />{actual > 0 ? <span className="block pt-0.5 text-[10px] text-slate-500">Real {cellAmount(actual)}</span> : null}</>
                : cellAmount(actual)}
            </td>;
          })}
          <td className="bg-slate-50 px-3 py-2 font-semibold">{cellAmount(months.reduce((sum, month) => sum + month[key], 0))}</td>
        </tr>)}</tbody>
      </table></div>
    </form>

    {hasValues ? <section className="grid gap-3 sm:grid-cols-2" aria-label="Comparação de regimes">
      {(["complete", "simplified"] as const).map((regime) => {
        const result = simulation[regime];
        return <article key={regime} className={`rounded-xl border bg-white p-4 ${simulation.advantageous === regime ? "border-emerald-500" : "border-slate-200"}`}>
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{regime === "complete" ? "Deduções legais" : "Desconto simplificado"}</h2>{simulation.advantageous === regime ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Menor imposto estimado</span> : null}</div>
          <dl className="mt-3 grid gap-1 text-sm"><div className="flex justify-between"><dt>Rendimentos considerados</dt><dd>{money(simulation.incomeMinor)}</dd></div><div className="flex justify-between"><dt>Desconto</dt><dd>{money(result.deductionMinor)}</dd></div><div className="flex justify-between"><dt>Base estimada</dt><dd>{money(result.baseMinor)}</dd></div><div className="flex justify-between"><dt>Imposto após redução</dt><dd>{money(result.dueMinor)}</dd></div><div className="flex justify-between border-t pt-2 font-semibold"><dt>{result.settlementMinor < 0 ? "Imposto a pagar" : result.settlementMinor > 0 ? "Imposto a restituir" : "Imposto a pagar ou restituir"}</dt><dd className={result.settlementMinor < 0 ? "text-red-700" : result.settlementMinor > 0 ? "text-emerald-700" : ""}>{money(result.settlementMinor)}</dd></div></dl>
        </article>;
      })}
    </section> : null}
    <p className="text-xs leading-relaxed text-slate-600">Tabela anual de 2026 (declaração de 2027): desconto simplificado de 20%, limitado a R$ 17.640,00, ou deduções legais. A previdência elegível é limitada a 12% dos rendimentos tributáveis e, em regra, exige contribuição à previdência oficial; VGBL não é dedutível. O IR pago entra como crédito, não dedução. No saldo final, positivo indica possível restituição e negativo indica imposto a pagar. Projeções, salário líquido lançado como bruto, 13º, dependentes e outras situações podem alterar o resultado oficial.</p>
    <div className="flex flex-wrap gap-3 text-xs"><Link className="text-emerald-800 underline" href="/investments">Marcar previdência elegível</Link><Link className="text-emerald-800 underline" href="/accounts">Conferir contas de previdência</Link><a className="text-emerald-800 underline" href="https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026" target="_blank" rel="noopener noreferrer">Tabela oficial 2026</a></div>
  </main>;
}
