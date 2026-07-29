import { CONTEXT_LABELS } from "@/domain/accounts";
import { formatMoney } from "@/domain/money";
import type {
  MonthlyBudgetProgress,
  SupportedCurrency,
} from "@/types/database";

export function SpendingTracker({
  rows,
  currency,
  locale,
}: {
  rows: MonthlyBudgetProgress[];
  currency: SupportedCurrency;
  locale: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-extrabold text-slate-950">
            Orçamento por categoria
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Planejado, realizado e saldo disponível ou excesso.
          </p>
        </div>
        <Link
          href="/budgets"
          className="text-sm font-bold text-emerald-700 hover:underline"
        >
          Gerenciar orçamento
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Nenhum orçamento definido para esta moeda no mês selecionado.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {rows.map((row) => {
            const percentage = Math.max(0, row.percentage_consumed ?? 0);
            const exceeded = row.available_amount_minor < 0;
            return (
              <article
                key={`${row.category_id}-${row.context}`}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-bold text-slate-950">
                      {row.category_name}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {CONTEXT_LABELS[row.context]}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-extrabold ${
                      exceeded ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {exceeded ? "Excesso " : "Disponível "}
                    {formatMoney(
                      Math.abs(row.available_amount_minor),
                      currency,
                      locale,
                    )}
                  </span>
                </div>
                <div
                  className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label={`Consumo do orçamento de ${row.category_name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(Math.round(percentage), 100)}
                >
                  <div
                    className={`h-full rounded-full ${
                      exceeded ? "bg-rose-500" : "bg-emerald-600"
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    Realizado{" "}
                    {formatMoney(row.realized_amount_minor, currency, locale)}
                  </span>
                  <span>
                    Planejado{" "}
                    {formatMoney(row.planned_amount_minor, currency, locale)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
import Link from "next/link";
