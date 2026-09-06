import Link from "next/link";
import {
  deleteNetWorthItem,
  toggleNetWorthItemStatus,
} from "@/app/actions/net-worth";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { SavingsSimulator } from "@/components/net-worth/savings-simulator";
import { CONTEXT_LABELS } from "@/domain/accounts";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import {
  calculateExecutiveNetWorthByCurrency,
  NET_WORTH_ITEM_TYPE_LABELS,
} from "@/domain/net-worth";
import { listCurrentUserNetWorth } from "@/services/finance/net-worth-service";
import type {
  ExecutiveNetWorthCurrencySummary,
} from "@/domain/net-worth";
import type { NetWorthItem } from "@/types/database";

export const metadata = { title: "Patrimônio" };

const messages: Record<string, string> = {
  created: "Item patrimonial cadastrado com sucesso.",
  updated: "Item e avaliação atualizados com sucesso.",
  "status-updated": "Estado do item patrimonial atualizado com sucesso.",
  "status-error": "Não foi possível alterar o estado do item patrimonial.",
  deleted: "Item patrimonial e seu histórico foram excluídos.",
  "delete-error": "Não foi possível excluir o item patrimonial.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function Composition({
  summary,
}: {
  summary: ExecutiveNetWorthCurrencySummary;
}) {
  const components = [
    {
      label: "Contas transacionais",
      value: summary.transactionalAssetsMinor,
      kind: "asset",
    },
    {
      label: "Investimentos",
      value: summary.investmentsMinor,
      kind: "asset",
    },
    {
      label: "Bens manuais",
      value: summary.manualAssetsMinor,
      kind: "asset",
    },
    {
      label: "Saldos de cartões",
      value: summary.cardBalancesMinor,
      kind: "liability",
    },
    {
      label: "Financiamentos e dívidas",
      value:
        summary.otherLiabilitiesMinor +
        summary.transactionalLiabilitiesMinor,
      kind: "liability",
    },
  ] as const;
  const maximum = Math.max(1, ...components.map((row) => row.value));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-slate-950">
        Composição patrimonial
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Cada componente entra uma única vez no cálculo.
      </p>
      <div className="mt-5 grid gap-4">
        {components.map((component) => (
          <article key={component.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-slate-700">
                {component.label}
              </span>
              <span
                className={`font-extrabold ${
                  component.kind === "asset"
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {formatMoney(
                  component.value,
                  summary.currency,
                  CURRENCY_LOCALES[summary.currency],
                )}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  component.kind === "asset"
                    ? "bg-emerald-600"
                    : "bg-rose-500"
                }`}
                style={{
                  width: `${Number(
                    (BigInt(component.value) * 100n) / BigInt(maximum),
                  )}%`,
                }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ItemsList({
  title,
  items,
}: {
  title: string;
  items: NetWorthItem[];
}) {
  return (
    <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-black text-slate-950">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">
          Nenhum item neste grupo.
        </p>
      ) : (
        <div className="grid divide-y divide-slate-100">
          {items.map((item) => {
            const archived = !item.is_active;
            return (
              <article
                key={item.id}
                className={`grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 ${
                  archived ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0">
                  <h4 className="truncate font-extrabold text-slate-950">
                    {item.name}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {NET_WORTH_ITEM_TYPE_LABELS[item.item_type]} ·{" "}
                    {CONTEXT_LABELS[item.context]} · {formatDate(item.valuation_date)}
                  </p>
                </div>
                <p className="font-black text-slate-950">
                  {formatMoney(
                    item.current_value_minor,
                    item.currency,
                    CURRENCY_LOCALES[item.currency],
                  )}
                </p>
                <details className="relative">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-lg border border-slate-300 px-3 text-sm font-bold">
                    Ações
                  </summary>
                  <div className="z-10 mt-2 grid min-w-36 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:absolute sm:right-0">
                    <Link
                      href={`/net-worth/${item.id}/edit`}
                      className="rounded-lg px-3 py-2 text-sm font-bold hover:bg-slate-100"
                    >
                      Editar
                    </Link>
                    <Link
                      href={`/net-worth/${item.id}/history`}
                      className="rounded-lg px-3 py-2 text-sm font-bold hover:bg-slate-100"
                    >
                      Histórico
                    </Link>
                    <form action={toggleNetWorthItemStatus}>
                      <input type="hidden" name="id" value={item.id} />
                      <input
                        type="hidden"
                        name="archive"
                        value={archived ? "false" : "true"}
                      />
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100">
                        {archived ? "Reativar" : "Arquivar"}
                      </button>
                    </form>
                    <form action={deleteNetWorthItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <ConfirmSubmitButton
                        confirmation={`Excluir definitivamente “${item.name}” e todo o histórico de avaliações?`}
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
      )}
    </section>
  );
}

export default async function NetWorthPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; tab?: string }>;
}) {
  const [result, params] = await Promise.all([
    listCurrentUserNetWorth(),
    searchParams,
  ]);
  const activeTab = params.tab === "simulator" ? "simulator" : "overview";
  const feedback = params.message ? messages[params.message] : undefined;
  const feedbackIsError = params.message?.endsWith("error") ?? false;
  const executive = calculateExecutiveNetWorthByCurrency({
    currentUserId: result.userId,
    accounts: result.accounts.map((account) => ({
      userId: account.user_id,
      currency: account.currency,
      currentBalanceMinor: account.current_balance_minor,
      active: !account.archived_at,
    })),
    summaries: result.summaries.map((summary) => ({
      userId: summary.user_id,
      currency: summary.currency,
      manualAssetsMinor: summary.manual_assets_minor,
      investmentsMinor: summary.investments_minor,
      liabilitiesMinor: summary.liabilities_minor,
    })),
    cardBalances: result.cardBalances.map((card) => ({
      userId: card.user_id,
      currency: card.currency,
      currentBalanceMinor: card.current_balance_minor,
    })),
  });
  const assets = result.items.filter((item) => item.kind === "asset");
  const liabilities = result.items.filter((item) => item.kind === "liability");

  return (
    <main className="mx-auto grid max-w-7xl gap-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            Visão patrimonial
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Patrimônio
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Contas, investimentos, bens e passivos consolidados separadamente
            por moeda.
          </p>
        </div>
        {activeTab === "overview" ? (
          <Link
            href="/net-worth/new"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 font-bold text-white hover:bg-emerald-800"
          >
            Novo item
          </Link>
        ) : null}
      </header>

      <nav
        aria-label="Seções do patrimônio"
        className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
      >
        <Link
          href="/net-worth"
          aria-current={activeTab === "overview" ? "page" : undefined}
          className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-extrabold ${
            activeTab === "overview"
              ? "bg-emerald-700 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Visão geral
        </Link>
        <Link
          href="/net-worth?tab=simulator"
          aria-current={activeTab === "simulator" ? "page" : undefined}
          className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-extrabold ${
            activeTab === "simulator"
              ? "bg-emerald-700 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Simulador de poupança
        </Link>
      </nav>

      {feedback ? (
        <p
          role={feedbackIsError ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedbackIsError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback}
        </p>
      ) : null}
      {result.hasError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          Parte do patrimônio não pôde ser carregada. Tente novamente.
        </p>
      ) : null}

      {activeTab === "simulator" ? <SavingsSimulator /> : null}

      {activeTab === "overview" && executive.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-black text-slate-950">
            Seu patrimônio começará aqui
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-slate-600">
            Cadastre uma conta, investimento, bem ou passivo para compor a
            visão executiva.
          </p>
        </section>
      ) : null}

      {activeTab === "overview"
        ? executive.map((summary) => (
            <section
              key={summary.currency}
              aria-labelledby={`net-worth-${summary.currency}`}
              className="grid gap-5"
            >
              <header className="flex items-end justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-sm font-extrabold text-emerald-700">
                    {summary.currency}
                  </p>
                  <h2
                    id={`net-worth-${summary.currency}`}
                    className="mt-1 text-2xl font-black text-slate-950"
                  >
                    Resumo patrimonial
                  </h2>
                </div>
                <p className="text-sm text-slate-500">
                  Sem conversão cambial implícita
                </p>
              </header>
              <div className="grid gap-3 sm:grid-cols-3">
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-bold text-slate-500">Ativos</p>
                  <p className="mt-2 text-2xl font-black text-emerald-700">
                    {formatMoney(
                      summary.assetsMinor,
                      summary.currency,
                      CURRENCY_LOCALES[summary.currency],
                    )}
                  </p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-bold text-slate-500">Passivos</p>
                  <p className="mt-2 text-2xl font-black text-rose-700">
                    {formatMoney(
                      summary.liabilitiesMinor,
                      summary.currency,
                      CURRENCY_LOCALES[summary.currency],
                    )}
                  </p>
                </article>
                <article className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
                  <p className="text-sm font-bold text-slate-300">
                    Patrimônio líquido
                  </p>
                  <p
                    className={`mt-2 text-2xl font-black ${
                      summary.netWorthMinor < 0
                        ? "text-rose-300"
                        : "text-white"
                    }`}
                  >
                    {formatMoney(
                      summary.netWorthMinor,
                      summary.currency,
                      CURRENCY_LOCALES[summary.currency],
                    )}
                  </p>
                </article>
              </div>
              <Composition summary={summary} />
            </section>
          ))
        : null}

      {activeTab === "overview" && result.items.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <ItemsList title="Bens manuais" items={assets} />
          <ItemsList
            title="Financiamentos e demais passivos"
            items={liabilities}
          />
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <aside className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          Regra de consolidação: saldos positivos de contas, investimentos e
          bens manuais formam os ativos. Saldos negativos, faturas pendentes,
          financiamentos e outras dívidas formam os passivos. O total
          patrimonial pré-calculado não é somado novamente, evitando dupla
          contagem.
        </aside>
      ) : null}
    </main>
  );
}
