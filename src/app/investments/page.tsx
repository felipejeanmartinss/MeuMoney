import Link from "next/link";
import {
  deleteInvestmentPosition,
  toggleInvestmentPositionStatus,
} from "@/app/actions/investments";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CONTEXT_LABELS } from "@/domain/accounts";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import {
  formatInvestmentQuantity,
  getInvestmentFamily,
  INVESTMENT_FAMILY_LABELS,
  INVESTMENT_TYPE_LABELS,
  summarizeInvestmentPeriodPerformance,
  summarizeInvestmentPerformance,
  type InvestmentPerformance,
  type InvestmentPerformanceCashFlow,
  type InvestmentPeriodPerformance,
  type InvestmentPerformancePosition,
} from "@/domain/investments";
import { formatMoney } from "@/domain/money";
import { NET_WORTH_ITEM_TYPE_LABELS } from "@/domain/net-worth";
import { listCurrentUserFinancingContracts } from "@/services/finance/financing-imports-service";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import { listCurrentUserNetWorth } from "@/services/finance/net-worth-service";
import type {
  InvestmentPositionPerformanceSummary,
  FinancingContractSummary,
  InvestmentType,
  NetWorthItem,
  SupportedCurrency,
} from "@/types/database";

export const metadata = { title: "Investimentos" };

const INVESTMENT_PAGE_SIZE = 18;

const messages: Record<string, string> = {
  created: "Posição de investimento cadastrada com sucesso.",
  updated: "Posição e fotografia histórica atualizadas com sucesso.",
  "status-updated": "Estado da posição atualizado com sucesso.",
  "status-error": "Não foi possível alterar o estado da posição.",
  deleted: "Posição e seus movimentos de investimento foram excluídos.",
  "delete-error": "Não foi possível excluir a posição de investimento.",
  "import-cancelled": "Prévia de financiamento cancelada.",
  "import-error": "Não foi possível concluir a importação do financiamento.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function percentage(part: number, total: number) {
  return total === 0
    ? "0%"
    : `${((part / total) * 100).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })}%`;
}

function formatBasisPoints(value: number | null) {
  return value === null
    ? "—"
    : `${new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value / 100)}%`;
}

type InvestmentFamily = ReturnType<typeof getInvestmentFamily>;

function currentValueOf(
  positions: readonly InvestmentPositionPerformanceSummary[],
) {
  return positions.reduce(
    (total, position) => total + position.current_value_minor,
    0,
  );
}

function groupPositionsByType(
  positions: readonly InvestmentPositionPerformanceSummary[],
) {
  const groups = new Map<
    InvestmentType,
    InvestmentPositionPerformanceSummary[]
  >();
  for (const position of positions) {
    const rows = groups.get(position.investment_type) ?? [];
    rows.push(position);
    groups.set(position.investment_type, rows);
  }
  return [...groups.entries()].sort(([left], [right]) =>
    INVESTMENT_TYPE_LABELS[left].localeCompare(
      INVESTMENT_TYPE_LABELS[right],
      "pt-BR",
    ),
  );
}

function groupPositionsByFamily(
  positions: readonly InvestmentPositionPerformanceSummary[],
) {
  const groups = new Map<
    InvestmentFamily,
    InvestmentPositionPerformanceSummary[]
  >();
  for (const position of positions) {
    const family = getInvestmentFamily(position.investment_class);
    const rows = groups.get(family) ?? [];
    rows.push(position);
    groups.set(family, rows);
  }
  return [...groups.entries()];
}

function periodPerformanceOf(
  position: InvestmentPositionPerformanceSummary,
): InvestmentPeriodPerformance | null {
  return position.previous_month_result_minor === null ||
    position.previous_month_return_basis_minor === null ||
    position.previous_month_return_basis_points === null
    ? null
    : {
        resultMinor: position.previous_month_result_minor,
        returnBasisMinor: position.previous_month_return_basis_minor,
        returnBasisPoints: position.previous_month_return_basis_points,
      };
}

