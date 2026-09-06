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
  INVESTMENT_CLASS_LABELS,
  INVESTMENT_TYPE_LABELS,
} from "@/domain/investments";
import { formatMoney } from "@/domain/money";
import { NET_WORTH_ITEM_TYPE_LABELS } from "@/domain/net-worth";
import { listCurrentUserFinancingContracts } from "@/services/finance/financing-imports-service";
import { listCurrentUserInvestmentPositions } from "@/services/finance/investments-service";
import { listCurrentUserNetWorth } from "@/services/finance/net-worth-service";
import type {
  InvestmentPositionSummary,
  FinancingContractSummary,
  NetWorthItem,
  SupportedCurrency,
} from "@/types/database";

export const metadata = { title: "Investimentos" };

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

function PositionsView({
  positions,
}: {
  positions: InvestmentPositionSummary[];
}) {
  const active = positions.filter((position) => position.is_active);
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
      rows: InvestmentPositionSummary[];
    }
  >();
  for (const position of positions) {
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

  if (positions.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <h2 className="text-xl font-extrabold text-slate-950">
          Nenhum investimento cadastrado
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-slate-600">
          Cadastre sua primeira posição manual sem depender de cotações
          automáticas.
        </p>
        <Link
          href="/investments/new"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-4 font-bold text-white"
        >
          Cadastrar posição
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...totals.entries()].map(([currency, currentValue]) => {
          const currencyPositions = active.filter(
            (position) => position.currency === currency,
          );
          const accumulatedCost = currencyPositions.reduce(
            (total, position) =>
              total + position.accumulated_cost_minor,
            0,
          );
          return (
            <article
              key={currency}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-extrabold text-emerald-700">
                Carteira {currency}
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {formatMoney(
                  currentValue,
                  currency,
                  CURRENCY_LOCALES[currency],
                )}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Custo acumulado{" "}
                {formatMoney(
                  accumulatedCost,
                  currency,
                  CURRENCY_LOCALES[currency],
                )}
              </p>
            </article>
          );
        })}
      </section>

      {[...groups.values()].map((group) => (
        <section
          key={`${group.currency}-${group.family}`}
          className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-emerald-700">
              {group.currency}
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              {INVESTMENT_FAMILY_LABELS[group.family]}
            </h2>
          </div>
          <div className="grid divide-y divide-slate-100">
            {group.rows.map((position) => {
              const total = totals.get(position.currency) ?? 0;
              const archived = !position.is_active;
              return (
                <article
                  key={position.id}
                  className={`grid gap-4 p-5 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(7rem,auto))_auto] lg:items-center ${
                    archived ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-extrabold text-slate-950">
                      {position.asset_name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {position.institution} · {CONTEXT_LABELS[position.context]}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {INVESTMENT_TYPE_LABELS[position.investment_type]} ·{" "}
                      {INVESTMENT_CLASS_LABELS[position.investment_class]} ·{" "}
                      {formatInvestmentQuantity(position.quantity)} unidades ·{" "}
                      {formatDate(position.position_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Valor atual</p>
                    <p className="mt-1 font-extrabold text-slate-950">
                      {formatMoney(
                        position.current_value_minor,
                        position.currency,
                        CURRENCY_LOCALES[position.currency],
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Custo</p>
                    <p className="mt-1 font-bold text-slate-800">
                      {formatMoney(
                        position.accumulated_cost_minor,
                        position.currency,
                        CURRENCY_LOCALES[position.currency],
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Resultado</p>
                    <p
                      className={`mt-1 font-bold ${
                        (position.total_result_minor ?? 0) < 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {position.total_result_minor === null
                        ? "Histórico insuficiente"
                        : formatMoney(
                            position.total_result_minor,
                            position.currency,
                            CURRENCY_LOCALES[position.currency],
                          )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      Participação
                    </p>
                    <p className="mt-1 font-bold text-slate-800">
                      {archived
                        ? "Arquivada"
                        : percentage(position.current_value_minor, total)}
                    </p>
                  </div>
                  <details className="relative z-20">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-lg border border-slate-300 px-3 text-sm font-bold">
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
        </section>
      ))}
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
  searchParams: Promise<{ message?: string; tab?: string }>;
}) {
  const [investmentResult, netWorthResult, financingResult, params] = await Promise.all([
    listCurrentUserInvestmentPositions(),
    listCurrentUserNetWorth(),
    listCurrentUserFinancingContracts(),
    searchParams,
  ]);
  const activeTab = params.tab === "financing" ? "financing" : "positions";
  const feedback = params.message ? messages[params.message] : undefined;
  const hasError =
    investmentResult.hasError ||
    netWorthResult.hasError ||
    financingResult.hasError;

  return (
    <main className="mx-auto grid max-w-7xl gap-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Carteira e compromissos
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Investimentos
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Posições e passivos de longo prazo apresentados por moeda, sem
            rentabilidade ou conversão cambial inventada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === "positions" ? (
            <Link
              href="/investments/movements"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-800 hover:bg-slate-50"
            >
              Vincular movimentações
            </Link>
          ) : null}
          <Link
            href={activeTab === "positions" ? "/investments/new" : "/investments/financing-imports/new"}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800"
          >
            {activeTab === "positions"
              ? "Posição sem movimentação"
              : "Importar financiamento"}
          </Link>
        </div>
      </header>

      <nav
        aria-label="Seções de investimentos"
        className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        <Link
          href="/investments"
          aria-current={activeTab === "positions" ? "page" : undefined}
          className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-extrabold ${
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
          className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-extrabold ${
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
        <PositionsView positions={investmentResult.positions} />
      ) : (
        <FinancingsView
          items={netWorthResult.items}
          contracts={financingResult.contracts}
        />
      )}
    </main>
  );
}
