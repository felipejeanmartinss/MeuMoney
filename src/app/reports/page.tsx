import { PageHeader } from "@/components/layout/page-header";
import { CheckboxFilter } from "@/components/reports/checkbox-filter";
import Link from "next/link";
import {
  deleteSavedFinancialReport,
  saveFinancialReport,
} from "@/app/actions/reports";
import {
  AssetPerformanceMatrix,
  MonthlyFinancialMatrix,
  NetWorthEvolutionMatrix,
  PeriodComparisonMatrix,
  type ReportCategoryGrouping,
  type ReportTimeGrouping,
} from "@/components/reports/financial-report-matrices";
import {
  CashFlowForecastChart,
  CashFlowForecastEventTable,
} from "@/components/reports/cash-flow-forecast";
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
import { listCurrentUserAccounts } from "@/services/finance/accounts-service";
import { listCurrentUserCategories } from "@/services/finance/categories-service";
import { listCurrentUserCreditCards } from "@/services/finance/credit-cards-service";
import {
  getCurrentUserAssetPerformanceReport,
  getCurrentUserCashFlowForecast,
  getCurrentUserFixedExpenseReport,
  getCurrentUserIncomeExpenseMatrix,
  getCurrentUserNetWorthEvolutionReport,
  getCurrentUserPeriodComparisonReport,
} from "@/services/reports/financial-reports-service";
import { listCurrentUserSavedFinancialReports } from "@/services/reports/saved-financial-reports-service";
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
    reports: ["asset-performance", "asset-performance-general"],
  },
  {
    label: "Patrimônio",
    reports: ["net-worth-evolution", "cash-flow-forecast"],
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

const REPORT_PERIODS = [
  ["all", "Todas as datas"],
  ["current-month", "Mês atual"],
  ["current-year", "Ano atual"],
  ["previous-month", "Mês anterior"],
  ["previous-year", "Ano anterior"],
  ["last-3", "Últimos 3 meses"],
  ["last-6", "Últimos 6 meses"],
  ["last-12", "Últimos 12 meses"],
  ["next-3", "Próximos 3 meses"],
  ["next-6", "Próximos 6 meses"],
  ["next-12", "Próximos 12 meses"],
  ["custom", "Período personalizado"],
] as const;

type ReportPeriod = (typeof REPORT_PERIODS)[number][0];

type ReportFilterOptions = {
  sources: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
  subcategories: Array<{ value: string; label: string }>;
};

type AppliedReportFilters = {
  year: number;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  sourceKeys: string[];
  categoryIds: string[];
  subcategoryIds: string[];
  timeGrouping: ReportTimeGrouping;
  categoryGrouping: ReportCategoryGrouping;
  filterOptions: ReportFilterOptions;
};

function arrayParam(
  raw: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = raw[key];
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolveReportPeriod(raw: Record<string, string | string[] | undefined>) {
  const rawPeriod = typeof raw.period === "string" ? raw.period : "current-year";
  const period = REPORT_PERIODS.some(([value]) => value === rawPeriod)
    ? (rawPeriod as ReportPeriod)
    : "current-year";
  const now = currentMonth();
  if (period === "all") return { period, startMonth: "2000-01", endMonth: shiftMonth(now, 12) };
  if (period === "current-month") return { period, startMonth: now, endMonth: now };
  if (period === "current-year") return { period, startMonth: `${now.slice(0, 4)}-01`, endMonth: `${now.slice(0, 4)}-12` };
  if (period === "previous-month") return { period, startMonth: previousMonth(now), endMonth: previousMonth(now) };
  if (period === "previous-year") {
    const year = Number(now.slice(0, 4)) - 1;
    return { period, startMonth: `${year}-01`, endMonth: `${year}-12` };
  }
  if (period === "custom") {
    const customStart = typeof raw.startMonth === "string" && /^\d{4}-\d{2}$/.test(raw.startMonth) ? raw.startMonth : now;
    const customEnd = typeof raw.endMonth === "string" && /^\d{4}-\d{2}$/.test(raw.endMonth) ? raw.endMonth : now;
    return { period, startMonth: customStart <= customEnd ? customStart : customEnd, endMonth: customStart <= customEnd ? customEnd : customStart };
  }
  const count = Number(period.split("-")[1]);
  return period.startsWith("last")
    ? { period, startMonth: shiftMonth(now, -(count - 1)), endMonth: now }
    : { period, startMonth: now, endMonth: shiftMonth(now, count - 1) };
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

function currentDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : `${currentYear()}-01-01`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const CASH_FLOW_PERIODS = [
  ["next-30", "Próximos 30 dias", 29],
  ["next-90", "Próximos 90 dias", 89],
  ["next-180", "Próximos 6 meses", 179],
  ["next-365", "Próximos 12 meses", 364],
  ["custom", "Período personalizado", 89],
] as const;

function resolveCashFlowPeriod(
  raw: Record<string, string | string[] | undefined>,
) {
  const today = currentDate();
  const requested = typeof raw.cashPeriod === "string" ? raw.cashPeriod : "next-90";
  const preset = CASH_FLOW_PERIODS.find(([value]) => value === requested) ?? CASH_FLOW_PERIODS[1];
  const validDate = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  let startDate =
    preset[0] === "custom" && validDate(raw.startDate)
      ? (raw.startDate as string)
      : today;
  let endDate =
    preset[0] === "custom" && validDate(raw.endDate)
      ? (raw.endDate as string)
      : shiftDate(today, preset[2]);
  if (startDate < today) startDate = today;
  if (endDate < startDate) endDate = startDate;
  const maximumEnd = shiftDate(startDate, 731);
  if (endDate > maximumEnd) endDate = maximumEnd;
  return { period: preset[0], startDate, endDate };
}

function reportHref(
  report: FinancialReportType,
  filters: {
    year: number;
    currency: SupportedCurrency;
    basis: FinancialReportBasis;
    context: FinancialContext | "all";
    sourceCurrencies: SupportedCurrency[];
    sourceKeys?: string[];
    categoryIds?: string[];
    subcategoryIds?: string[];
    timeGrouping?: ReportTimeGrouping;
    categoryGrouping?: ReportCategoryGrouping;
  },
) {
  const query = new URLSearchParams({
    report,
    year: String(filters.year),
    currency: filters.currency,
    basis: filters.basis,
    context: filters.context,
  });
  for (const sourceCurrency of filters.sourceCurrencies) {
    query.append("sourceCurrencies", sourceCurrency);
  }
  for (const sourceKey of filters.sourceKeys ?? []) query.append("sourceKeys", sourceKey);
  for (const categoryId of filters.categoryIds ?? []) query.append("categoryIds", categoryId);
  for (const subcategoryId of filters.subcategoryIds ?? []) query.append("subcategoryIds", subcategoryId);
  if (filters.timeGrouping) query.set("timeGrouping", filters.timeGrouping);
  if (filters.categoryGrouping) query.set("categoryGrouping", filters.categoryGrouping);
  return "/reports?" + query.toString();
}

function savedReportHref(
  reportType: FinancialReportType,
  filters: unknown,
) {
  const query = new URLSearchParams({ report: reportType });
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === "string") query.set(key, value);
      else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") query.append(key, item);
        }
      }
    }
  }
  return `/reports?${query.toString()}`;
}

