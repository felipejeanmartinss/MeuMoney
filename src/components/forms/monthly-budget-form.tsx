"use client";

import { useActionState } from "react";
import {
  saveMonthlyBudgets,
  type BudgetFormState,
} from "@/app/actions/budgets";
import { minorUnitsToInput } from "@/domain/money";
import type {
  FinancialContext,
  SupportedCurrency,
  CategoryKind,
} from "@/types/database";
import { FormMessage, SubmitButton, inputClass } from "./form-controls";

type BudgetCategory = {
  id: string;
  name: string;
  plannedAmountMinor: number;
  kind: CategoryKind;
};

const initialState: BudgetFormState = { status: "idle" };

export function MonthlyBudgetForm({
  referenceMonth,
  context,
  currency,
  categories,
}: {
  referenceMonth: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  categories: BudgetCategory[];
}) {
  const [state, formAction, pending] = useActionState(
    saveMonthlyBudgets,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="referenceMonth" value={referenceMonth} />
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="currency" value={currency} />

      {state.status === "error" && state.message ? (
        <FormMessage>{state.message}</FormMessage>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        {categories.map((category) => (
          <label
            key={category.id}
            className="grid gap-2 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50 sm:grid-cols-[1fr_11rem] sm:items-center"
          >
            <span className="min-w-0 truncate font-semibold text-slate-900">
              <span className={`mr-2 text-[0.62rem] font-black uppercase ${category.kind === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                {category.kind === "income" ? "Receita" : "Despesa"}
              </span>
              {category.name}
            </span>
            <span className="grid gap-1 text-sm text-slate-600">
              <input type="hidden" name="categoryId" value={category.id} />
              <input
                name="plannedAmountMinor"
                inputMode="decimal"
                defaultValue={minorUnitsToInput(category.plannedAmountMinor)}
                className={inputClass()}
                aria-label={`Valor planejado para ${category.name}`}
              />
            </span>
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <SubmitButton pending={pending}>Salvar orçamento</SubmitButton>
      </div>
    </form>
  );
}
