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
} from "@/types/database";
import { FormMessage, SubmitButton, inputClass } from "./form-controls";

type BudgetCategory = {
  id: string;
  name: string;
  plannedAmountMinor: number;
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

      <div className="grid gap-3">
        {categories.map((category) => (
          <label
            key={category.id}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_12rem] sm:items-center"
          >
            <span className="font-semibold text-slate-900">{category.name}</span>
            <span className="grid gap-1 text-sm text-slate-600">
              Planejado ({currency})
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
