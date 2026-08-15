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
  const maximum = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.incomeAmountMinor,
      row.expenseAmountMinor,
    ]),
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-extrabold text-slate-950">
          Evolução em seis meses
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Receitas e {basis === "cash" ? "saídas de caixa" : "despesas por competência"}.
        </p>
      </div>
      <div
        className="mt-6 grid grid-cols-6 gap-2"
        role="img"
        aria-label="Comparação de receitas e despesas dos últimos seis meses"
      >
        {rows.map((row) => (
          <div
            key={row.referenceMonth}
            className="grid min-w-0 grid-rows-[8rem_auto_auto] gap-2"
          >
            <div className="flex items-end justify-center gap-1 border-b border-slate-200">
              <span
                className="w-2 rounded-t bg-emerald-500 sm:w-3"
                style={{
                  height: `${Math.max(
                    row.incomeAmountMinor > 0 ? 4 : 0,
                    (row.incomeAmountMinor / maximum) * 100,
                  )}%`,
                }}
                title={`Receitas: ${formatMoney(
                  row.incomeAmountMinor,
                  currency,
                  locale,
                )}`}
              />
              <span
                className="w-2 rounded-t bg-rose-400 sm:w-3"
                style={{
                  height: `${Math.max(
                    row.expenseAmountMinor > 0 ? 4 : 0,
                    (row.expenseAmountMinor / maximum) * 100,
                  )}%`,
                }}
                title={`Despesas: ${formatMoney(
                  row.expenseAmountMinor,
                  currency,
                  locale,
                )}`}
              />
            </div>
            <p className="truncate text-center text-[0.65rem] font-semibold uppercase text-slate-500 sm:text-xs">
              {shortMonth(row.referenceMonth)}
            </p>
            <p
              className={`truncate text-center text-[0.65rem] font-bold sm:text-xs ${
                row.resultAmountMinor < 0
                  ? "text-rose-700"
                  : "text-emerald-700"
              }`}
              title={`Resultado: ${formatMoney(
                row.resultAmountMinor,
                currency,
                locale,
              )}`}
            >
              {formatMoney(row.resultAmountMinor, currency, locale)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-emerald-500" />
          Receitas
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-rose-400" />
          Despesas
        </span>
        <span>Valor sob cada mês: resultado mensal</span>
      </div>
    </section>
  );
}
