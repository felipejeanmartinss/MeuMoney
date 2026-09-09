import Link from "next/link";
import { toggleCreditCardActivity } from "@/app/actions/credit-cards";
import { CREDIT_CARD_BRAND_LABELS } from "@/domain/credit-cards";
import { formatMoney } from "@/domain/money";
import { listCurrentUserCreditCards } from "@/services/finance/credit-cards-service";
import { formatReferenceMonthPtBr } from "@/utils/dates";

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
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-blue-700">
            Crédito
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-950 sm:text-4xl">
            Cartões
          </h1>
          <p className="mt-2 text-slate-600">
            Limites derivados de todas as parcelas ativas ainda não pagas.
          </p>
        </div>
        <Link
          href="/credit-cards/new"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
        >
          Novo cartão
        </Link>
      </div>

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
          Não foi possível carregar os cartões. Confirme a migration da Sprint 4.
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

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const nextInvoice = invoices.find(
            (invoice) => invoice.credit_card_id === card.id,
          );
          return (
          <article
            key={card.id}
            className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${
              card.is_active ? "" : "opacity-65"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{card.name}</h2>
                <p className="text-sm text-slate-600">
                  {card.issuer} · {CREDIT_CARD_BRAND_LABELS[card.brand]} · final{" "}
                  {card.last_four_digits}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">
                {card.is_active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-slate-100 py-4">
              <div>
                <dt className="text-xs text-slate-500">Limite</dt>
                <dd className="font-bold">{formatMoney(card.credit_limit, card.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Saldo devedor</dt>
                <dd className="font-bold text-rose-700">
                  {formatMoney(card.current_balance_minor, card.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Disponível</dt>
                <dd className="font-bold text-emerald-700">
                  {formatMoney(card.available_limit, card.currency)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-slate-600">
              Próxima fatura:{" "}
              <strong className="text-slate-900">
                {nextInvoice
                  ? `${formatReferenceMonthPtBr(nextInvoice.reference_month)} · ${formatMoney(
                      nextInvoice.total_amount,
                      card.currency,
                    )}`
                  : "nenhuma"}
              </strong>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/credit-cards/${card.id}`}
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold"
              >
                Abrir
              </Link>
              <Link
                href={`/credit-cards/${card.id}/invoices`}
                className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-blue-700"
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
                <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-blue-700">
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