function CommonReportFields({
  year,
  currency,
  basis,
  context,
  sourceCurrencies,
  includeYear = true,
  includeBasis = true,
  sourceKeys = [],
  categoryIds = [],
  subcategoryIds = [],
  filterOptions,
  timeGrouping = "month",
  categoryGrouping = "category",
  includeTimeGrouping = false,
  includeCategoryGrouping = false,
  includeSourceFilter = true,
  includeCategoryFilters = true,
}: {
  year: number;
  currency: SupportedCurrency;
  basis: FinancialReportBasis;
  context: FinancialContext | "all";
  sourceCurrencies: SupportedCurrency[];
  includeYear?: boolean;
  includeBasis?: boolean;
  sourceKeys?: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  filterOptions: ReportFilterOptions;
  timeGrouping?: ReportTimeGrouping;
  categoryGrouping?: ReportCategoryGrouping;
  includeTimeGrouping?: boolean;
  includeCategoryGrouping?: boolean;
  includeSourceFilter?: boolean;
  includeCategoryFilters?: boolean;
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
      <input type="hidden" name="currency" value={currency} />
      <fieldset className="grid min-w-0 gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
        <legend>Moedas</legend>
        <details className="relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 normal-case tracking-normal text-slate-900 outline-none hover:bg-slate-50 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 marker:hidden">
            <span className="truncate font-semibold">
              {sourceCurrencies.length === SUPPORTED_CURRENCIES.length
                ? "Todas as moedas"
                : `${sourceCurrencies.length} moedas`}
            </span>
            <span className="shrink-0 text-[0.68rem] font-bold text-slate-500">
              {sourceCurrencies.length}/{SUPPORTED_CURRENCIES.length}
            </span>
          </summary>
          <div className="absolute left-0 top-full z-30 mt-1 grid min-w-64 gap-1 rounded-lg border border-slate-200 bg-white p-2 normal-case tracking-normal shadow-xl">
            {SUPPORTED_CURRENCIES.map((item) => (
              <label
                key={item}
                className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  name="sourceCurrencies"
                  value={item}
                  defaultChecked={sourceCurrencies.includes(item)}
                  className="size-4 accent-emerald-700"
                />
                {CURRENCY_LABELS[item]}
              </label>
            ))}
          </div>
        </details>
      </fieldset>
      {includeSourceFilter ? (
        <CheckboxFilter
          label="Contas e cartões"
          name="sourceKeys"
          options={filterOptions.sources}
          selected={sourceKeys}
        />
      ) : null}
      {includeCategoryFilters ? (
        <>
          <CheckboxFilter
            label="Categorias"
            name="categoryIds"
            options={filterOptions.categories}
            selected={categoryIds}
          />
          <CheckboxFilter
            label="Subcategorias"
            name="subcategoryIds"
            options={filterOptions.subcategories}
            selected={subcategoryIds}
          />
        </>
      ) : null}
      {includeTimeGrouping ? (
        <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Visualizar período por
          <select name="timeGrouping" defaultValue={timeGrouping} className={inputClass}>
            <option value="month">Mês</option>
            <option value="quarter">Trimestre</option>
            <option value="year">Ano</option>
          </select>
        </label>
      ) : null}
      {includeCategoryGrouping ? (
        <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Detalhamento
          <select name="categoryGrouping" defaultValue={categoryGrouping} className={inputClass}>
            <option value="category">Categorias</option>
            <option value="subcategory">Subcategorias</option>
          </select>
        </label>
      ) : null}
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
  const [
    raw,
    profileResult,
    savedReportsResult,
    accountsResult,
    cardsResult,
    categoriesResult,
  ] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    listCurrentUserSavedFinancialReports(),
    listCurrentUserAccounts(),
    listCurrentUserCreditCards(),
    listCurrentUserCategories(),
  ]);
  const value = (key: string) =>
    typeof raw[key] === "string" ? raw[key] : undefined;
  const report =
    financialReportTypeSchema.safeParse(value("report")).data ??
    "income-expense";
  const common = financialReportFilterSchema.safeParse({
    year: value("year") ?? currentYear(),
    currency: profileResult.profile?.preferred_currency ?? "BRL",
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
  const requestedSourceCurrencies = Array.isArray(raw.sourceCurrencies)
    ? raw.sourceCurrencies
    : typeof raw.sourceCurrencies === "string"
      ? [raw.sourceCurrencies]
      : [];
  const sourceCurrencies = SUPPORTED_CURRENCIES.filter((currency) =>
    requestedSourceCurrencies.length === 0
      ? true
      : requestedSourceCurrencies.includes(currency),
  );
  const filterOptions: ReportFilterOptions = {
    sources: [
      ...accountsResult.accounts
        .filter((account) => !account.archived_at)
        .map((account) => ({
          value: `account:${account.id}`,
          label: `${account.name} · ${account.currency}`,
        })),
      ...cardsResult.cards
        .filter((card) => card.is_active)
        .map((card) => ({
          value: `card:${card.id}`,
          label: `${card.name} · cartão ${card.currency}`,
        })),
    ],
    categories: categoriesResult.categories
      .filter((category) => !category.parent_id && !category.archived_at)
      .map((category) => ({ value: category.id, label: category.name })),
    subcategories: categoriesResult.categories
      .filter((category) => Boolean(category.parent_id) && !category.archived_at)
      .map((category) => ({ value: category.id, label: category.name })),
  };
  const normalizeSelection = (key: string, options: Array<{ value: string }>) => {
    const requested = arrayParam(raw, key).filter((item) =>
      options.some((option) => option.value === item),
    );
    return requested.length === options.length ? [] : requested;
  };
  const sourceKeys = normalizeSelection("sourceKeys", filterOptions.sources);
  const categoryIds = normalizeSelection("categoryIds", filterOptions.categories);
  const subcategoryIds = normalizeSelection("subcategoryIds", filterOptions.subcategories);
  const timeGrouping: ReportTimeGrouping = ["month", "quarter", "year"].includes(
    value("timeGrouping") ?? "",
  )
    ? (value("timeGrouping") as ReportTimeGrouping)
    : "month";
  const categoryGrouping: ReportCategoryGrouping = value("categoryGrouping") === "subcategory"
    ? "subcategory"
    : "category";
  const appliedFilters = {
    ...filters,
    sourceKeys,
    categoryIds,
    subcategoryIds,
    timeGrouping,
    categoryGrouping,
    filterOptions,
  };
  const commonFilters = { ...appliedFilters, context, sourceCurrencies };
  const savedFilters = Object.fromEntries(
    Object.entries(raw).filter(([key, item]) => key !== "message" && item !== undefined),
  );
  const reportMessage =
    value("message") === "saved"
      ? "Relatório salvo e fixado nas opções."
      : value("message") === "saved-deleted"
        ? "Relatório salvo excluído."
        : value("message")
          ? "Não foi possível concluir a alteração do relatório salvo."
          : null;

  return (
    <main className="app-page max-w-[1700px]">
      <PageHeader title="Relatórios" description="Valores consolidados na moeda do perfil." />

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
              {savedReportsResult.reports
                .filter((saved) =>
                  (group.reports as readonly string[]).includes(saved.report_type),
                )
                .map((saved) => (
                  <span key={saved.id} className="inline-flex min-h-9 items-center overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50">
                    <Link
                      href={savedReportHref(saved.report_type, saved.filters)}
                      className="px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                    >
                      {saved.name}
                    </Link>
                    <form action={deleteSavedFinancialReport}>
                      <input type="hidden" name="id" value={saved.id} />
                      <button
                        type="submit"
                        aria-label={`Excluir relatório salvo ${saved.name}`}
                        className="min-h-9 border-l border-emerald-200 px-2 text-sm font-black text-rose-700 hover:bg-rose-50"
                      >
                        ×
                      </button>
                    </form>
                  </span>
                ))}
            </div>
          </div>
        ))}
        <details className="self-end rounded-xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-black text-slate-700 marker:hidden">
            + Salvar visualização atual
          </summary>
          <form action={saveFinancialReport} className="flex flex-col gap-2 border-t border-slate-200 p-3">
            <input type="hidden" name="reportType" value={report} />
            <input type="hidden" name="filters" value={JSON.stringify(savedFilters)} />
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Nome do relatório
              <input name="name" maxLength={80} required className={inputClass} placeholder="Ex.: Gastos da casa" />
            </label>
            <button className="min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">
              Salvar e fixar
            </button>
          </form>
        </details>
      </nav>

      {reportMessage ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
          {reportMessage}
        </p>
      ) : null}

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {report === "income-expense" ? (
          <IncomeExpenseReport filters={appliedFilters} context={context} sourceCurrencies={sourceCurrencies} raw={raw} />
        ) : report === "fixed-expenses" ? (
          <FixedExpensesReport filters={appliedFilters} context={context} sourceCurrencies={sourceCurrencies} />
        ) : report === "period-comparison" ? (
          <ComparisonReport filters={appliedFilters} context={context} sourceCurrencies={sourceCurrencies} raw={raw} />
        ) : report === "cash-flow-forecast" ? (
          <CashFlowForecastReport
            currency={filters.currency}
            raw={raw}
            accountOptions={accountsResult.accounts
              .filter((account) => !account.archived_at)
              .map((account) => ({
                value: account.id,
                label: `${account.name} · ${account.currency}`,
              }))}
          />
        ) : report === "net-worth-evolution" ? (
          <NetWorthEvolutionReport
            filters={appliedFilters}
            context={context}
            sourceCurrencies={sourceCurrencies}
            raw={raw}
          />
        ) : (
          <AssetPerformanceReport
            filters={appliedFilters}
            context={context}
            state={report === "asset-performance-general" ? "all" : state}
            general={report === "asset-performance-general"}
            sourceCurrencies={sourceCurrencies}
          />
        )}
      </section>
    </main>
  );
}

