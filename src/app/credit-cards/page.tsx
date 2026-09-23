import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { toggleCreditCardActivity } from "@/app/actions/credit-cards";
import {
  CREDIT_CARD_BRAND_LABELS,
  selectNextCreditCardInvoice,
} from "@/domain/credit-cards";
import { formatMoney } from "@/domain/money";
import { listCurrentUserCreditCards } from "@/services/finance/credit-cards-service";

export const metadata = { title: "Cartões" };

const messages: Record<string, string> = {
  created: "Cartão cadastrado com sucesso.",
  "status-updated": "Status do cartão atualizado.",
  "status-error": "Não foi possível alterar o status do cartão.",
};

export default async function CreditCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ cards, invoices, hasError }, params] = await Promise.all([
    listCurrentUserCreditCards(),
    searchParams,
  ]);
  const feedback = params.message ? messages[params.message] : undefined;

  return (
    <main className="app-page">
      <PageHeader title="Cartões" actions={
        <Link
          href="/credit-cards/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Novo cartão
        </Link>
      } />

      {feedback ? (
        <p
          role={params.message === "status-error" ? "alert" : "status"}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900"
        >
          {feedback}
        </p>
      ) : null}
      {hasError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          Não foi possível carregar os cartões. Tente novamente.
        </p>
      ) : null}
      {!hasError && cards.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-slate-950">
            Nenhum cartão cadastrado
          </h2>
          <p className="mt-2 text-slate-600">
            Cadastre o primeiro cartão para controlar compras e faturas.
          </p>
        </section>
      ) : null}

      <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const nextInvoice = selectNextCreditCardInvoice(
            invoices.filter((invoice) => invoice.credit_card_id === card.id),
          );
          return (
          <article
            key={card.id}
            className={`rounded-xl border border-slate-200 bg-white p-3 ${
              card.is_active ? "" : "opacity-65"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-slate-950">{card.name}</h2>
                <p className="text-xs text-slate-500">
                  {card.issuer} · {CREDIT_CARD_BRAND_LABELS[card.brand]} · final{" "}
                  {card.last_four_digits}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">
                {card.is_active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 border-y border-slate-100 py-2">
              <div>
                <dt className="text-xs text-slate-500">Próxima fatura</dt>
                <dd className="mt-0.5 text-sm font-extrabold text-rose-700">
                  {nextInvoice
                    ? formatMoney(nextInvoice.total_amount, card.currency)
                    : formatMoney(0, card.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Comprometido</dt>
                <dd className="mt-0.5 text-sm font-extrabold text-slate-900">
                  {formatMoney(card.used_limit, card.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Limite disponível</dt>
                <dd className="mt-0.5 text-sm font-extrabold text-emerald-700">
                  {formatMoney(card.available_limit, card.currency)}
                </dd>
              </div>
            </dl>
            <div className="mt-2 flex flex-wrap gap-1">
              <Link
                href={`/credit-cards/${card.id}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-xs font-bold"
              >
                Abrir
              </Link>
              <Link
                href={`/credit-cards/${card.id}/invoices`}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-bold text-blue-700"
              >
                Faturas
              </Link>
              <form action={toggleCreditCardActivity}>
                <input type="hidden" name="id" value={card.id} />
                <input
                  type="hidden"
                  name="active"
                  value={card.is_active ? "false" : "true"}
                />
                <button className="min-h-11 rounded-lg px-3 text-xs font-bold text-blue-700">
                  {card.is_active ? "Inativar" : "Reativar"}
                </button>
              </form>
            </div>
          </article>
          );
        })}
      </section>
    </main>
  );
}
