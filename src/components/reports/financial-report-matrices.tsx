import {
  calculateInvestmentReturnBasisPoints,
  calculateVariationBasisPoints,
  type MonthlyReportMatrixRow,
  type PeriodComparisonRow,
} from "@/domain/financial-reports";
import {
  INVESTMENT_CLASS_LABELS,
  INVESTMENT_TYPE_LABELS,
} from "@/domain/investments";
import { assertMinorUnits, formatMoney } from "@/domain/money";
import type {
  InvestmentPositionSummary,
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
  return value === 0 ? "—" : formatMoney(value, currency);
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

function groupMonthlyRows(rows: readonly MonthlyReportMatrixRow[]) {
  const sections = new Map<
    MonthlyReportMatrixRow["section"],
    Map<string, MonthlyReportMatrixRow[]>
  >();
  for (const row of rows) {
    const groups = sections.get(row.section) ?? new Map();
    const group = groups.get(row.groupLabel) ?? [];
    group.push(row);
    groups.set(row.groupLabel, group);
    sections.set(row.section, groups);
  }
  return sections;
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
  return (
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
                className="min-w-24 px-2 py-2 text-right font-extrabold"
              >
                {month}
              </th>
            ))}
            <th
              scope="col"
              className="min-w-28 bg-slate-200 px-3 py-2 text-right font-black"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {[...sections.entries()].map(([section, groups]) => {
            const sectionRows = [...groups.values()].flat();
            return (
              <ReportSectionRows
                key={section}
                section={section}
                groups={groups}
                currency={currency}
                sectionMonths={sumMonths(sectionRows)}
                showSection={showSections}
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
        <td key={MONTHS[index]} className="px-2 py-2 text-right">
          {amount(value, currency)}
        </td>
      ))}
      <td className="bg-slate-800 px-3 py-2 text-right">
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
}: {
  section: MonthlyReportMatrixRow["section"];
  groups: Map<string, MonthlyReportMatrixRow[]>;
  currency: SupportedCurrency;
  sectionMonths: number[];
  showSection: boolean;
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
      {[...groups.entries()].map(([groupLabel, rows]) => (
        <ReportGroupRows
          key={[section, groupLabel].join(":")}
          groupLabel={groupLabel}
          rows={rows}
          totals={sumMonths(rows)}
          currency={currency}
        />
      ))}
      <tr className="border-y border-slate-300 bg-slate-100 font-black text-slate-950">
        <th scope="row" className="px-3 py-2 text-left">
          Total {label.toLowerCase()}
        </th>
        {sectionMonths.map((value, index) => (
          <td key={MONTHS[index]} className="px-2 py-2 text-right">
            {amount(value, currency)}
          </td>
        ))}
        <td className="bg-slate-200 px-3 py-2 text-right">
          {amount(sumMoney(sectionMonths), currency)}
        </td>
      </tr>
    </>
  );
}

function ReportGroupRows({
  groupLabel,
  rows,
  totals,
  currency,
}: {
  groupLabel: string;
  rows: readonly MonthlyReportMatrixRow[];
  totals: number[];
  currency: SupportedCurrency;
}) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-emerald-50 font-extrabold text-emerald-950">
        <th scope="row" className="px-3 py-1.5 text-left">
          {groupLabel}
        </th>
        {totals.map((value, index) => (
          <td key={MONTHS[index]} className="px-2 py-1.5 text-right">
            {amount(value, currency)}
          </td>
        ))}
        <td className="bg-emerald-100 px-3 py-1.5 text-right">
          {amount(sumMoney(totals), currency)}
        </td>
      </tr>
      {rows.map((row) => (
        <tr
          key={row.rowId}
          className="border-b border-slate-100 hover:bg-amber-50/60"
        >
          <th
            scope="row"
            className="px-3 py-1.5 text-left font-medium text-slate-700"
          >
            {row.label}
          </th>
          {row.monthAmountsMinor.map((value, index) => (
            <td
              key={MONTHS[index]}
              className="px-2 py-1.5 text-right text-slate-700"
            >
              {amount(value, currency)}
            </td>
          ))}
          <td className="bg-slate-50 px-3 py-1.5 text-right font-bold text-slate-900">
            {amount(row.totalAmountMinor, currency)}
          </td>
        </tr>
      ))}
    </>
  );
}

