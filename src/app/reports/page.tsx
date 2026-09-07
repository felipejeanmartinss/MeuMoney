import Link from "next/link";
import {
  AssetPerformanceMatrix,
  MonthlyFinancialMatrix,
  PeriodComparisonMatrix,
} from "@/components/reports/financial-report-matrices";
import {
  FINANCIAL_REPORT_LABELS,
  financialReportFilterSchema,
  financialReportTypeSchema,
  periodComparisonFilterSchema,
  reportBasisDescription,
  reportContextSchema,
  reportPositionStateSchema,
  summarizeIncomeExpenseReport,
  type FinancialReportType,
} from "@/domain/financial-reports";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import { getCurrentProfile } from "@/services/auth/server-auth";
import {
  getCurrentUserAssetPerformanceReport,
  getCurrentUserFixedExpenseReport,
  getCurrentUserIncomeExpenseMatrix,
  getCurrentUserPeriodComparisonReport,
} from "@/services/reports/financial-reports-service";
import type {
  FinancialContext,
  FinancialReportBasis,
  SupportedCurrency,
} from "@/types/database";

export const metadata = { title: "Relatórios" };

const REPORT_GROUPS = [
  {
    label: "Receitas e despesas",
    reports: ["income-expense", "fixed-expenses", "period-comparison"],
  },
  {
    label: "Investimentos",
    reports: ["asset-performance"],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  reports: readonly FinancialReportType[];
}>;

const inputClass =
  "min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

function currentYear() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
    }).format(new Date()),
  );
}

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? year + "-" + month : String(currentYear()) + "-01";
}

function previousMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return (
    String(date.getUTCFullYear()) +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0")
  );
}

function monthLabel(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const format = (value: string) =>
    formatter.format(new Date(value + "-01T12:00:00Z")).replace(".", "");
  return start === end ? format(start) : format(start) + " a " + format(end);
}

function reportHref(
  report: FinancialReportType,
  filters: {
    year: number;
    currency: SupportedCurrency;
    basis: FinancialReportBasis;
    context: FinancialContext | "all";
  },
) {
  const query = new URLSearchParams({
    report,
    year: String(filters.year),
    currency: filters.currency,
    basis: filters.basis,
    context: filters.context,
  });
  return "/reports?" + query.toString();
}