function InvestmentPagination({
  currentPage,
  pageCount,
  totalRows,
  showArchived,
}: {
  currentPage: number;
  pageCount: number;
  totalRows: number;
  showArchived: boolean;
}) {
  if (pageCount <= 1) return null;
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (showArchived) params.set("view", "archived");
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return `/investments${query ? `?${query}` : ""}#investment-positions`;
  };
  const pageNumbers = [...new Set([
    1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    pageCount,
  ])].filter((page) => page >= 1 && page <= pageCount);
  const firstRow = (currentPage - 1) * INVESTMENT_PAGE_SIZE + 1;
  const lastRow = Math.min(currentPage * INVESTMENT_PAGE_SIZE, totalRows);

  return (
    <nav
      aria-label="Paginação das posições"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
    >
      <span className="font-semibold text-slate-500">
        {firstRow}–{lastRow} de {totalRows} posições
      </span>
      <div className="flex items-center gap-1">
        <Link
          href={pageHref(Math.max(1, currentPage - 1))}
          aria-disabled={currentPage === 1}
          className={`rounded-md border px-2.5 py-1.5 font-bold ${
            currentPage === 1
              ? "pointer-events-none border-slate-100 text-slate-300"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Anterior
        </Link>
        {pageNumbers.map((page, index) => (
          <span key={page} className="contents">
            {index > 0 && page - pageNumbers[index - 1] > 1 ? (
              <span className="px-1 text-slate-400">…</span>
            ) : null}
            <Link
              href={pageHref(page)}
              aria-current={page === currentPage ? "page" : undefined}
              className={`min-w-8 rounded-md px-2 py-1.5 text-center font-bold ${
                page === currentPage
                  ? "bg-emerald-700 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {page}
            </Link>
          </span>
        ))}
        <Link
          href={pageHref(Math.min(pageCount, currentPage + 1))}
          aria-disabled={currentPage === pageCount}
          className={`rounded-md border px-2.5 py-1.5 font-bold ${
            currentPage === pageCount
              ? "pointer-events-none border-slate-100 text-slate-300"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          }`}
        >
          Próxima
        </Link>
      </div>
    </nav>
  );
}