function groupComparisonRows(rows: readonly PeriodComparisonRow[]) {
  const result = new Map<string, PeriodComparisonRow[]>();
  for (const row of rows) {
    const key = [row.section, row.groupLabel].join(":");
    const group = result.get(key) ?? [];
    group.push(row);
    result.set(key, group);
  }
  return result;
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
  if (rows.length === 0) {
    return (
      <p className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Nenhum valor encontrado nos períodos selecionados.
      </p>
    );
  }
  const groups = groupComparisonRows(rows);
  return (
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
            <th scope="col" className="px-3 py-2 text-right">
              {firstLabel}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              {secondLabel}
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Diferença
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Variação
            </th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([key, groupRows]) => {
            const first = sumMoney(
              groupRows.map((row) => row.firstAmountMinor),
            );
            const second = sumMoney(
              groupRows.map((row) => row.secondAmountMinor),
            );
            return (
              <ComparisonGroupRows
                key={key}
                rows={groupRows}
                first={first}
                second={second}
                difference={assertMinorUnits(second - first)}
                currency={currency}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonGroupRows({
  rows,
  first,
  second,
  difference,
  currency,
}: {
  rows: readonly PeriodComparisonRow[];
  first: number;
  second: number;
  difference: number;
  currency: SupportedCurrency;
}) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-emerald-50 font-extrabold text-emerald-950">
        <th scope="row" className="px-3 py-1.5 text-left">
          {rows[0].section === "income" ? "Receitas" : "Despesas"} ·{" "}
          {rows[0].groupLabel}
        </th>
        <td className="px-3 py-1.5 text-right">
          {amount(first, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">
          {amount(second, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">
          {signedAmount(difference, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">
          {basisPoints(calculateVariationBasisPoints(second, first))}
        </td>
      </tr>
      {rows.map((row) => (
        <tr
          key={row.rowId}
          className="border-b border-slate-100 hover:bg-amber-50/60"
        >
          <th
            scope="row"
            className="px-3 py-1.5 text-left font-medium text-slate-700"
          >
            {row.label}
          </th>
          <td className="px-3 py-1.5 text-right">
            {amount(row.firstAmountMinor, currency)}
          </td>
          <td className="px-3 py-1.5 text-right">
            {amount(row.secondAmountMinor, currency)}
          </td>
          <td className="px-3 py-1.5 text-right font-bold">
            {signedAmount(row.differenceMinor, currency)}
          </td>
          <td className="px-3 py-1.5 text-right">
            {basisPoints(row.variationBasisPoints)}
          </td>
        </tr>
      ))}
    </>
  );
}

export function AssetPerformanceMatrix({
  positions,
  currency,
}: {
  positions: readonly InvestmentPositionSummary[];
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
    InvestmentPositionSummary["investment_class"],
    InvestmentPositionSummary[]
  >();
  for (const position of positions) {
    const group = groups.get(position.investment_class) ?? [];
    group.push(position);
    groups.set(position.investment_class, group);
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-[0.78rem] tabular-nums">
        <caption className="sr-only">
          Performance atual das posições de investimento
        </caption>
        <thead className="bg-slate-100 text-slate-700">
          <tr className="border-b border-slate-300">
            <th scope="col" className="min-w-64 px-3 py-2 text-left">
              Ativo
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Aportes
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Resgates
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Rendimentos
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Custo atual
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Valor atual
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Resultado
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Retorno
            </th>
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([investmentClass, rows]) => (
            <AssetGroupRows
              key={investmentClass}
              label={INVESTMENT_CLASS_LABELS[investmentClass]}
              rows={rows}
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
  currency,
}: {
  label: string;
  rows: readonly InvestmentPositionSummary[];
  currency: SupportedCurrency;
}) {
  const contributions = sumMoney(rows.map((row) => row.contributions_minor));
  const redemptions = sumMoney(rows.map((row) => row.redemptions_minor));
  const income = sumMoney(rows.map((row) => row.income_minor));
  const cost = sumMoney(rows.map((row) => row.accumulated_cost_minor));
  const current = sumMoney(rows.map((row) => row.current_value_minor));
  const complete = rows.every((row) => row.total_result_minor !== null);
  const result = complete
    ? sumMoney(rows.map((row) => row.total_result_minor ?? 0))
    : null;
  const returnRate =
    result === null
      ? null
      : calculateInvestmentReturnBasisPoints(result, contributions);
  return (
    <>
      <tr className="border-b border-slate-200 bg-emerald-50 font-extrabold text-emerald-950">
        <th scope="row" className="px-3 py-1.5 text-left">
          {label}
        </th>
        <td className="px-3 py-1.5 text-right">
          {amount(contributions, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">
          {amount(redemptions, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">
          {amount(income, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">{amount(cost, currency)}</td>
        <td className="px-3 py-1.5 text-right">
          {amount(current, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">
          {result === null
            ? "Histórico parcial"
            : signedAmount(result, currency)}
        </td>
        <td className="px-3 py-1.5 text-right">
          {basisPoints(returnRate)}
        </td>
      </tr>
      {rows.map((row) => {
        const rate =
          row.total_result_minor === null
            ? null
            : calculateInvestmentReturnBasisPoints(
                row.total_result_minor,
                row.contributions_minor,
              );
        return (
          <tr
            key={row.id}
            className="border-b border-slate-100 hover:bg-amber-50/60"
          >
            <th
              scope="row"
              className="px-3 py-1.5 text-left font-medium text-slate-800"
            >
              {row.asset_name}
              <span className="ml-2 font-normal text-slate-500">
                {row.institution} ·{" "}
                {INVESTMENT_TYPE_LABELS[row.investment_type]}
              </span>
            </th>
            <td className="px-3 py-1.5 text-right">
              {amount(row.contributions_minor, currency)}
            </td>
            <td className="px-3 py-1.5 text-right">
              {amount(row.redemptions_minor, currency)}
            </td>
            <td className="px-3 py-1.5 text-right">
              {amount(row.income_minor, currency)}
            </td>
            <td className="px-3 py-1.5 text-right">
              {amount(row.accumulated_cost_minor, currency)}
            </td>
            <td className="px-3 py-1.5 text-right font-bold">
              {amount(row.current_value_minor, currency)}
            </td>
            <td className="px-3 py-1.5 text-right font-bold">
              {row.total_result_minor === null
                ? "—"
                : signedAmount(row.total_result_minor, currency)}
            </td>
            <td className="px-3 py-1.5 text-right">
              {basisPoints(rate)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
