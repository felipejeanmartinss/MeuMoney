import Link from "next/link";
import {
  financialReportFilterSchema,
  reportBasisDescription,
  summarizeIncomeExpenseReport,
} from "@/domain/financial-reports";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import { getCurrentUserIncomeExpenseReport } from "@/services/reports/income-expense-report-service";
import type { FinancialReportBasis } from "@/types/database";

export const metadata = { title: "Relatórios" };

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

function currentYear() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).format(new Date()));
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] : undefined;
  const parsed = financialReportFilterSchema.safeParse({
    year: value("year") ?? currentYear(),
    currency: value("currency") ?? "BRL",
    basis: value("basis") ?? "competence",
  });
  const filters = parsed.success ? parsed.data : {
    year: currentYear(), currency: "BRL" as const, basis: "competence" as const,
  };
  const result = await getCurrentUserIncomeExpenseReport(filters);
  const totals = summarizeIncomeExpenseReport(result.rows);
  const peak = Math.max(
    1,
    ...result.rows.flatMap((row) => [row.incomeAmountMinor, row.expenseAmountMinor]),
  );

  return (
    <main className="mx-auto grid max-w-[1500px] gap-5 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">Análise financeira</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Relatórios</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Receitas, despesas e resultado mensal em uma consulta agregada, sempre separados por moeda.</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1" aria-label="Regime do relatório">
          {(["competence", "cash"] as FinancialReportBasis[]).map((basis) => (
            <Link
              key={basis}
              href={`/reports?year=${filters.year}&currency=${filters.currency}&basis=${basis}`}
              aria-current={filters.basis === basis ? "page" : undefined}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${filters.basis === basis ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}
            >
              {basis === "competence" ? "Competência" : "Caixa"}
            </Link>
          ))}
        </div>
      </header>

      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[180px_240px_auto] sm:items-end">
        <input type="hidden" name="basis" value={filters.basis} />
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">Ano
          <input name="year" type="number" min="2000" max="2200" defaultValue={filters.year} className="min-h-11 rounded-xl border border-slate-300 px-3" />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-slate-700">Moeda
          <select name="currency" defaultValue={filters.currency} className="min-h-11 rounded-xl border border-slate-300 px-3">
            {SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{CURRENCY_LABELS[currency]}</option>)}
          </select>
        </label>
        <button className="min-h-11 justify-self-start rounded-xl bg-slate-950 px-5 font-bold text-white hover:bg-slate-800">Atualizar</button>
      </form>

      <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        <strong>{filters.basis === "competence" ? "Competência" : "Caixa"}:</strong> {reportBasisDescription(filters.basis)}
      </p>

      {result.hasError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">Não foi possível carregar este relatório. Aplique a migration da feature e tente novamente.</p> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Receitas", totals.incomeAmountMinor, "text-emerald-700"],
          [filters.basis === "cash" ? "Saídas de caixa" : "Despesas", totals.expenseAmountMinor, "text-rose-700"],
          ["Resultado", totals.resultAmountMinor, totals.resultAmountMinor < 0 ? "text-rose-700" : "text-slate-950"],
        ].map(([label, amount, color]) => (
          <article key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-black ${color}`}>{formatMoney(Number(amount), filters.currency)}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-extrabold text-slate-950">Receitas versus despesas — {filters.year}</h2>
          <p className="mt-1 text-sm text-slate-500">As barras são uma visão proporcional; a tabela contém os valores completos.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">Receitas, despesas e resultado por mês</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">Mês</th><th className="w-[36%] px-4 py-2">Comparação</th><th className="px-4 py-2 text-right">Receitas</th><th className="px-4 py-2 text-right">Despesas</th><th className="px-4 py-2 text-right">Resultado</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((row, index) => (
                <tr key={row.referenceMonth} className="hover:bg-slate-50">
                  <th scope="row" className="px-4 py-2 text-left font-bold text-slate-800">{MONTHS[index]}</th>
                  <td className="px-4 py-2"><div className="grid gap-1" aria-hidden="true"><span className="h-2 rounded bg-emerald-500" style={{ width: `${Math.max(0, row.incomeAmountMinor / peak * 100)}%` }} /><span className="h-2 rounded bg-rose-400" style={{ width: `${Math.max(0, row.expenseAmountMinor / peak * 100)}%` }} /></div></td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-emerald-700">{formatMoney(row.incomeAmountMinor, filters.currency)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-bold text-rose-700">{formatMoney(row.expenseAmountMinor, filters.currency)}</td>
                  <td className={`whitespace-nowrap px-4 py-2 text-right font-black ${row.resultAmountMinor < 0 ? "text-rose-700" : "text-slate-950"}`}>{formatMoney(row.resultAmountMinor, filters.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
