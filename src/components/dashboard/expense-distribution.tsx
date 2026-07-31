import { CONTEXT_LABELS } from "@/domain/accounts";
import { formatMoney } from "@/domain/money";
import type {
  FinancialDashboardExpenseCategory,
  SupportedCurrency,
} from "@/types/database";

export function ExpenseDistribution({
  rows,
  currency,
  locale,
}: {
  rows: FinancialDashboardExpenseCategory[];
  currency: SupportedCurrency;
  locale: string;
}) {
  const total = rows.reduce(
    (sum, row) => sum + row.expense_amount_minor,
    0,
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-extrabold text-slate-950">
        Despesas por categoria
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Distribuição do consumo realizado no mês.
      </p>
      {rows.length ? (
        <div className="mt-5 grid gap-4">
          {rows.map((row) => {
            const percentage =
              total === 0 ? 0 : (row.expense_amount_minor / total) * 100;
            return (
              <article key={row.category_id}>
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {row.category_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {CONTEXT_LABELS[row.context]}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-slate-900">
                      {formatMoney(
                        row.expense_amount_minor,
                        currency,
                        locale,
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {percentage.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Nenhuma despesa de consumo realizada neste mês.
        </p>
      )}
    </section>
  );
}
