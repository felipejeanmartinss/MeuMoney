"use client";

import { useActionState, useState } from "react";
import { saveMonthlyBudgets, type BudgetFormState } from "@/app/actions/budgets";
import { allocateBudgetGroupByAmount, allocateBudgetGroupByPercent } from "@/domain/budget-allocations";
import { assertMinorUnits, minorUnitsToInput, parseMoneyInputToMinor } from "@/domain/money";
import type { CategoryKind, FinancialContext, MonthlyBudgetProgress, SupportedCurrency } from "@/types/database";
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
  return left > right ? -1 : 1;
}

function formatBudgetAmount(value: number) {
  if (value === 0) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Math.round(value / 100),
  );
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

export function MonthlyBudgetForm({ referenceMonth, context, currency, categories, incomeBaseMinor, progress }: {
  referenceMonth: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  categories: BudgetCategory[];
  incomeBaseMinor: number;
  progress: MonthlyBudgetProgress[];
}) {
  const [state, formAction, pending] = useActionState(saveMonthlyBudgets, initialState);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(categories.map((category) => [category.id, minorUnitsToInput(category.plannedAmountMinor)])));
  const hierarchy = buildHierarchy(categories);
  const expenseGroups = hierarchy.filter((node) => node.category.kind === "expense");
  const progressById = new Map(progress.map((row) => [row.category_id, row]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const incomeRows = categories.filter((category) => category.kind === "income").sort((left, right) =>
    (progressById.get(right.id)?.realized_amount_minor ?? 0) - (progressById.get(left.id)?.realized_amount_minor ?? 0));
  const expenseRows = categories.filter((category) => category.kind === "expense").sort((left, right) =>
    (progressById.get(right.id)?.realized_amount_minor ?? 0) - (progressById.get(left.id)?.realized_amount_minor ?? 0));
  const amountFor = (id: string, source = amounts) => {
    try { return Math.max(0, parseMoneyInputToMinor(source[id] ?? "0")); }
    catch { return 0; }
  };
  const plannedIncomeMinor = categories.filter((category) => category.kind === "income").reduce((sum, category) => sum + amountFor(category.id), 0);
  const incomeReferenceMinor = plannedIncomeMinor || incomeBaseMinor;
  const groupAmount = (node: BudgetCategoryNode) => [node.category, ...node.children].reduce((sum, category) => sum + amountFor(category.id), 0);
  const allocatedMinor = expenseGroups.reduce((sum, node) => sum + groupAmount(node), 0);
  const allocatedPercent = incomeReferenceMinor > 0 ? Math.round(allocatedMinor / incomeReferenceMinor * 100) : 0;

  function setGroupPercent(node: BudgetCategoryNode, percent: number) {
    const rows = [node.category, ...node.children];
    setAmounts((current) => {
      const next = { ...current };
      const allocation = allocateBudgetGroupByPercent(incomeReferenceMinor, percent, rows.map((row) => ({ id: row.id, plannedAmountMinor: amountFor(row.id, current) })));
      for (const row of rows) next[row.id] = minorUnitsToInput(allocation[row.id]);
      return next;
    });
  }

  function setGroupAmount(node: BudgetCategoryNode, amount: string) {
    try {
      const targetMinor = parseMoneyInputToMinor(amount);
      if (targetMinor < 0) return;
      const rows = [node.category, ...node.children];
      setAmounts((current) => {
        const allocation = allocateBudgetGroupByAmount(targetMinor, rows.map((row) => ({ id: row.id, plannedAmountMinor: amountFor(row.id, current) })));
        return { ...current, ...Object.fromEntries(rows.map((row) => [row.id, minorUnitsToInput(allocation[row.id])])) };
      });
    } catch { /* Keep the previous valid value. */ }
  }

  function toggleCategory(key: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="referenceMonth" value={referenceMonth} />
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="currency" value={currency} />
      {state.status === "error" && state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="grid items-start gap-3 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200" aria-label="Receitas planejadas">
          <h3 className="bg-slate-800 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">Receitas</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-xs">
              <caption className="sr-only">Orçamento versus realizado de receitas; edite o valor planejado na linha</caption>
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-2 py-2 text-left">Categoria</th><th className="px-2 py-2 text-right">Planejado</th><th className="px-2 py-2 text-right">Realizado</th><th className="px-2 py-2 text-right">Diferença</th></tr></thead>
              <tbody>{incomeRows.map((category) => {
                const realized = progressById.get(category.id)?.realized_amount_minor ?? 0;
                const planned = amountFor(category.id);
                const label = category.parentId && categoryById.has(category.parentId)
                  ? `${categoryById.get(category.parentId)?.name} › ${category.name}` : category.name;
                return <tr key={category.id} className="border-t border-slate-100">
                  <th scope="row" className="px-2 py-2 text-left font-semibold text-slate-800">{label}</th>
                  <td className="px-2 py-1 text-right"><input type="hidden" name="categoryId" value={category.id} /><input name="plannedAmountMinor" inputMode="decimal" value={amounts[category.id] ?? "0,00"} onChange={(event) => setAmounts((current) => ({ ...current, [category.id]: event.target.value }))} aria-label={`Planejado para ${label}`} className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right tabular-nums focus:border-emerald-700" /></td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBudgetAmount(realized)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${realized - planned < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatBudgetAmount(realized - planned)}</td>
                </tr>;
              })}</tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold"><tr><th className="px-2 py-2 text-left">Total</th><td className="px-2 py-2 text-right">{formatBudgetAmount(plannedIncomeMinor)}</td><td className="px-2 py-2 text-right">{formatBudgetAmount(incomeRows.reduce((sum, category) => sum + (progressById.get(category.id)?.realized_amount_minor ?? 0), 0))}</td><td className="px-2 py-2 text-right">{formatBudgetAmount(incomeRows.reduce((sum, category) => sum + (progressById.get(category.id)?.realized_amount_minor ?? 0), 0) - plannedIncomeMinor)}</td></tr></tfoot>
            </table>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200" aria-label="Despesas planejadas">
          <h3 className="bg-slate-800 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">Despesas</h3>
          <div className="border-b border-emerald-100 bg-emerald-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>Base: {minorUnitsToInput(incomeReferenceMinor)} {currency} · {plannedIncomeMinor > 0 ? "planejada" : "realizada"}</span>
              <strong className={allocatedPercent > 100 ? "text-rose-700" : "text-emerald-800"}>{allocatedPercent}% alocado</strong>
            </div>
            {incomeReferenceMinor > 0 ? <div className="mt-3 grid gap-3 sm:grid-cols-[4.5rem_1fr] sm:items-center">
              <div className="grid size-16 place-items-center rounded-full" style={{ background: `conic-gradient(#047857 ${Math.min(100, allocatedPercent)}%, #e2e8f0 0)` }}>
                <span className="grid size-11 place-items-center rounded-full bg-white text-xs font-black tabular-nums">{allocatedPercent}%</span>
              </div>
              <div className="grid gap-1.5">
                {expenseGroups.map((node) => {
                  const percent = Math.round(groupAmount(node) / incomeReferenceMinor * 100);
                  return <div key={node.key} className="grid grid-cols-[minmax(5rem,1fr)_minmax(4rem,1.2fr)_3.8rem_5.6rem] items-center gap-2 text-xs">
                    <span className="truncate font-semibold text-slate-700" title={node.category.name}>{node.category.name}</span>
                    <input type="range" min={0} max={100} value={Math.min(100, percent)} onChange={(event) => setGroupPercent(node, Number(event.target.value))} aria-label={`Percentual da receita para ${node.category.name}`} className="w-full accent-emerald-700" />
                    <label className="flex items-center gap-0.5"><input key={`${node.key}:${percent}`} type="number" min={0} max={100} step={1} defaultValue={percent} onBlur={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 100) setGroupPercent(node, value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} aria-label={`Digitar percentual para ${node.category.name}`} className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-right tabular-nums" /><span>%</span></label>
                    <input key={`${node.key}:${groupAmount(node)}`} defaultValue={minorUnitsToInput(groupAmount(node))} onBlur={(event) => setGroupAmount(node, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} inputMode="decimal" aria-label={`Digitar valor para ${node.category.name}`} className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-right tabular-nums" />
                  </div>;
                })}
              </div>
            </div> : <p className="mt-2 text-xs text-amber-800">Planeje uma receita para distribuir por percentual.</p>}
          </div>
          <details className="border-t border-slate-200"><summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">Editar detalhes das despesas</summary>{renderGroups(expenseGroups)}</details>
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full min-w-[30rem] text-xs">
              <caption className="sr-only">Orçamento versus realizado de despesas</caption>
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-2 py-2 text-left">Orçamento versus realizado</th><th className="px-2 py-2 text-right">Planejado</th><th className="px-2 py-2 text-right">Realizado</th><th className="px-2 py-2 text-right">Diferença</th></tr></thead>
              <tbody>{expenseRows.map((category) => {
                const realized = progressById.get(category.id)?.realized_amount_minor ?? 0;
                const planned = amountFor(category.id);
                const label = category.parentId && categoryById.has(category.parentId)
                  ? `${categoryById.get(category.parentId)?.name} › ${category.name}` : category.name;
                return <tr key={category.id} className="border-t border-slate-100"><th scope="row" className="px-2 py-2 text-left font-semibold text-slate-800">{label}</th><td className="px-2 py-2 text-right tabular-nums">{formatBudgetAmount(planned)}</td><td className="px-2 py-2 text-right tabular-nums">{formatBudgetAmount(realized)}</td><td className={`px-2 py-2 text-right tabular-nums ${planned - realized < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatBudgetAmount(planned - realized)}</td></tr>;
              })}</tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold"><tr><th className="px-2 py-2 text-left">Total</th><td className="px-2 py-2 text-right">{formatBudgetAmount(allocatedMinor)}</td><td className="px-2 py-2 text-right">{formatBudgetAmount(expenseRows.reduce((sum, category) => sum + (progressById.get(category.id)?.realized_amount_minor ?? 0), 0))}</td><td className="px-2 py-2 text-right">{formatBudgetAmount(allocatedMinor - expenseRows.reduce((sum, category) => sum + (progressById.get(category.id)?.realized_amount_minor ?? 0), 0))}</td></tr></tfoot>
            </table>
          </div>
        </section>
      </div>
      <div className="flex justify-end"><SubmitButton pending={pending}>Salvar orçamento</SubmitButton></div>
    </form>
  );

  function renderGroups(nodes: BudgetCategoryNode[]) {
    return nodes.map((node) => {
          const expanded = expandedCategories.has(node.key);
          return (
            <div key={node.key}>
              <button type="button" aria-expanded={expanded} onClick={() => toggleCategory(node.key)} className="flex min-h-9 w-full items-center justify-between gap-3 border-b border-slate-100 px-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600">
                <span><span aria-hidden="true" className="mr-2">{expanded ? "▾" : "▸"}</span>{node.category.name}</span>
                <span className="tabular-nums text-slate-600">{formatBudgetAmount(groupAmount(node))}</span>
              </button>
              <div className={expanded ? "block" : "hidden"}>
                <BudgetInput category={node.category} label="Sem subcategoria" nested value={amounts[node.category.id] ?? "0,00"} onChange={(value) => setAmounts((current) => ({ ...current, [node.category.id]: value }))} />
                {node.children.map((category) => <BudgetInput key={category.id} category={category} nested value={amounts[category.id] ?? "0,00"} onChange={(value) => setAmounts((current) => ({ ...current, [category.id]: value }))} />)}
              </div>
            </div>
          );
        });
  }
}

function BudgetInput({ category, label, nested = false, value, onChange }: {
  category: BudgetCategory;
  label?: string;
  nested?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`grid gap-2 border-b border-slate-100 py-2 pr-3 last:border-0 hover:bg-slate-50 sm:grid-cols-[1fr_11rem] sm:items-center ${nested ? "pl-10" : "pl-3"}`}>
      <span className="min-w-0 truncate font-semibold text-slate-900">{label ?? category.name}</span>
      <span className="grid gap-1 text-sm text-slate-600">
        <input type="hidden" name="categoryId" value={category.id} />
        <input name="plannedAmountMinor" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className={inputClass()} aria-label={`Valor planejado para ${category.name}`} />
      </span>
    </label>
  );
}