function CommonReportFields({
  year,
  currency,
  basis,
  context,
  includeYear = true,
  includeBasis = true,
}: {
  year: number;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: FinancialContext | "all";
  includeYear?: boolean;
  includeBasis?: boolean;
}) {
  return (
    <>
      {includeYear ? (
        <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Ano
          <input
            name="year"
            type="number"
            min="2000"
            max="2200"
            defaultValue={year}
            className={inputClass}
          />
        </label>
      ) : null}
      <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
        Moeda de referência
        <select name="currency" defaultValue={currency} className={inputClass}>
          {SUPPORTED_CURRENCIES.map((item) => (
            <option key={item} value={item}>
              {CURRENCY_LABELS[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
        Contexto
        <select name="context" defaultValue={context} className={inputClass}>
          <option value="all">Todos</option>
          <option value="personal">Pessoal</option>
          <option value="professional">Profissional</option>
        </select>
      </label>
      {includeBasis ? (
        <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Regime
          <select name="basis" defaultValue={basis} className={inputClass}>
            <option value="competence">Competência</option>
            <option value="cash">Caixa</option>
          </select>
        </label>
      ) : null}
    </>
  );
}

function ApplyFiltersButton() {
  return (
    <button className="min-h-10 self-end rounded-lg bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2">
      Aplicar filtros
    </button>
  );
}

function ReportError() {
  return (
    <p
      role="alert"
      className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      Não foi possível carregar todos os dados. Confirme a migration da feature
      no Supabase e tente novamente.
    </p>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [raw, profileResult] = await Promise.all([
    searchParams,
    getCurrentProfile(),
  ]);
  const value = (key: string) =>
    typeof raw[key] === "string" ? raw[key] : undefined;
  const report =
    financialReportTypeSchema.safeParse(value("report")).data ??
    "income-expense";
  const common = financialReportFilterSchema.safeParse({
    year: value("year") ?? currentYear(),
    currency:
      value("currency") ?? profileResult.profile?.preferred_currency ?? "BRL",
    basis: value("basis") ?? "competence",
  });
  const filters = common.success
    ? common.data
    : {
        year: currentYear(),
        currency: profileResult.profile?.preferred_currency ?? "BRL",
        basis: "competence" as const,
      };
  const context =
    reportContextSchema.safeParse(value("context")).data ?? "all";
  const state =
    reportPositionStateSchema.safeParse(value("state")).data ?? "active";
  const commonFilters = { ...filters, context };

  return (
    <main className="mx-auto grid max-w-[1700px] gap-5 px-3 py-6 sm:px-5 lg:px-7">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
          Análise financeira
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          Central de relatórios
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
          Matrizes consolidadas na moeda de referência do perfil.
        </p>
      </header>

      <nav
        aria-label="Tipos de relatório"
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]"
      >
        {REPORT_GROUPS.map((group) => (
          <div key={group.label} className="flex min-w-0 flex-col gap-2">
            <span className="px-1 text-[0.65rem] font-black uppercase tracking-[0.16em] text-slate-500">
              {group.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.reports.map((item) => {
                const active = report === item;
                return (
                  <Link
                    key={item}
                    href={reportHref(item, commonFilters)}
                    aria-current={active ? "page" : undefined}
                    className={
                      "inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 " +
                      (active
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200")
                    }
                  >
                    {FINANCIAL_REPORT_LABELS[item]}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {report === "income-expense" ? (
          <IncomeExpenseReport filters={filters} context={context} />
        ) : report === "fixed-expenses" ? (
          <FixedExpensesReport filters={filters} context={context} />
        ) : report === "period-comparison" ? (
          <ComparisonReport filters={filters} context={context} raw={raw} />
        ) : (
          <AssetPerformanceReport
            filters={filters}
            context={context}
            state={state}
          />
        )}
      </section>
    </main>
  );
}

async function IncomeExpenseReport({
  filters,
  context,
}: {
  filters: {
    year: number;
    currency: SupportedCurrency;
    basis: FinancialReportBasis;
  };
  context: FinancialContext | "all";
}) {
  const result = await getCurrentUserIncomeExpenseMatrix({
    ...filters,
    context,
  });
  const totals = summarizeIncomeExpenseReport(result.rows);
  return (
    <>
      <ReportHeading
        title="Receitas x despesas"
        description="Valores anuais por grupo, categoria e subcategoria, com totais mensais."
      />
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-[120px_220px_170px_160px_auto]"
      >
        <input type="hidden" name="report" value="income-expense" />
        <CommonReportFields {...filters} context={context} />
        <ApplyFiltersButton />
      </form>
      <p className="border-t border-blue-100 bg-blue-50 px-4 py-2.5 text-xs leading-5 text-blue-950">
        <strong>
          {filters.basis === "competence" ? "Competência" : "Caixa"}:
        </strong>{" "}
        {reportBasisDescription(filters.basis)}
      </p>
      {result.hasError ? <ReportError /> : null}
      <ReportCurrencyNotice
        currency={filters.currency}
        missingCurrencies={result.missingCurrencies}
      />
      <div className="grid grid-cols-3 border-t border-slate-200 bg-white">
        <SummaryCell
          label="Receitas"
          value={formatMoney(totals.incomeAmountMinor, filters.currency)}
          color="text-emerald-700"
        />
        <SummaryCell
          label={filters.basis === "cash" ? "Saídas de caixa" : "Despesas"}
          value={formatMoney(totals.expenseAmountMinor, filters.currency)}
          color="text-rose-700"
        />
        <SummaryCell
          label="Resultado"
          value={formatMoney(totals.resultAmountMinor, filters.currency)}
          color={
            totals.resultAmountMinor < 0
              ? "text-rose-700"
              : "text-slate-950"
          }
        />
      </div>
      <MonthlyFinancialMatrix
        rows={result.matrix}
        currency={filters.currency}
        caption={"Receitas e despesas mensais de " + String(filters.year)}
        emptyMessage="Nenhuma receita ou despesa encontrada neste recorte."
      />
    </>
  );
}

async function FixedExpensesReport({
  filters,
  context,
}: {
  filters: {
    year: number;
    currency: SupportedCurrency;
    basis: FinancialReportBasis;
  };
  context: FinancialContext | "all";
}) {
  const result = await getCurrentUserFixedExpenseReport({
    year: filters.year,
    currency: filters.currency,
    basis: filters.basis,
    context,
  });
  return (
    <>
      <ReportHeading
        title="Despesas fixas"
        description="Lançamentos reais classificados em subcategorias marcadas como despesa fixa."
      />
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-[120px_220px_170px_160px_auto]"
      >
        <input type="hidden" name="report" value="fixed-expenses" />
        <CommonReportFields {...filters} context={context} />
        <ApplyFiltersButton />
      </form>
      {result.hasError ? <ReportError /> : null}
      <ReportCurrencyNotice
        currency={filters.currency}
        missingCurrencies={result.missingCurrencies}
      />
      <MonthlyFinancialMatrix
        rows={result.matrix}
        currency={filters.currency}
        caption={"Despesas fixas realizadas em " + String(filters.year)}
        emptyMessage="Nenhum lançamento foi encontrado em subcategorias marcadas como fixas."
        showSections={false}
      />
    </>
  );
}

async function ComparisonReport({
  filters,
  context,
  raw,
}: {
  filters: {
    year: number;
    currency: SupportedCurrency;
    basis: FinancialReportBasis;
  };
  context: FinancialContext | "all";
  raw: Record<string, string | string[] | undefined>;
}) {
  const text = (key: string) =>
    typeof raw[key] === "string" ? raw[key] : undefined;
  const now = currentMonth();
  const previous = previousMonth(now);
  const parsed = periodComparisonFilterSchema.safeParse({
    firstStart: text("firstStart") ?? previous,
    firstEnd: text("firstEnd") ?? previous,
    secondStart: text("secondStart") ?? now,
    secondEnd: text("secondEnd") ?? now,
  });
  const periods = parsed.success
    ? parsed.data
    : {
        firstStart: previous,
        firstEnd: previous,
        secondStart: now,
        secondEnd: now,
      };
  const result = await getCurrentUserPeriodComparisonReport({
    ...periods,
    currency: filters.currency,
    basis: filters.basis,
    context,
  });
  return (
    <>
      <ReportHeading
        title="Comparativo entre períodos"
        description="Compare categorias entre dois intervalos mensais. A diferença é o segundo período menos o primeiro."
      />
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[150px_150px_150px_150px_180px_150px_150px_auto]"
      >
        <input type="hidden" name="report" value="period-comparison" />
        <MonthField
          name="firstStart"
          label="Período 1 · início"
          value={periods.firstStart}
        />
        <MonthField
          name="firstEnd"
          label="Período 1 · fim"
          value={periods.firstEnd}
        />
        <MonthField
          name="secondStart"
          label="Período 2 · início"
          value={periods.secondStart}
        />
        <MonthField
          name="secondEnd"
          label="Período 2 · fim"
          value={periods.secondEnd}
        />
        <CommonReportFields
          {...filters}
          context={context}
          includeYear={false}
        />
        <ApplyFiltersButton />
      </form>
      <p className="border-t border-blue-100 bg-blue-50 px-4 py-2.5 text-xs leading-5 text-blue-950">
        <strong>
          {filters.basis === "competence" ? "Competência" : "Caixa"}:
        </strong>{" "}
        {reportBasisDescription(filters.basis)}
      </p>
      {result.hasError ? <ReportError /> : null}
      <ReportCurrencyNotice
        currency={filters.currency}
        missingCurrencies={result.missingCurrencies}
      />
      <PeriodComparisonMatrix
        rows={result.rows}
        currency={filters.currency}
        firstLabel={monthLabel(periods.firstStart, periods.firstEnd)}
        secondLabel={monthLabel(periods.secondStart, periods.secondEnd)}
      />
    </>
  );
}

async function AssetPerformanceReport({
  filters,
  context,
  state,
}: {
  filters: {
    year: number;
    currency: SupportedCurrency;
    basis: FinancialReportBasis;
  };
  context: FinancialContext | "all";
  state: "active" | "all";
}) {
  const result = await getCurrentUserAssetPerformanceReport({
    currency: filters.currency,
    context,
    state,
  });
  return (
    <>
      <ReportHeading
        title="Performance de ativos"
        description="Valor, resultado e retorno das posições por classe de ativo."
      />
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-[220px_170px_190px_auto]"
      >
        <input type="hidden" name="report" value="asset-performance" />
        <CommonReportFields
          {...filters}
          context={context}
          includeYear={false}
          includeBasis={false}
        />
        <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Posições
          <select name="state" defaultValue={state} className={inputClass}>
            <option value="active">Somente ativas</option>
            <option value="all">Ativas e arquivadas</option>
          </select>
        </label>
        <ApplyFiltersButton />
      </form>
      {result.hasError ? <ReportError /> : null}
      <ReportCurrencyNotice
        currency={filters.currency}
        missingCurrencies={result.missingCurrencies}
      />
      <AssetPerformanceMatrix
        positions={result.positions}
        performanceByClass={result.performanceByClass}
        currency={filters.currency}
      />
      <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-950">
        * Histórico parcial: resultado e retorno total usam valor atual menos
        custo acumulado. Os retornos mensal e anualizado aparecem somente com
        histórico completo; o mensal é a taxa efetiva equivalente à anual,
        calculada pelos fluxos datados.
      </p>
    </>
  );
}

function ReportCurrencyNotice({
  currency,
  missingCurrencies,
}: {
  currency: SupportedCurrency;
  missingCurrencies: SupportedCurrency[];
}) {
  if (missingCurrencies.length) {
    return (
      <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
        Não há conversão registrada de {missingCurrencies.join(", ")} para{" "}
        {currency}; esses valores não foram somados. Registre uma transferência
        entre as moedas para definir a taxa de referência.
      </p>
    );
  }
  return (
    <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-950">
      Todas as moedas foram consolidadas em {currency} com as taxas registradas
      nas transferências entre contas.
    </p>
  );
}

function ReportHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="px-4 py-4 sm:px-5">
      <h2 className="text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </header>
  );
}

function SummaryCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="border-r border-slate-200 px-4 py-3 last:border-r-0">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={"mt-1 text-lg font-black tabular-nums " + color}>{value}</p>
    </div>
  );
}

function MonthField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
      {label}
      <input
        type="month"
        name={name}
        defaultValue={value}
        className={inputClass}
      />
    </label>
  );
}
