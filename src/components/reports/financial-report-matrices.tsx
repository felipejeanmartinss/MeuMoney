"use client";

import { useState } from "react";
import {
  calculateVariationBasisPoints,
  type MonthlyReportMatrixRow,
  type PeriodComparisonRow,
} from "@/domain/financial-reports";
import {
  INVESTMENT_CLASS_LABELS,
  INVESTMENT_TYPE_LABELS,
  type InvestmentPerformance,
} from "@/domain/investments";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { assertMinorUnits } from "@/domain/money";
import type {
  InvestmentClass,
  InvestmentPositionPerformanceSummary,
  SupportedCurrency,
} from "@/types/database";

const MONTHS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

function amount(value: number, currency: SupportedCurrency) {
  if (value === 0) return "—";
  const absolute = Math.abs(assertMinorUnits(value));
  const integer = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");
  const sign = value < 0 ? "-" : "";
  const locale = CURRENCY_LOCALES[currency];
  const decimalSeparator =
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1 })
      .formatToParts(0)
      .find((part) => part.type === "decimal")?.value ?? ",";
  return `${sign}${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(integer)}${decimalSeparator}${cents}`;
}

function signedAmount(value: number, currency: SupportedCurrency) {
  const color =
    value < 0
      ? "text-rose-700"
      : value > 0
        ? "text-emerald-700"
        : "text-slate-400";
  return <span className={color}>{amount(value, currency)}</span>;
}

function basisPoints(value: number | null) {
  if (value === null) return "—";
  return (
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100) + "%"
  );
}

type MonthlyCategoryNode = {
  key: string;
  label: string;
  rows: MonthlyReportMatrixRow[];
  monthAmountsMinor: number[];
  totalAmountMinor: number;
  expandable: boolean;
};

type MonthlyGroupNode = {
  label: string;
  categories: MonthlyCategoryNode[];
  monthAmountsMinor: number[];
  totalAmountMinor: number;
};

