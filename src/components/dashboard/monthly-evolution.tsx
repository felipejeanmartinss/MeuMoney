import { formatMoney } from "@/domain/money";
import type {
  DashboardMonthlySummary,
} from "@/domain/financial-dashboard";
import type {
  FinancialReportBasis,
  SupportedCurrency,
} from "@/types/database";

function shortMonth(referenceMonth: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(`${referenceMonth.slice(0, 7)}-01T12:00:00Z`))
    .replace(".", "");
}

export function MonthlyEvolution({
  rows,
  currency,
  locale,
  basis = "competence",
}: {
  rows: DashboardMonthlySummary[];
  currency: SupportedCurrency;
  locale: string;
  basis?: FinancialReportBasis;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4">
        <h3 className="text-lg font-extrabold text-slate-950">
          Evolução em seis meses
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Receitas e {basis === "cash" ? "saídas de caixa" : "despesas por competência"}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr><th className="px-4 py-2 text-left">Mês</th><th className="px-4 py-2 text-right">Receitas</th><th className="px-4 py-2 text-right">Despesas</th><th className="px-4 py-2 text-right">Resultado</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.referenceMonth}>
                <td className="px-4 py-2 font-bold text-slate-800">{shortMonth(row.referenceMonth)}</td>
                <td className="px-4 py-2 text-right text-emerald-700">{formatMoney(row.incomeAmountMinor, currency, locale)}</td>
                <td className="px-4 py-2 text-right text-rose-700">{formatMoney(row.expenseAmountMinor, currency, locale)}</td>
                <td className={`px-4 py-2 text-right font-extrabold ${row.resultAmountMinor < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatMoney(row.resultAmountMinor, currency, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
