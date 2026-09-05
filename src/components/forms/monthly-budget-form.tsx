"use client";

import { useActionState, useState } from "react";
import { saveMonthlyBudgets, type BudgetFormState } from "@/app/actions/budgets";
import { assertMinorUnits, minorUnitsToInput } from "@/domain/money";
import type { CategoryKind, FinancialContext, SupportedCurrency } from "@/types/database";
import { FormMessage, SubmitButton, inputClass } from "./form-controls";

type BudgetCategory = {
  id: string;
  name: string;
  parentId: string | null;
  plannedAmountMinor: number;
  kind: CategoryKind;
};

type BudgetCategoryNode = {
  key: string;
  category: BudgetCategory;
  children: BudgetCategory[];
  totalAmountMinor: number;
};

const initialState: BudgetFormState = { status: "idle" };

function compareAmount(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function buildHierarchy(categories: BudgetCategory[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, BudgetCategory[]>();
  for (const category of categories) {
    if (!category.parentId || !byId.has(category.parentId)) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category);
    childrenByParent.set(category.parentId, children);
  }
  return categories
    .filter((category) => category.parentId === null || !byId.has(category.parentId))
    .map((category): BudgetCategoryNode => {
      const children = (childrenByParent.get(category.id) ?? []).sort(
        (left, right) =>
          compareAmount(left.plannedAmountMinor, right.plannedAmountMinor) ||
          left.name.localeCompare(right.name, "pt-BR"),
      );
      return {
        key: `${category.kind}:${category.id}`,
        category,
        children,
        totalAmountMinor: [category, ...children].reduce(
          (total, row) => assertMinorUnits(total + row.plannedAmountMinor),
          0,
        ),
      };
    })
    .sort((left, right) => {
      if (left.category.kind !== right.category.kind) {
        return left.category.kind === "income" ? -1 : 1;
      }
      return (
        compareAmount(left.totalAmountMinor, right.totalAmountMinor) ||
        left.category.name.localeCompare(right.category.name, "pt-BR")
      );
    });
}

export function MonthlyBudgetForm({ referenceMonth, context, currency, categories }: {
  referenceMonth: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  categories: BudgetCategory[];
}) {
  const [state, formAction, pending] = useActionState(saveMonthlyBudgets, initialState);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const hierarchy = buildHierarchy(categories);

  function toggleCategory(key: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="referenceMonth" value={referenceMonth} />
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="currency" value={currency} />
      {state.status === "error" && state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {hierarchy.map((node, index) => {
          const previous = hierarchy[index - 1];
          const showSection = !previous || previous.category.kind !== node.category.kind;
          const expanded = expandedCategories.has(node.key);
          return (
            <div key={node.key}>
              {showSection ? (
                <p className="border-b border-slate-200 bg-slate-800 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white">
                  {node.category.kind === "income" ? "Receitas" : "Despesas"}
                </p>
              ) : null}
              <button type="button" aria-expanded={expanded} onClick={() => toggleCategory(node.key)} className="flex min-h-10 w-full items-center justify-between gap-3 border-b border-slate-100 bg-emerald-50/50 px-3 text-left font-semibold text-slate-900 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600">
                <span><span aria-hidden="true" className="mr-2">{expanded ? "▾" : "▸"}</span>{node.category.name}</span>
                <span className="tabular-nums text-slate-600">{minorUnitsToInput(node.totalAmountMinor)}</span>
              </button>
              <div className={expanded ? "block" : "hidden"}>
                <BudgetInput category={node.category} label="Sem subcategoria" nested />
                {node.children.map((category) => <BudgetInput key={category.id} category={category} nested />)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end"><SubmitButton pending={pending}>Salvar orçamento</SubmitButton></div>
    </form>
  );
}

function BudgetInput({ category, label, nested = false }: {
  category: BudgetCategory;
  label?: string;
  nested?: boolean;
}) {
  return (
    <label className={`grid gap-2 border-b border-slate-100 py-2 pr-3 last:border-0 hover:bg-slate-50 sm:grid-cols-[1fr_11rem] sm:items-center ${nested ? "pl-10" : "pl-3"}`}>
      <span className="min-w-0 truncate font-semibold text-slate-900">{label ?? category.name}</span>
      <span className="grid gap-1 text-sm text-slate-600">
        <input type="hidden" name="categoryId" value={category.id} />
        <input name="plannedAmountMinor" inputMode="decimal" defaultValue={minorUnitsToInput(category.plannedAmountMinor)} className={inputClass()} aria-label={`Valor planejado para ${category.name}`} />
      </span>
    </label>
  );
}