function compareAmount(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function groupMonthlyRows(rows: readonly MonthlyReportMatrixRow[]) {
  const sectionRows = new Map<
    MonthlyReportMatrixRow["section"],
    Map<string, Map<string, MonthlyReportMatrixRow[]>>
  >();
  for (const row of rows) {
    const groups = sectionRows.get(row.section) ?? new Map();
    const categories = groups.get(row.groupLabel) ?? new Map();
    const categoryRows = categories.get(row.categoryKey) ?? [];
    categoryRows.push(row);
    categories.set(row.categoryKey, categoryRows);
    groups.set(row.groupLabel, categories);
    sectionRows.set(row.section, groups);
  }

  return new Map(
    [...sectionRows.entries()].map(([section, groups]) => [
      section,
      [...groups.entries()]
        .map(([groupLabel, categoryRows]): MonthlyGroupNode => {
          const categories = [...categoryRows.entries()]
            .map(([categoryKey, childRows]): MonthlyCategoryNode => {
              const monthAmountsMinor = sumMonths(childRows);
              return {
                key: `${section}:${groupLabel}:${categoryKey}`,
                label: childRows[0].categoryLabel,
                rows: [...childRows].sort(
                  (left, right) =>
                    compareAmount(
                      left.totalAmountMinor,
                      right.totalAmountMinor,
                    ) || left.label.localeCompare(right.label, "pt-BR"),
                ),
                monthAmountsMinor,
                totalAmountMinor: sumMoney(monthAmountsMinor),
                expandable: true,
              };
            })
            .sort(
              (left, right) =>
                compareAmount(left.totalAmountMinor, right.totalAmountMinor) ||
                left.label.localeCompare(right.label, "pt-BR"),
            );
          const monthAmountsMinor = sumMonths(
            categories.flatMap((category) => category.rows),
          );
          return {
            label: groupLabel,
            categories,
            monthAmountsMinor,
            totalAmountMinor: sumMoney(monthAmountsMinor),
          };
        })
        .sort(
          (left, right) =>
            compareAmount(left.totalAmountMinor, right.totalAmountMinor) ||
            left.label.localeCompare(right.label, "pt-BR"),
        ),
    ]),
  );
}

function sumMonths(rows: readonly MonthlyReportMatrixRow[]) {
  return Array.from({ length: 12 }, (_, index) =>
    rows.reduce(
      (total, row) =>
        assertMinorUnits(total + row.monthAmountsMinor[index]),
      0,
    ),
  );
}

function sumMoney(values: readonly number[]) {
  return values.reduce(
    (total, value) => assertMinorUnits(total + value),
    0,
  );
}

export function MonthlyFinancialMatrix({
  rows,
  currency,
  caption,
  emptyMessage,
  showSections = true,
}: {
  rows: readonly MonthlyReportMatrixRow[];
  currency: SupportedCurrency;
  caption: string;
  emptyMessage: string;
  showSections?: boolean;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  if (rows.length === 0) {
    return (
      <p className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  const sections = groupMonthlyRows(rows);
  const incomeMonths = sumMonths(
    rows.filter((row) => row.section === "income"),
  );
  const expenseMonths = sumMonths(
    rows.filter((row) => row.section === "expense"),
  );
  function toggleCategory(key: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return (
    <div>
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Valores em {currency}, sem símbolo monetário. Categorias com seta podem
        ser abertas para exibir as subcategorias.
      </p>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-[0.75rem] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-slate-100 text-slate-700">
          <tr className="border-b border-slate-300">
            <th
              scope="col"
              className="min-w-64 px-3 py-2 text-left font-extrabold"
            >
              Categoria / subcategoria
            </th>
            {MONTHS.map((month) => (
              <th
                key={month}
                scope="col"
                className="min-w-24 px-2 py-2 text-center font-extrabold"
              >
                {month}
              </th>
            ))}
            <th
              scope="col"
              className="min-w-28 bg-slate-200 px-3 py-2 text-center font-black"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {[...sections.entries()].map(([section, groups]) => {
            const sectionRows = groups.flatMap((group) =>
              group.categories.flatMap((category) => category.rows),
            );
            return (
              <ReportSectionRows
                key={section}
                section={section}
                groups={groups}
                currency={currency}
                sectionMonths={sumMonths(sectionRows)}
                showSection={showSections}
                expandedCategories={expandedCategories}
                onToggleCategory={toggleCategory}
              />
            );
          })}
          {showSections ? (
            <MonthlyResultRow
              incomeMonths={incomeMonths}
              expenseMonths={expenseMonths}
              currency={currency}
            />
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function MonthlyResultRow({
  incomeMonths,
  expenseMonths,
  currency,
}: {
  incomeMonths: number[];
  expenseMonths: number[];
  currency: SupportedCurrency;
}) {
  const results = incomeMonths.map((income, index) =>
    assertMinorUnits(income - expenseMonths[index]),
  );
  return (
    <tr className="border-y-2 border-slate-400 bg-slate-900 font-black text-white">
      <th scope="row" className="px-3 py-2 text-left">
        Resultado
      </th>
      {results.map((value, index) => (
        <td key={MONTHS[index]} className="px-2 py-2 text-center">
          {amount(value, currency)}
        </td>
      ))}
      <td className="bg-slate-800 px-3 py-2 text-center">
        {amount(sumMoney(results), currency)}
      </td>
    </tr>
  );
}

function ReportSectionRows({
  section,
  groups,
  currency,
  sectionMonths,
  showSection,
  expandedCategories,
  onToggleCategory,
}: {
  section: MonthlyReportMatrixRow["section"];
  groups: MonthlyGroupNode[];
  currency: SupportedCurrency;
  sectionMonths: number[];
  showSection: boolean;
  expandedCategories: ReadonlySet<string>;
  onToggleCategory: (key: string) => void;
}) {
  const label = section === "income" ? "Receitas" : "Despesas";
  return (
    <>
      {showSection ? (
        <tr className="border-b border-slate-300 bg-slate-800 text-white">
          <th
            colSpan={14}
            className="px-3 py-2 text-left text-xs font-black uppercase tracking-[0.14em]"
          >
            {label}
          </th>
        </tr>
      ) : null}
      {groups.map((group) => (
        <ReportGroupRows
          key={[section, group.label].join(":")}
          group={group}
          currency={currency}
          expandedCategories={expandedCategories}
          onToggleCategory={onToggleCategory}
        />
      ))}
      <tr className="border-y border-slate-300 bg-slate-100 font-black text-slate-950">
        <th scope="row" className="px-3 py-2 text-left">
          Total {label.toLowerCase()}
        </th>
        {sectionMonths.map((value, index) => (
          <td key={MONTHS[index]} className="px-2 py-2 text-center">
            {amount(value, currency)}
          </td>
        ))}
        <td className="bg-slate-200 px-3 py-2 text-center">
          {amount(sumMoney(sectionMonths), currency)}
        </td>
      </tr>
    </>
  );
}

function ReportGroupRows({
  group,
  currency,
  expandedCategories,
  onToggleCategory,
}: {
  group: MonthlyGroupNode;
  currency: SupportedCurrency;
  expandedCategories: ReadonlySet<string>;
  onToggleCategory: (key: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-emerald-50 font-extrabold text-emerald-950">
        <th scope="row" className="px-3 py-1.5 text-left">
          {group.label}
        </th>
        {group.monthAmountsMinor.map((value, index) => (
          <td key={MONTHS[index]} className="px-2 py-1.5 text-center">
            {amount(value, currency)}
          </td>
        ))}
        <td className="bg-emerald-100 px-3 py-1.5 text-center">
          {amount(group.totalAmountMinor, currency)}
        </td>
      </tr>
      {group.categories.flatMap((category) => {
        const expanded = expandedCategories.has(category.key);
        const summaryRow = (
        <tr
          key={category.key}
          className="border-b border-slate-100 hover:bg-amber-50/60"
        >
          <th
            scope="row"
            className="px-3 py-1.5 text-left font-semibold text-slate-800"
          >
            {category.expandable ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => onToggleCategory(category.key)}
                className="inline-flex min-h-7 items-center gap-2 rounded px-1 text-left hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                {category.label}
              </button>
            ) : (
              category.label
            )}
          </th>
          {category.monthAmountsMinor.map((value, index) => (
            <td
              key={MONTHS[index]}
              className="px-2 py-1.5 text-center text-slate-700"
            >
              {amount(value, currency)}
            </td>
          ))}
          <td className="bg-slate-50 px-3 py-1.5 text-center font-bold text-slate-900">
            {amount(category.totalAmountMinor, currency)}
          </td>
        </tr>
        );
        if (!category.expandable || !expanded) return [summaryRow];
        const detailRows = category.rows.map((row) => (
          <tr
            key={`${category.key}:${row.rowId}`}
            className="border-b border-slate-100 bg-slate-50/60 text-slate-600"
          >
            <th scope="row" className="py-1 pl-10 pr-3 text-left font-medium">
              {row.subcategoryLabel ?? "Sem subcategoria"}
            </th>
            {row.monthAmountsMinor.map((value, index) => (
              <td key={MONTHS[index]} className="px-2 py-1 text-center">
                {amount(value, currency)}
              </td>
            ))}
            <td className="bg-slate-100/80 px-3 py-1 text-center font-semibold">
              {amount(row.totalAmountMinor, currency)}
            </td>
          </tr>
        ));
        return [summaryRow, ...detailRows];
      })}
    </>
  );
}

type ComparisonCategoryNode = {
  key: string;
  label: string;
  rows: PeriodComparisonRow[];
  firstAmountMinor: number;
  secondAmountMinor: number;
  differenceMinor: number;
  expandable: boolean;
};

type ComparisonGroupNode = {
  key: string;
  section: PeriodComparisonRow["section"];
  label: string;
  categories: ComparisonCategoryNode[];
  firstAmountMinor: number;
  secondAmountMinor: number;
  differenceMinor: number;
};

function groupComparisonRows(rows: readonly PeriodComparisonRow[]) {
  const groupedRows = new Map<
    string,
    Map<string, PeriodComparisonRow[]>
  >();
  for (const row of rows) {
    const key = [row.section, row.groupLabel].join(":");
    const categories = groupedRows.get(key) ?? new Map();
    const categoryRows = categories.get(row.categoryKey) ?? [];
    categoryRows.push(row);
    categories.set(row.categoryKey, categoryRows);
    groupedRows.set(key, categories);
  }
  return [...groupedRows.entries()]
    .map(([key, categoryRows]): ComparisonGroupNode => {
      const firstRow = [...categoryRows.values()][0][0];
      const categories = [...categoryRows.entries()]
        .map(([categoryKey, childRows]): ComparisonCategoryNode => {
          const firstAmountMinor = sumMoney(
            childRows.map((row) => row.firstAmountMinor),
          );
          const secondAmountMinor = sumMoney(
            childRows.map((row) => row.secondAmountMinor),
          );
          return {
            key: `${key}:${categoryKey}`,
            label: childRows[0].categoryLabel,
            rows: [...childRows].sort(
              (left, right) =>
                compareAmount(
                  left.secondAmountMinor,
                  right.secondAmountMinor,
                ) || left.label.localeCompare(right.label, "pt-BR"),
            ),
            firstAmountMinor,
            secondAmountMinor,
            differenceMinor: assertMinorUnits(
              secondAmountMinor - firstAmountMinor,
            ),
            expandable: true,
          };
        })
        .sort(
          (left, right) =>
            compareAmount(
              left.secondAmountMinor,
              right.secondAmountMinor,
            ) || left.label.localeCompare(right.label, "pt-BR"),
        );
      const firstAmountMinor = sumMoney(
        categories.map((category) => category.firstAmountMinor),
      );
      const secondAmountMinor = sumMoney(
        categories.map((category) => category.secondAmountMinor),
      );
      return {
        key,
        section: firstRow.section,
        label: firstRow.groupLabel,
        categories,
        firstAmountMinor,
        secondAmountMinor,
        differenceMinor: assertMinorUnits(
          secondAmountMinor - firstAmountMinor,
        ),
      };
    })
    .sort((left, right) => {
      if (left.section !== right.section) {
        return left.section === "income" ? -1 : 1;
      }
      return (
        compareAmount(left.secondAmountMinor, right.secondAmountMinor) ||
        left.label.localeCompare(right.label, "pt-BR")
      );
    });
}

export function PeriodComparisonMatrix({
  rows,
  currency,
  firstLabel,
  secondLabel,
}: {
  rows: readonly PeriodComparisonRow[];
  currency: SupportedCurrency;
  firstLabel: string;
  secondLabel: string;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  if (rows.length === 0) {
    return (
      <p className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Nenhum valor encontrado nos períodos selecionados.
      </p>
    );
  }
  const groups = groupComparisonRows(rows);
  function toggleCategory(key: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return (
    <div>
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Valores em {currency}, sem símbolo monetário. Categorias com seta podem
        ser abertas para exibir as subcategorias.
      </p>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm tabular-nums">
        <caption className="sr-only">
          Comparativo financeiro entre dois períodos
        </caption>
        <thead className="bg-slate-100 text-slate-700">
          <tr className="border-b border-slate-300">
            <th scope="col" className="px-3 py-2 text-left">
              Categoria / subcategoria
            </th>
            <th scope="col" className="px-3 py-2 text-center">
              {firstLabel}
            </th>
            <th scope="col" className="px-3 py-2 text-center">
              {secondLabel}
            </th>
            <th scope="col" className="px-3 py-2 text-center">
              Diferença
            </th>
            <th scope="col" className="px-3 py-2 text-center">
              Variação
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <ComparisonGroupRows
              key={group.key}
              group={group}
              currency={currency}
              expandedCategories={expandedCategories}
              onToggleCategory={toggleCategory}
            />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ComparisonGroupRows({
  group,
  currency,
  expandedCategories,
  onToggleCategory,
}: {
  group: ComparisonGroupNode;
  currency: SupportedCurrency;
  expandedCategories: ReadonlySet<string>;
  onToggleCategory: (key: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-emerald-50 font-extrabold text-emerald-950">
        <th scope="row" className="px-3 py-1.5 text-left">
          {group.section === "income" ? "Receitas" : "Despesas"} ·{" "}
          {group.label}
        </th>
        <td className="px-3 py-1.5 text-center">
          {amount(group.firstAmountMinor, currency)}
        </td>
        <td className="px-3 py-1.5 text-center">
          {amount(group.secondAmountMinor, currency)}
        </td>
        <td className="px-3 py-1.5 text-center">
          {signedAmount(group.differenceMinor, currency)}
        </td>
        <td className="px-3 py-1.5 text-center">
          {basisPoints(
            calculateVariationBasisPoints(
              group.secondAmountMinor,
              group.firstAmountMinor,
            ),
          )}
        </td>
      </tr>
      {group.categories.flatMap((category) => {
        const expanded = expandedCategories.has(category.key);
        const categoryRow = (
        <tr
          key={category.key}
          className="border-b border-slate-100 hover:bg-amber-50/60"
        >
          <th
            scope="row"
            className="px-3 py-1.5 text-left font-semibold text-slate-800"
          >
            {category.expandable ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => onToggleCategory(category.key)}
                className="inline-flex min-h-7 items-center gap-2 rounded px-1 text-left hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                {category.label}
              </button>
            ) : (
              category.label
            )}
          </th>
          <td className="px-3 py-1.5 text-center">
            {amount(category.firstAmountMinor, currency)}
          </td>
          <td className="px-3 py-1.5 text-center">
            {amount(category.secondAmountMinor, currency)}
          </td>
          <td className="px-3 py-1.5 text-center font-bold">
            {signedAmount(category.differenceMinor, currency)}
          </td>
          <td className="px-3 py-1.5 text-center">
            {basisPoints(
              calculateVariationBasisPoints(
                category.secondAmountMinor,
                category.firstAmountMinor,
              ),
            )}
          </td>
        </tr>
        );
        if (!category.expandable || !expanded) return [categoryRow];
        return [
          categoryRow,
          ...category.rows.map((row) => (
            <tr
              key={`${category.key}:${row.rowId}`}
              className="border-b border-slate-100 bg-slate-50/60 text-slate-600"
            >
              <th scope="row" className="py-1 pl-10 pr-3 text-left font-medium">
                {row.subcategoryLabel ?? "Sem subcategoria"}
              </th>
              <td className="px-3 py-1 text-center">
                {amount(row.firstAmountMinor, currency)}
              </td>
              <td className="px-3 py-1 text-center">
                {amount(row.secondAmountMinor, currency)}
              </td>
              <td className="px-3 py-1 text-center font-semibold">
                {signedAmount(row.differenceMinor, currency)}
              </td>
              <td className="px-3 py-1 text-center">
                {basisPoints(row.variationBasisPoints)}
              </td>
            </tr>
          )),
        ];
      })}
    </>
  );
}

export function AssetPerformanceMatrix({
  positions,
  performanceByClass,
  currency,
}: {
  positions: readonly InvestmentPositionPerformanceSummary[];
  performanceByClass: readonly (InvestmentPerformance & {
    investmentClass: InvestmentClass;
  })[];
  currency: SupportedCurrency;
}) {
  if (positions.length === 0) {
    return (
      <p className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Nenhuma posição encontrada para os filtros selecionados.
      </p>
    );
  }
  const groups = new Map<
    InvestmentPositionPerformanceSummary["investment_class"],
    InvestmentPositionPerformanceSummary[]
  >();
  for (const position of positions) {
    const group = groups.get(position.investment_class) ?? [];
    group.push(position);
    groups.set(position.investment_class, group);
  }
  const performanceByClassLookup = new Map(
    performanceByClass.map((performance) => [
      performance.investmentClass,
      performance,
    ]),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-[0.68rem] tabular-nums">
        <caption className="sr-only">
          Performance atual das posições de investimento
        </caption>
        <thead className="bg-slate-100 text-slate-700">
          <tr className="border-b border-slate-300">
            <th scope="col" className="min-w-56 px-2 py-1.5 text-left">
              Ativo
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Aportes
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Resgates
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Rendimentos
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Valor atual
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Custo acumulado
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Lucro/perda realizado
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Resultado
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Retorno total
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Retorno mensal
            </th>
            <th scope="col" className="px-2 py-1.5 text-right">
              Retorno anualizado
            </th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([investmentClass, rows]) => (
            <AssetGroupRows
              key={investmentClass}
              label={INVESTMENT_CLASS_LABELS[investmentClass]}
              rows={rows}
              performance={performanceByClassLookup.get(investmentClass) ?? null}
              currency={currency}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetGroupRows({
  label,
  rows,
  performance,
  currency,
}: {
  label: string;
  rows: readonly InvestmentPositionPerformanceSummary[];
  performance: InvestmentPerformance | null;
  currency: SupportedCurrency;
}) {
  const contributions = sumMoney(rows.map((row) => row.contributions_minor));
  const redemptions = sumMoney(rows.map((row) => row.redemptions_minor));
  const income = sumMoney(rows.map((row) => row.income_minor));
  const cost = sumMoney(rows.map((row) => row.accumulated_cost_minor));
  const current = sumMoney(rows.map((row) => row.current_value_minor));
  return (
    <>
      <tr className="border-b border-slate-200 bg-emerald-50 font-extrabold text-emerald-950">
        <th scope="row" className="px-2 py-1 text-left">
          {label}
        </th>
        <td className="px-2 py-1 text-right">
          {amount(contributions, currency)}
        </td>
        <td className="px-2 py-1 text-right">
          {amount(redemptions, currency)}
        </td>
        <td className="px-2 py-1 text-right">
          {amount(income, currency)}
        </td>
        <td className="px-2 py-1 text-right">
          {amount(current, currency)}
        </td>
        <td className="px-2 py-1 text-right">{amount(cost, currency)}</td>
        <td className="px-2 py-1 text-right">
          {performance?.realizedGainLossMinor === null || !performance
            ? "—"
            : signedAmount(performance.realizedGainLossMinor, currency)}
        </td>
        <td className="px-2 py-1 text-right">
          {performance
            ? signedAmount(performance.resultMinor, currency)
            : "—"}
          {performance?.resultIsEstimated ? (
            <span className="ml-0.5 text-amber-700">*</span>
          ) : null}
        </td>
        <td className="px-2 py-1 text-right">
          {basisPoints(performance?.totalReturnBasisPoints ?? null)}
        </td>
        <td className="px-2 py-1 text-right">
          {basisPoints(performance?.monthlyReturnBasisPoints ?? null)}
        </td>
        <td className="px-2 py-1 text-right">
          {basisPoints(performance?.annualizedReturnBasisPoints ?? null)}
        </td>
      </tr>
      {rows.map((row) => (
        <tr
          key={row.id}
          className="border-b border-slate-100 hover:bg-amber-50/60"
        >
          <th
            scope="row"
            className="max-w-72 truncate px-2 py-1 text-left font-medium text-slate-800"
          >
            {row.asset_name}
            <span className="ml-2 font-normal text-slate-500">
              {row.institution} · {INVESTMENT_TYPE_LABELS[row.investment_type]}
            </span>
          </th>
          <td className="px-2 py-1 text-right">
            {amount(row.contributions_minor, currency)}
          </td>
          <td className="px-2 py-1 text-right">
            {amount(row.redemptions_minor, currency)}
          </td>
          <td className="px-2 py-1 text-right">
            {amount(row.income_minor, currency)}
          </td>
          <td className="px-2 py-1 text-right font-bold">
            {amount(row.current_value_minor, currency)}
          </td>
          <td className="px-2 py-1 text-right">
            {amount(row.accumulated_cost_minor, currency)}
          </td>
          <td className="px-2 py-1 text-right">
            {row.realized_gain_loss_minor === null
              ? "—"
              : signedAmount(row.realized_gain_loss_minor, currency)}
          </td>
          <td className="px-2 py-1 text-right font-bold">
            {signedAmount(row.performance_result_minor, currency)}
            {row.performance_result_is_estimated ? (
              <span className="ml-0.5 text-amber-700">*</span>
            ) : null}
          </td>
          <td className="px-2 py-1 text-right">
            {basisPoints(row.total_return_basis_points)}
          </td>
          <td className="px-2 py-1 text-right">
            {basisPoints(row.monthly_return_basis_points)}
          </td>
          <td className="px-2 py-1 text-right">
            {basisPoints(row.annualized_return_basis_points)}
          </td>
        </tr>
      ))}
    </>
  );
}