function InvestmentSubtotalMetrics({
  positions,
  currency,
  portfolioCurrentValueMinor,
  cashFlows,
  performanceInputs,
  showArchived,
}: {
  positions: readonly InvestmentPositionPerformanceSummary[];
  currency: SupportedCurrency;
  portfolioCurrentValueMinor: number;
  cashFlows: readonly InvestmentPerformanceCashFlow[];
  performanceInputs: ReadonlyMap<string, InvestmentPerformancePosition>;
  showArchived: boolean;
}) {
  const inputs = positions.flatMap((position) => {
    const input = performanceInputs.get(position.id);
    return input ? [input] : [];
  });
  const currentValueMinor = currentValueOf(positions);
  const accumulatedCostMinor = positions.reduce(
    (total, position) => total + position.accumulated_cost_minor,
    0,
  );
  const performance = summarizeInvestmentPerformance(inputs, cashFlows);
  const previousMonthPerformance = summarizeInvestmentPeriodPerformance(
    positions.map(periodPerformanceOf),
  );
  const metrics = [
    {
      label: "Valor atual",
      value: formatMoney(
        currentValueMinor,
        currency,
        CURRENCY_LOCALES[currency],
      ),
      tone: "text-slate-950",
    },
    {
      label: "Custo",
      value: formatMoney(
        accumulatedCostMinor,
        currency,
        CURRENCY_LOCALES[currency],
      ),
      tone: "text-slate-800",
    },
    {
      label: "Resultado",
      value: `${formatMoney(
        performance.resultMinor,
        currency,
        CURRENCY_LOCALES[currency],
      )}${performance.resultIsEstimated ? " *" : ""}`,
      tone:
        performance.resultMinor < 0
          ? "text-rose-700"
          : "text-emerald-700",
    },
    {
      label: "Retorno total",
      value: formatBasisPoints(performance.totalReturnBasisPoints),
      tone: "text-slate-800",
    },
    {
      label: "Mês anterior",
      value: formatBasisPoints(previousMonthPerformance?.returnBasisPoints ?? null),
      tone: "text-slate-800",
    },
    {
      label: showArchived ? "Posições" : "Participação",
      value: showArchived
        ? String(positions.length)
        : percentage(currentValueMinor, portfolioCurrentValueMinor),
      tone: "text-slate-800",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.66rem] sm:grid-cols-3 lg:col-span-6 lg:grid-cols-subgrid lg:gap-x-5">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0">
          <dt className="whitespace-nowrap font-semibold text-slate-500">
            {metric.label}
          </dt>
          <dd className={`truncate font-extrabold ${metric.tone}`}>
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PositionsView({
  positions,
  portfolioPerformance,
  cashFlows,
  performanceInputs,
  showArchived,
  requestedPage,
}: {
  positions: InvestmentPositionPerformanceSummary[];
  portfolioPerformance: ({ currency: SupportedCurrency } &
    InvestmentPerformance & {
      previousMonthPerformance: InvestmentPeriodPerformance | null;
    })[];
  cashFlows: InvestmentPerformanceCashFlow[];
  performanceInputs: Map<string, InvestmentPerformancePosition>;
  showArchived: boolean;
  requestedPage?: string;
}) {
  const active = positions.filter((position) => position.is_active);
  const visible = positions.filter(
    (position) => position.is_active !== showArchived,
  );
  const totals = new Map<SupportedCurrency, number>();
  for (const position of active) {
    totals.set(
      position.currency,
      (totals.get(position.currency) ?? 0) + position.current_value_minor,
    );
  }
  const groups = new Map<
    string,
    {
      currency: SupportedCurrency;
      family: ReturnType<typeof getInvestmentFamily>;
      rows: InvestmentPositionPerformanceSummary[];
    }
  >();
  for (const position of visible) {
    const family = getInvestmentFamily(position.investment_class);
    const key = `${position.currency}-${family}`;
    const group = groups.get(key) ?? {
      currency: position.currency,
      family,
      rows: [],
    };
    group.rows.push(position);
    groups.set(key, group);
  }
  const orderedPositions = [...groups.values()].flatMap((group) =>
    groupPositionsByType(group.rows).flatMap(([, rows]) => rows),
  );
  const pageCount = Math.max(
    1,
    Math.ceil(orderedPositions.length / INVESTMENT_PAGE_SIZE),
  );
  const parsedPage = Number.parseInt(requestedPage ?? "1", 10);
  const currentPage = Math.min(
    pageCount,
    Math.max(1, Number.isFinite(parsedPage) ? parsedPage : 1),
  );
  const firstPositionIndex = (currentPage - 1) * INVESTMENT_PAGE_SIZE;
  const pagePositionIds = new Set(
    orderedPositions
      .slice(firstPositionIndex, firstPositionIndex + INVESTMENT_PAGE_SIZE)
      .map((position) => position.id),
  );

  if (visible.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <h2 className="text-xl font-extrabold text-slate-950">
          {showArchived
            ? "Nenhuma posição arquivada"
            : "Nenhum investimento cadastrado"}
        </h2>
        {!showArchived ? (
          <Link
            href="/investments/new"
            className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white"
          >
            Cadastrar posição
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <div id="investment-positions" className="grid gap-3 scroll-mt-4">
      {!showArchived ? (
        <section className="grid gap-3">
          {[...totals.entries()].map(([currency, currentValue]) => {
            const currencyPositions = active.filter(
              (position) => position.currency === currency,
            );
            const accumulatedCost = currencyPositions.reduce(
              (total, position) =>
                total + position.accumulated_cost_minor,
              0,
            );
            const performance = portfolioPerformance.find(
              (item) => item.currency === currency,
            );
            const familyBreakdown = groupPositionsByFamily(currencyPositions);
            return (
              <div
                key={currency}
                className="grid gap-3 xl:grid-cols-[minmax(24rem,0.9fr)_minmax(0,1.6fr)]"
              >
              <article
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
                      Carteira {currency}
                    </p>
                    <p className="mt-1 text-xl font-black text-slate-950">
                      {formatMoney(
                        currentValue,
                        currency,
                        CURRENCY_LOCALES[currency],
                      )}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>Custo acumulado</p>
                    <p className="mt-0.5 font-bold text-slate-800">
                      {formatMoney(
                        accumulatedCost,
                        currency,
                        CURRENCY_LOCALES[currency],
                      )}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Resultado</dt>
                    <dd
                      className={`mt-0.5 font-extrabold ${
                        (performance?.resultMinor ?? 0) < 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {performance
                        ? formatMoney(
                            performance.resultMinor,
                            currency,
                            CURRENCY_LOCALES[currency],
                          )
                        : "—"}
                      {performance?.resultIsEstimated ? (
                        <abbr
                          title="Resultado estimado pelo valor atual menos o custo acumulado"
                          className="ml-0.5 no-underline"
                        >
                          *
                        </abbr>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Retorno total</dt>
                    <dd className="mt-0.5 font-extrabold text-slate-900">
                      {formatBasisPoints(
                        performance?.totalReturnBasisPoints ?? null,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Mês anterior</dt>
                    <dd className="mt-0.5 font-extrabold text-slate-900">
                      {formatBasisPoints(
                        performance?.previousMonthPerformance
                          ?.returnBasisPoints ?? null,
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-black text-slate-950">
                    Composição da carteira
                  </h2>
                  <span className="text-[0.68rem] font-extrabold uppercase tracking-wide text-emerald-700">
                    {currency}
                  </span>
                </div>
                <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                  {familyBreakdown.map(([family, familyPositions]) => (
                    <div key={family} className="min-w-0">
                      <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-slate-900">
                        <span>{INVESTMENT_FAMILY_LABELS[family]}</span>
                        <span>
                          {percentage(
                            currentValueOf(familyPositions),
                            currentValue,
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-slate-500">
                        {groupPositionsByType(familyPositions).map(
                          ([investmentType, typePositions]) => (
                            <span key={investmentType}>
                              {INVESTMENT_TYPE_LABELS[investmentType]}{" "}
                              <strong className="text-slate-700">
                                {percentage(
                                  currentValueOf(typePositions),
                                  currentValue,
                                )}
                              </strong>
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
              </div>
            );
          })}
        </section>
      ) : null}

      {[...groups.values()].map((group) => {
        const pageRows = group.rows.filter((position) =>
          pagePositionIds.has(position.id),
        );
        if (pageRows.length === 0) return null;
        const typeGroups = groupPositionsByType(pageRows);
        return (
        <section
          key={`${group.currency}-${group.family}`}
          className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="grid gap-y-2 border-b border-slate-200 px-3 py-2 lg:grid-cols-[minmax(20rem,2fr)_repeat(6,minmax(5.5rem,1fr))_auto] lg:items-end lg:gap-x-5">
            <div>
              <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.15em] text-emerald-700">
                {group.currency}
              </p>
              <h2 className="mt-0.5 font-black text-slate-950">
                {INVESTMENT_FAMILY_LABELS[group.family]}
              </h2>
            </div>
            <InvestmentSubtotalMetrics
              positions={group.rows}
              currency={group.currency}
              portfolioCurrentValueMinor={totals.get(group.currency) ?? 0}
              cashFlows={cashFlows}
              performanceInputs={performanceInputs}
              showArchived={showArchived}
            />
            <span className="hidden lg:block" aria-hidden="true" />
          </div>
          <div className="grid">
            {typeGroups.map(([investmentType, typePositions]) => (
              <div key={investmentType}>
                <div className="grid gap-y-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 lg:grid-cols-[minmax(20rem,2fr)_repeat(6,minmax(5.5rem,1fr))_auto] lg:items-center lg:gap-x-5">
                  <span className="text-[0.7rem] font-extrabold text-slate-700">
                    {INVESTMENT_TYPE_LABELS[investmentType]}
                  </span>
                  <InvestmentSubtotalMetrics
                    positions={group.rows.filter(
                      (position) => position.investment_type === investmentType,
                    )}
                    currency={group.currency}
                    portfolioCurrentValueMinor={
                      totals.get(group.currency) ?? 0
                    }
                    cashFlows={cashFlows}
                    performanceInputs={performanceInputs}
                    showArchived={showArchived}
                  />
                  <span className="hidden lg:block" aria-hidden="true" />
                </div>
                <div className="grid divide-y divide-slate-100">
            {typePositions.map((position) => {
              const total = totals.get(position.currency) ?? 0;
              const archived = !position.is_active;
              return (
                <article
                  key={position.id}
                  className={`grid gap-y-2 px-3 py-1.5 md:grid-cols-2 lg:grid-cols-[minmax(20rem,2fr)_repeat(6,minmax(5.5rem,1fr))_auto] lg:items-center lg:gap-x-5 ${
                    archived ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap">
                    <h3 className="max-w-[45%] shrink-0 truncate text-sm font-extrabold text-slate-950">
                      {position.asset_name}
                    </h3>
                    <p className="min-w-0 truncate text-[0.68rem] text-slate-500">
                      {position.institution} · {CONTEXT_LABELS[position.context]} ·{" "}
                      {formatInvestmentQuantity(position.quantity)} un.
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-bold text-slate-500">Valor atual</p>
                    <p className="text-xs font-extrabold text-slate-950">
                      {formatMoney(
                        position.current_value_minor,
                        position.currency,
                        CURRENCY_LOCALES[position.currency],
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-bold text-slate-500">Custo</p>
                    <p className="text-xs font-bold text-slate-800">
                      {formatMoney(
                        position.accumulated_cost_minor,
                        position.currency,
                        CURRENCY_LOCALES[position.currency],
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-bold text-slate-500">Resultado</p>
                    <p
                      className={`text-xs font-bold ${
                        position.performance_result_minor < 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {formatMoney(
                        position.performance_result_minor,
                        position.currency,
                        CURRENCY_LOCALES[position.currency],
                      )}
                      {position.performance_result_is_estimated ? (
                        <abbr
                          title="Resultado estimado pelo valor atual menos o custo acumulado"
                          className="ml-0.5 no-underline"
                        >
                          *
                        </abbr>
                      ) : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-bold text-slate-500">
                      Retorno total
                    </p>
                    <p className="text-xs font-bold text-slate-800">
                      {formatBasisPoints(position.total_return_basis_points)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-bold text-slate-500">
                      Mês anterior
                    </p>
                    <p className="text-xs font-bold text-slate-800">
                      {formatBasisPoints(
                        position.previous_month_return_basis_points,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-bold text-slate-500">
                      Participação
                    </p>
                    <p className="text-xs font-bold text-slate-800">
                      {archived
                        ? "Arquivada"
                        : percentage(position.current_value_minor, total)}
                    </p>
                  </div>
                  <details className="relative z-20">
                    <summary className="flex min-h-8 cursor-pointer list-none items-center rounded-lg border border-slate-300 px-2.5 text-xs font-bold">
                      Ações
                    </summary>
                    <div className="z-30 mt-2 grid min-w-40 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl lg:absolute lg:right-0">
                      <Link
                        href={`/investments/${position.id}/edit`}
                        className="rounded-lg px-3 py-2 text-sm font-bold hover:bg-slate-100"
                      >
                        Atualizar
                      </Link>
                      <Link
                        href={`/investments/${position.id}/history`}
                        className="rounded-lg px-3 py-2 text-sm font-bold hover:bg-slate-100"
                      >
                        Histórico
                      </Link>
                      <form action={toggleInvestmentPositionStatus}>
                        <input type="hidden" name="id" value={position.id} />
                        <input
                          type="hidden"
                          name="archive"
                          value={archived ? "false" : "true"}
                        />
                        <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100">
                          {archived ? "Reativar" : "Arquivar"}
                        </button>
                      </form>
                      <form action={deleteInvestmentPosition}>
                        <input type="hidden" name="id" value={position.id} />
                        <ConfirmSubmitButton
                          confirmation={`Excluir definitivamente a posição “${position.asset_name}” e seus movimentos? Transferências originais serão preservadas.`}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </details>
                </article>
              );
            })}
                </div>
              </div>
            ))}
          </div>
        </section>
        );
      })}
      <InvestmentPagination
        currentPage={currentPage}
        pageCount={pageCount}
        totalRows={visible.length}
        showArchived={showArchived}
      />
    </div>
  );
}

function FinancingsView({
  items,
  contracts,
}: {
  items: NetWorthItem[];
  contracts: FinancingContractSummary[];
}) {
  const importedItemIds = new Set(
    contracts.map((contract) => contract.net_worth_item_id),
  );
  const financings = items.filter(
    (item) =>
      item.kind === "liability" &&
      ["financing", "loan"].includes(item.item_type),
  );
  const manualFinancings = financings.filter(
    (item) => !importedItemIds.has(item.id),
  );
  const totals = new Map<SupportedCurrency, number>();
  for (const item of financings.filter((row) => row.is_active)) {
    totals.set(
      item.currency,
      (totals.get(item.currency) ?? 0) + item.current_value_minor,
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...totals.entries()].map(([currency, total]) => (
          <article
            key={currency}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-extrabold text-rose-700">
              Saldo devedor {currency}
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950">
              {formatMoney(total, currency, CURRENCY_LOCALES[currency])}
            </p>
          </article>
        ))}
      </section>
      <section className="flex flex-wrap gap-2">
        <Link
          href="/investments/financing-imports/new"
          className="inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800"
        >
          Importar PDF do banco
        </Link>
        <Link
          href="/net-worth/new?itemType=financing"
          className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-800"
        >
          Cadastrar manualmente
        </Link>
      </section>

      {contracts.length ? (
        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Contratos estruturados
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Indicadores derivados dos extratos financeiros revisados.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {contracts.map((contract) => (
              <Link
                key={contract.id}
                href={`/investments/financings/${contract.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-extrabold text-slate-950">
                      {contract.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {contract.institution} · {contract.amortization_system ?? "Sistema não informado"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    {contract.status === "active" ? "Ativo" : contract.status === "settled" ? "Quitado" : "Arquivado"}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500">Saldo devedor</dt><dd className="mt-1 font-extrabold text-slate-950">{formatMoney(contract.current_balance_minor, contract.currency)}</dd></div>
                  <div><dt className="text-slate-500">Juros pagos</dt><dd className="mt-1 font-extrabold text-slate-950">{formatMoney(contract.interest_paid_minor, contract.currency)}</dd></div>
                </dl>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {financings.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-extrabold text-slate-950">
            Nenhum financiamento ou empréstimo
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            Estes registros continuam no patrimônio e apenas são apresentados
            nesta central.
          </p>
        </section>
      ) : manualFinancings.length ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-black text-slate-950">Registros manuais</h2>
          </div>
          <div className="grid divide-y divide-slate-100">
            {manualFinancings.map((item) => {
              const total = totals.get(item.currency) ?? 0;
              return (
                <Link
                  key={item.id}
                  href={`/net-worth/${item.id}/edit`}
                  className={`grid gap-3 p-5 hover:bg-emerald-50/40 sm:grid-cols-[minmax(0,1fr)_repeat(3,auto)] sm:items-center sm:gap-8 ${
                    item.is_active ? "" : "opacity-60"
                  }`}
                >
                  <div>
                    <h2 className="font-extrabold text-slate-950">{item.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {NET_WORTH_ITEM_TYPE_LABELS[item.item_type]} ·{" "}
                      {CONTEXT_LABELS[item.context]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      Saldo devedor
                    </p>
                    <p className="mt-1 font-extrabold text-slate-950">
                      {formatMoney(
                        item.current_value_minor,
                        item.currency,
                        CURRENCY_LOCALES[item.currency],
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      Última avaliação
                    </p>
                    <p className="mt-1 font-bold text-slate-800">
                      {formatDate(item.valuation_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      Participação
                    </p>
                    <p className="mt-1 font-bold text-slate-800">
                      {item.is_active
                        ? percentage(item.current_value_minor, total)
                        : "Arquivado"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    message?: string;
    tab?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const [investmentResult, netWorthResult, financingResult, params] = await Promise.all([
    listCurrentUserInvestmentPositions(),
    listCurrentUserNetWorth(),
    listCurrentUserFinancingContracts(),
    searchParams,
  ]);
  const activeTab = params.tab === "financing" ? "financing" : "positions";
  const showArchived = activeTab === "positions" && params.view === "archived";
  const archivedCount = investmentResult.positions.filter(
    (position) => !position.is_active,
  ).length;
  const feedback = params.message ? messages[params.message] : undefined;
  const hasError =
    investmentResult.hasError ||
    netWorthResult.hasError ||
    financingResult.hasError;

  return (
    <main className="mx-auto grid max-w-[1760px] gap-4 px-3 py-5 sm:px-5 lg:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Carteira e compromissos
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Investimentos
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Posições por moeda e classe de ativo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === "positions" ? (
            <Link
              href={showArchived ? "/investments" : "/investments?view=archived"}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              {showArchived
                ? "Ver posições ativas"
                : `Arquivadas (${archivedCount})`}
            </Link>
          ) : null}
          {activeTab === "positions" ? (
            <Link
              href="/investments/movements"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              Vincular movimentações
            </Link>
          ) : null}
          <Link
            href={activeTab === "positions" ? "/investments/new" : "/investments/financing-imports/new"}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800"
          >
            {activeTab === "positions"
              ? "Nova posição"
              : "Importar financiamento"}
          </Link>
        </div>
      </header>

      <nav
        aria-label="Seções de investimentos"
        className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        <Link
          href="/investments"
          aria-current={activeTab === "positions" ? "page" : undefined}
          className={`min-h-9 rounded-lg px-4 py-2 text-sm font-extrabold ${
            activeTab === "positions"
              ? "bg-emerald-700 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Posições
        </Link>
        <Link
          href="/investments?tab=financing"
          aria-current={activeTab === "financing" ? "page" : undefined}
          className={`min-h-9 rounded-lg px-4 py-2 text-sm font-extrabold ${
            activeTab === "financing"
              ? "bg-emerald-700 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Financiamentos e empréstimos
        </Link>
      </nav>

      {feedback ? (
        <p
          role={params.message?.endsWith("error") ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 ${
            params.message?.endsWith("error")
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {feedback}
        </p>
      ) : null}
      {hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Parte da central não pôde ser carregada. Tente novamente.
        </p>
      ) : null}

      {activeTab === "positions" ? (
        <PositionsView
          positions={investmentResult.positions}
          portfolioPerformance={investmentResult.portfolioPerformance}
          cashFlows={investmentResult.cashFlows}
          performanceInputs={investmentResult.performanceInputs}
          showArchived={showArchived}
          requestedPage={params.page}
        />
      ) : (
        <FinancingsView
          items={netWorthResult.items}
          contracts={financingResult.contracts}
        />
      )}
    </main>
  );
}
