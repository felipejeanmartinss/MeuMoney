import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteNetWorthValuation } from "@/app/actions/net-worth";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CONTEXT_LABELS } from "@/domain/accounts";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import { formatMoney } from "@/domain/money";
import {
  NET_WORTH_ITEM_TYPE_LABELS,
  netWorthItemIdSchema,
} from "@/domain/net-worth";
import {
  getCurrentUserNetWorthItem,
  listCurrentUserNetWorthValuations,
} from "@/services/finance/net-worth-service";

export const metadata = { title: "Histórico patrimonial" };

const messages: Record<string, { text: string; error?: boolean }> = {
  "valuation-deleted": {
    text: "Avaliação excluída e valor atual recalculado quando necessário.",
  },
  "valuation-delete-error": {
    text: "Não foi possível excluir esta avaliação.",
    error: true,
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export default async function NetWorthHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const parsedId = netWorthItemIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const [itemResult, valuationResult, query] = await Promise.all([
    getCurrentUserNetWorthItem(parsedId.data),
    listCurrentUserNetWorthValuations(parsedId.data),
    searchParams,
  ]);
  if (itemResult.hasError || !itemResult.item) notFound();
  if (valuationResult.hasError) {
    throw new Error("Unable to load the net worth valuation history.");
  }

  const item = itemResult.item;
  const feedback = query.message ? messages[query.message] : undefined;

  return (
    <main className="mx-auto grid max-w-4xl gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/net-worth"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para patrimônio
        </Link>
        <p className="mt-5 text-sm font-bold uppercase tracking-widest text-blue-700">
          {NET_WORTH_ITEM_TYPE_LABELS[item.item_type]} ·{" "}
          {CONTEXT_LABELS[item.context]}
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
              Histórico de {item.name}
            </h1>
            <p className="mt-2 text-slate-600">
              Avaliações registradas em {item.currency}, da mais recente para a
              mais antiga.
            </p>
          </div>
          <Link
            href={`/net-worth/${item.id}/edit`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-700 px-4 font-semibold text-blue-700 hover:bg-blue-50"
          >
            Nova avaliação
          </Link>
        </div>
      </div>

      {feedback ? (
        <p
          role={feedback.error ? "alert" : "status"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}

      {valuationResult.valuations.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          Nenhuma avaliação foi registrada.
        </section>
      ) : (
        <ol className="grid gap-4" aria-label="Histórico de avaliações">
          {valuationResult.valuations.map((valuation, index) => {
            const previous = valuationResult.valuations[index + 1];
            const changeMinor = previous
              ? valuation.value_minor - previous.value_minor
              : null;
            return (
              <li
                key={valuation.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <time
                      dateTime={valuation.valuation_date}
                      className="text-sm font-semibold text-slate-600"
                    >
                      {formatDate(valuation.valuation_date)}
                    </time>
                    <p className="mt-1 text-2xl font-extrabold text-slate-950">
                      {formatMoney(
                        valuation.value_minor,
                        valuation.currency,
                        CURRENCY_LOCALES[valuation.currency],
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {changeMinor !== null ? (
                      <p
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                          changeMinor < 0
                            ? "bg-red-50 text-red-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {changeMinor >= 0 ? "+" : ""}
                        {formatMoney(
                          changeMinor,
                          valuation.currency,
                          CURRENCY_LOCALES[valuation.currency],
                        )}{" "}
                        desde a anterior
                      </p>
                    ) : (
                      <p className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
                        Avaliação inicial
                      </p>
                    )}
                    {valuationResult.valuations.length > 1 ? (
                      <form action={deleteNetWorthValuation}>
                        <input type="hidden" name="valuationId" value={valuation.id} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <ConfirmSubmitButton
                          confirmation={`Excluir a avaliação de ${formatDate(valuation.valuation_date)}?`}
                          className="rounded-lg px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
