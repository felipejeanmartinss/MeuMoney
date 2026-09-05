"use client";

import { useActionState, useState } from "react";
import { saveAnnualBudgets, type BudgetFormState } from "@/app/actions/budgets";
import { assertMinorUnits, minorUnitsToInput } from "@/domain/money";
import type {
  CategoryKind,
  FinancialContext,
  SupportedCurrency,
} from "@/types/database";
import { FormMessage, SubmitButton } from "./form-controls";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
const initialState: BudgetFormState = { status: "idle" };

export type AnnualBudgetCategory = {
  id: string;
  name: string;
  parentId: string | null;
  kind: CategoryKind;
  plannedByMonth: number[];
};

type BudgetCategoryNode = {
  key: string;
  category: AnnualBudgetCategory;
  children: AnnualBudgetCategory[];
  plannedByMonth: number[];
  totalAmountMinor: number;
};

function sum(values: readonly number[]) {
  return values.reduce((total, value) => assertMinorUnits(total + value), 0);
}

function compareAmount(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function buildBudgetHierarchy(categories: AnnualBudgetCategory[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string, AnnualBudgetCategory[]>();
  for (const category of categories) {
    if (!category.parentId || !categoryById.has(category.parentId)) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category);
    childrenByParent.set(category.parentId, children);
  }

  return categories
    .filter((category) => category.parentId === null || !categoryById.has(category.parentId))
    .map((category): BudgetCategoryNode => {
      const children = (childrenByParent.get(category.id) ?? []).sort(
        (left, right) =>
          compareAmount(sum(left.plannedByMonth), sum(right.plannedByMonth)) ||
          left.name.localeCompare(right.name, "pt-BR"),
      );
      const rows = [category, ...children];
      const plannedByMonth = MONTHS.map((_, index) =>
        sum(rows.map((row) => row.plannedByMonth[index] ?? 0)),
      );
      return {
        key: `${category.kind}:${category.id}`,
        category,
        children,
        plannedByMonth,
        totalAmountMinor: sum(plannedByMonth),
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

function formatMatrixAmount(value: number) {
  if (value === 0) return "—";
  const absolute = Math.abs(assertMinorUnits(value));
  const integer = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  const sign = value < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(integer)},${cents}`;
}

export function AnnualBudgetForm({ year, context, currency, categories }: {
  year: number;
  context: FinancialContext;
  currency: SupportedCurrency;
  categories: AnnualBudgetCategory[];
}) {
  const [state, formAction, pending] = useActionState(saveAnnualBudgets, initialState);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const hierarchy = buildBudgetHierarchy(categories);

  function toggleCategory(key: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="currency" value={currency} />
      {state.status === "error" && state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <p className="text-xs text-slate-500">
        Receitas aparecem primeiro. Os totais consolidados usam {currency} sem repetir o símbolo em cada célula.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1410px] table-fixed border-collapse text-xs tabular-nums">
          <caption className="sr-only">Orçamento anual por categoria e subcategoria</caption>
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              <th className="w-64 border-b border-r border-slate-200 px-3 py-2 text-left">Categoria / subcategoria</th>
              {MONTHS.map((month) => <th key={month} className="w-[82px] border-b border-slate-200 px-1 py-2 text-center">{month}</th>)}
              <th className="w-24 border-b border-l border-slate-200 bg-slate-200 px-2 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {hierarchy.flatMap((node, index) => {
              const previous = hierarchy[index - 1];
              const showSection = !previous || previous.category.kind !== node.category.kind;
              const expanded = expandedCategories.has(node.key);
              const hasChildren = node.children.length > 0;
              const rows: React.ReactNode[] = [];
              if (showSection) {
                rows.push(
                  <tr key={`section:${node.category.kind}`}>
                    <th colSpan={14} className="border-y border-slate-300 bg-slate-800 px-3 py-2 text-left text-xs font-black uppercase tracking-[0.14em] text-white">
                      {node.category.kind === "income" ? "Receitas" : "Despesas"}
                    </th>
                  </tr>,
                );
              }
              if (!hasChildren) {
                rows.push(<BudgetInputRow key={node.key} category={node.category} year={year} />);
                return rows;
              }
              rows.push(
                <tr key={node.key} className="border-b border-slate-100 bg-emerald-50/50 font-semibold hover:bg-emerald-50">
                  <th scope="row" className="border-r border-slate-200 px-3 py-1 text-left">
                    <button type="button" aria-expanded={expanded} onClick={() => toggleCategory(node.key)} className="inline-flex min-h-7 items-center gap-2 rounded px-1 focus:outline-none focus:ring-2 focus:ring-emerald-600">
                      <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                      {node.category.name}
                    </button>
                  </th>
                  {node.plannedByMonth.map((value, monthIndex) => <td key={MONTHS[monthIndex]} className="px-1 py-1 text-center">{formatMatrixAmount(value)}</td>)}
                  <td className="border-l border-slate-200 bg-emerald-100/70 px-2 py-1 text-center font-bold">{formatMatrixAmount(node.totalAmountMinor)}</td>
                </tr>,
              );
              rows.push(
                <BudgetInputRow key={`${node.key}:direct`} category={node.category} year={year} label="Sem subcategoria" hidden={!expanded} />,
                ...node.children.map((category) => <BudgetInputRow key={`${node.key}:${category.id}`} category={category} year={year} hidden={!expanded} />),
              );
              return rows;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end"><SubmitButton pending={pending}>Salvar orçamento anual</SubmitButton></div>
    </form>
  );
}

function BudgetInputRow({ category, year, label, hidden = false }: {
  category: AnnualBudgetCategory;
  year: number;
  label?: string;
  hidden?: boolean;
}) {
  return (
    <tr className={`${hidden ? "hidden " : ""}border-b border-slate-100 hover:bg-amber-50/40`}>
      <th scope="row" className={`${label ? "pl-10 " : "pl-3 "}border-r border-slate-200 py-1 pr-3 text-left font-medium text-slate-700`}>{label ?? category.name}</th>
      {MONTHS.map((month, monthIndex) => {
        const referenceMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
        return (
          <td key={month} className="px-1 py-1">
            <input type="hidden" name="budgetCell" value={`${category.id}|${referenceMonth}`} />
            <input name="plannedAmountMinor" inputMode="decimal" defaultValue={minorUnitsToInput(category.plannedByMonth[monthIndex] ?? 0)} aria-label={`${category.name}, ${month} de ${year}`} className="h-8 w-full rounded border border-transparent bg-transparent px-1 text-center tabular-nums text-slate-800 hover:border-slate-300 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </td>
        );
      })}
      <td className="border-l border-slate-200 bg-slate-50 px-2 py-1 text-center font-semibold text-slate-700">{formatMatrixAmount(sum(category.plannedByMonth))}</td>
    </tr>
  );
}
