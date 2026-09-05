"use client";

import { useActionState } from "react";
import { saveAnnualBudgets, type BudgetFormState } from "@/app/actions/budgets";
import { minorUnitsToInput } from "@/domain/money";
import type { CategoryKind, FinancialContext, SupportedCurrency } from "@/types/database";
import { FormMessage, SubmitButton } from "./form-controls";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
const initialState: BudgetFormState = { status: "idle" };

export type AnnualBudgetCategory = {
  id: string;
  name: string;
  kind: CategoryKind;
  plannedByMonth: number[];
};

export function AnnualBudgetForm({ year, context, currency, categories }: {
  year: number;
  context: FinancialContext;
  currency: SupportedCurrency;
  categories: AnnualBudgetCategory[];
}) {
  const [state, formAction, pending] = useActionState(saveAnnualBudgets, initialState);
  const ordered = ["income", "expense"].flatMap((kind) =>
    categories.filter((category) => category.kind === kind),
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="currency" value={currency} />
      {state.status === "error" && state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1320px] table-fixed border-collapse text-xs">
          <caption className="sr-only">Orçamento anual por categoria e mês</caption>
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              <th className="w-60 border-b border-r border-slate-200 px-3 py-2 text-left">Categoria</th>
              {MONTHS.map((month) => <th key={month} className="w-[82px] border-b border-slate-200 px-1 py-2 text-center">{month}</th>)}
            </tr>
          </thead>
          <tbody>
            {ordered.map((category, index) => {
              const previous = ordered[index - 1];
              const showKind = !previous || previous.kind !== category.kind;
              return (
                <tr key={category.id} className="border-b border-slate-100 hover:bg-emerald-50/30">
                  <th scope="row" className="border-r border-slate-200 px-3 py-1.5 text-left font-semibold text-slate-800">
                    {showKind ? <span className="mr-2 text-[0.62rem] font-black uppercase tracking-wide text-emerald-700">{category.kind === "income" ? "Receitas" : "Despesas"}</span> : null}
                    {category.name}
                  </th>
                  {MONTHS.map((month, monthIndex) => {
                    const referenceMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
                    return (
                      <td key={month} className="px-1 py-1">
                        <input type="hidden" name="budgetCell" value={`${category.id}|${referenceMonth}`} />
                        <input
                          name="plannedAmountMinor"
                          inputMode="decimal"
                          defaultValue={minorUnitsToInput(category.plannedByMonth[monthIndex] ?? 0)}
                          aria-label={`${category.name}, ${month} de ${year}`}
                          className="h-8 w-full rounded border border-transparent bg-transparent px-1.5 text-right tabular-nums text-slate-800 hover:border-slate-300 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end"><SubmitButton pending={pending}>Salvar orçamento anual</SubmitButton></div>
    </form>
  );
}