async function CashFlowForecastReport({
  currency,
  raw,
  accountOptions,
}: {
  currency: SupportedCurrency;
  raw: Record<string, string | string[] | undefined>;
  accountOptions: Array<{ value: string; label: string }>;
}) {
  const period = resolveCashFlowPeriod(raw);
  const requestedAccounts = arrayParam(raw, "accountIds").filter((id) =>
    accountOptions.some((account) => account.value === id),
  );
  const accountIds =
    requestedAccounts.length === accountOptions.length ? [] : requestedAccounts;
  const scenario =
    (typeof raw.scenario === "string" ? raw.scenario : "base") ===
    "conservative"
      ? "conservative"
      : "base";
  const rawAverageMonths = Number(
    typeof raw.averageMonths === "string" ? raw.averageMonths : 6,
  );
  const averageMonths = ([3, 6, 12] as const).includes(
    rawAverageMonths as 3 | 6 | 12,
  )
    ? (rawAverageMonths as 3 | 6 | 12)
    : 6;
  const result = await getCurrentUserCashFlowForecast({
    startDate: period.startDate,
    endDate: period.endDate,
    currency,
    accountIds,
    scenario,
    averageMonths,
  });
  return (
    <>
      <ReportHeading
        title="Projeção de fluxo de caixa"
        description="Saldos futuros por conta, com recorrências, faturas e um cenário conservador sem duplicar compromissos já cadastrados."
      />
      <details className="group border-t border-slate-200 bg-slate-50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-slate-800 marker:hidden">
          Filtros
          <span className="text-xs text-slate-500 group-open:hidden">Mostrar</span>
          <span className="hidden text-xs text-slate-500 group-open:inline">Ocultar</span>
        </summary>
        <form
          method="get"
          className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[180px_150px_150px_180px_220px_150px_auto]"
        >
          <input type="hidden" name="report" value="cash-flow-forecast" />
          <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
            Período
            <select name="cashPeriod" defaultValue={period.period} className={inputClass}>
              {CASH_FLOW_PERIODS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
            Início
            <input name="startDate" type="date" defaultValue={period.startDate} className={inputClass} />
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
            Fim
            <input name="endDate" type="date" defaultValue={period.endDate} className={inputClass} />
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
            Cenário
            <select name="scenario" defaultValue={scenario} className={inputClass}>
              <option value="base">Base</option>
              <option value="conservative">Conservador</option>
            </select>
          </label>
          <CheckboxFilter
            label="Contas consideradas"
            name="accountIds"
            options={accountOptions}
            selected={accountIds}
          />
          <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
            Média histórica
            <select name="averageMonths" defaultValue={averageMonths} className={inputClass}>
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
            </select>
          </label>
          <ApplyFiltersButton />
        </form>
      </details>
      <p className="border-t border-blue-100 bg-blue-50 px-4 py-2.5 text-xs leading-5 text-blue-950">
        <strong>{scenario === "base" ? "Cenário base" : "Cenário conservador"}:</strong>{" "}
        {scenario === "base"
          ? "saldo fechado + lançamentos futuros + recorrências ativas + pagamento das faturas e assinaturas projetadas."
          : `cenário base + parcela ainda não coberta da média variável dos últimos ${averageMonths} meses completos.`}
      </p>
      {result.hasError ? <ReportError /> : null}
      <ReportCurrencyNotice currency={currency} missingCurrencies={result.missingCurrencies} />
      <div className="grid border-t border-slate-200 sm:grid-cols-3">
        <SummaryCell
          label="Saldo inicial"
          value={formatMoney(result.openingTotalMinor, currency)}
          color={result.openingTotalMinor < 0 ? "text-rose-700" : "text-slate-950"}
        />
        <SummaryCell
          label="Menor saldo projetado"
          value={formatMoney(result.lowestTotalMinor, currency)}
          color={result.lowestTotalMinor < 0 ? "text-rose-700" : "text-amber-700"}
        />
        <SummaryCell
          label="Saldo final"
          value={formatMoney(result.closingTotalMinor, currency)}
          color={result.closingTotalMinor < 0 ? "text-rose-700" : "text-emerald-700"}
        />
      </div>
      <CashFlowForecastChart
        accounts={result.accounts}
        points={result.points}
        currency={currency}
      />
      <CashFlowForecastEventTable events={result.events} currency={currency} />
    </>
  );
}

async function NetWorthEvolutionReport({
  filters,
  context,
  sourceCurrencies,
  raw,
}: {
  filters: AppliedReportFilters;
  context: FinancialContext | "all";
  sourceCurrencies: SupportedCurrency[];
  raw: Record<string, string | string[] | undefined>;
}) {
  const period = resolveReportPeriod(raw);
  const result = await getCurrentUserNetWorthEvolutionReport({
    startMonth: period.startMonth,
    endMonth: period.endMonth,
    currency: filters.currency,
    context,
    sourceCurrencies,
    sourceKeys: filters.sourceKeys,
    allDates: period.period === "all",
  });
  return (
    <>
      <ReportHeading title="Evolução patrimonial" description="Ativos, passivos e patrimônio líquido consolidados mês a mês." />
      <details className="group border-t border-slate-200 bg-slate-50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-slate-800 marker:hidden">
          Filtros <span className="text-xs text-slate-500 group-open:hidden">Mostrar</span><span className="hidden text-xs text-slate-500 group-open:inline">Ocultar</span>
        </summary>
      <form method="get" className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[180px_150px_150px_220px_160px_auto]">
        <input type="hidden" name="report" value="net-worth-evolution" />
        <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Período
          <select name="period" defaultValue={period.period} className={inputClass}>
            {REPORT_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <MonthField name="startMonth" label="Início personalizado" value={period.startMonth} />
        <MonthField name="endMonth" label="Fim personalizado" value={period.endMonth} />
        <CommonReportFields {...filters} context={context} sourceCurrencies={sourceCurrencies} includeYear={false} includeBasis={false} includeCategoryFilters={false} />
        <ApplyFiltersButton />
      </form>
      </details>
      {result.hasError ? <ReportError /> : null}
      <ReportCurrencyNotice currency={filters.currency} missingCurrencies={result.missingCurrencies} />
      <NetWorthEvolutionMatrix rows={result.rows} currency={filters.currency} />
    </>
  );
}

async function IncomeExpenseReport({
  filters,
  context,
  sourceCurrencies,
  raw,
}: {
  filters: AppliedReportFilters;
  context: FinancialContext | "all";
  sourceCurrencies: SupportedCurrency[];
  raw: Record<string, string | string[] | undefined>;
}) {
  const period = resolveReportPeriod(raw);
  const result = await getCurrentUserIncomeExpenseMatrix({
    startMonth: period.startMonth,
    endMonth: period.endMonth,
    currency: filters.currency,
    basis: filters.basis,
    context,
    sourceCurrencies,
    sourceKeys: filters.sourceKeys,
    categoryIds: filters.categoryIds,
    subcategoryIds: filters.subcategoryIds,
    allDates: period.period === "all",
  });
  const totals = summarizeIncomeExpenseReport(result.rows);
  return (
    <>
      <ReportHeading
        title="Receitas x despesas"
        description="Valores anuais por grupo, categoria e subcategoria, com totais mensais."
      />
      <details className="group border-t border-slate-200 bg-slate-50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-slate-800 marker:hidden">
          Filtros <span className="text-xs text-slate-500 group-open:hidden">Mostrar</span><span className="hidden text-xs text-slate-500 group-open:inline">Ocultar</span>
        </summary>
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[180px_150px_150px_220px_160px_150px_auto]"
      >
        <input type="hidden" name="report" value="income-expense" />
        <label className="grid gap-1 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          Período
          <select name="period" defaultValue={period.period} className={inputClass}>
            {REPORT_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <MonthField name="startMonth" label="Início personalizado" value={period.startMonth} />
        <MonthField name="endMonth" label="Fim personalizado" value={period.endMonth} />
        <CommonReportFields {...filters} context={context} sourceCurrencies={sourceCurrencies} includeYear={false} includeTimeGrouping includeCategoryGrouping />
        <ApplyFiltersButton />
      </form>
      </details>
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
        drilldownYear={filters.year}
        caption={`Receitas e despesas mensais de ${monthLabel(period.startMonth, period.endMonth)}`}
        emptyMessage="Nenhuma receita ou despesa encontrada neste recorte."
        months={result.months}
        timeGrouping={filters.timeGrouping}
        categoryGrouping={filters.categoryGrouping}
      />
    </>
  );
}

async function FixedExpensesReport({
  filters,
  context,
  sourceCurrencies,
}: {
  filters: AppliedReportFilters;
  context: FinancialContext | "all";
  sourceCurrencies: SupportedCurrency[];
}) {
  const result = await getCurrentUserFixedExpenseReport({
    year: filters.year,
    currency: filters.currency,
    basis: filters.basis,
    context,
    sourceCurrencies,
    sourceKeys: filters.sourceKeys,
    categoryIds: filters.categoryIds,
    subcategoryIds: filters.subcategoryIds,
  });
  return (
    <>
      <ReportHeading
        title="Despesas fixas"
        description="Lançamentos reais classificados em subcategorias marcadas como despesa fixa."
      />
      <details className="group border-t border-slate-200 bg-slate-50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-slate-800 marker:hidden">
          Filtros <span className="text-xs text-slate-500 group-open:hidden">Mostrar</span><span className="hidden text-xs text-slate-500 group-open:inline">Ocultar</span>
        </summary>
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-[120px_220px_170px_160px_auto]"
      >
        <input type="hidden" name="report" value="fixed-expenses" />
        <CommonReportFields {...filters} context={context} sourceCurrencies={sourceCurrencies} includeTimeGrouping includeCategoryGrouping />
        <ApplyFiltersButton />
      </form>
      </details>
      {result.hasError ? <ReportError /> : null}
      <ReportCurrencyNotice
        currency={filters.currency}
        missingCurrencies={result.missingCurrencies}
      />
      <MonthlyFinancialMatrix
        rows={result.matrix}
        currency={filters.currency}
        drilldownYear={filters.year}
        caption={"Despesas fixas realizadas em " + String(filters.year)}
        emptyMessage="Nenhum lançamento foi encontrado em subcategorias marcadas como fixas."
        showSections={false}
        timeGrouping={filters.timeGrouping}
        categoryGrouping={filters.categoryGrouping}
      />
    </>
  );
}

async function ComparisonReport({
  filters,
  context,
  sourceCurrencies,
  raw,
}: {
  filters: AppliedReportFilters;
  context: FinancialContext | "all";
  sourceCurrencies: SupportedCurrency[];
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
    sourceCurrencies,
    sourceKeys: filters.sourceKeys,
  });
  return (
    <>
      <ReportHeading
        title="Comparativo entre períodos"
        description="Compare categorias entre dois intervalos mensais. A diferença é o segundo período menos o primeiro."
      />
      <details className="group border-t border-slate-200 bg-slate-50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-slate-800 marker:hidden">
          Filtros <span className="text-xs text-slate-500 group-open:hidden">Mostrar</span><span className="hidden text-xs text-slate-500 group-open:inline">Ocultar</span>
        </summary>
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[150px_150px_150px_150px_180px_150px_150px_auto]"
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
          sourceCurrencies={sourceCurrencies}
          includeYear={false}
          includeCategoryGrouping
        />
        <ApplyFiltersButton />
      </form>
      </details>
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
        categoryGrouping={filters.categoryGrouping}
      />
    </>
  );
}

async function AssetPerformanceReport({
  filters,
  context,
  state,
  general,
  sourceCurrencies,
}: {
  filters: AppliedReportFilters;
  context: FinancialContext | "all";
  state: "active" | "all";
  general: boolean;
  sourceCurrencies: SupportedCurrency[];
}) {
  const result = await getCurrentUserAssetPerformanceReport({
    currency: filters.currency,
    context,
    state,
    sourceCurrencies,
  });
  return (
    <>
      <ReportHeading
        title={general ? "Performance geral" : "Performance de ativos"}
        description={general ? "Inclui posições ativas e investimentos já liquidados." : "Posições ativas por classe, com resultados e taxas de retorno."}
      />
      <details className="group border-t border-slate-200 bg-slate-50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-slate-800 marker:hidden">
          Filtros <span className="text-xs text-slate-500 group-open:hidden">Mostrar</span><span className="hidden text-xs text-slate-500 group-open:inline">Ocultar</span>
        </summary>
      <form
        method="get"
        className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-[220px_170px_190px_auto]"
      >
        <input type="hidden" name="report" value={general ? "asset-performance-general" : "asset-performance"} />
        <CommonReportFields
          {...filters}
          context={context}
          sourceCurrencies={sourceCurrencies}
          includeYear={false}
          includeBasis={false}
          includeSourceFilter={false}
          includeCategoryFilters={false}
        />
        <input type="hidden" name="state" value={general ? "all" : "active"} />
        <ApplyFiltersButton />
      </form>
      </details>
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
