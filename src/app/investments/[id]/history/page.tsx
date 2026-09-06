import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteInvestmentCashFlow } from "@/app/actions/investments";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import {
  formatInvestmentQuantity,
  INVESTMENT_CASH_FLOW_LABELS,
  INVESTMENT_CLASS_LABELS,
  INVESTMENT_INCOME_TYPE_LABELS,
  investmentPositionIdSchema,
} from "@/domain/investments";
import { formatMoney } from "@/domain/money";
import {
  getCurrentUserInvestmentPosition,
  listCurrentUserInvestmentHistory,
} from "@/services/finance/investments-service";

export const metadata = { title: "Histórico do investimento" };

const messages: Record<string, { text: string; error?: boolean }> = {
  "flow-created": { text: "Movimento registrado e posição atualizada." },
  "flow-deleted": { text: "Movimento excluído e efeito na posição revertido." },
  "flow-delete-error": {
    text: "Não foi possível excluir este movimento.",
    error: true,
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export default async function InvestmentHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const parsedId = investmentPositionIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const [positionResult, historyResult, query] = await Promise.all([
    getCurrentUserInvestmentPosition(parsedId.data),
    listCurrentUserInvestmentHistory(parsedId.data),
    searchParams,
  ]);
  if (positionResult.hasError || !positionResult.position) notFound();
  if (historyResult.hasError) {
    throw new Error("Unable to load investment history.");
  }

  const position = positionResult.position;
  const feedback = query.message ? messages[query.message] : undefined;

  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/investments"
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Voltar para investimentos
        </Link>
        <p className="mt-5 text-sm font-bold uppercase tracking-widest text-blue-700">
          {INVESTMENT_CLASS_LABELS[position.investment_class]} ·{" "}
          {position.currency}
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
              Histórico de {position.asset_name}
            </h1>
            <p className="mt-2 text-slate-600">{position.institution}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/investments/${position.id}/edit`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Atualizar posição
            </Link>
            <Link
              href={`/investments/${position.id}/history/new`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800"
            >
              Registrar aporte, resgate ou renda
            </Link>
          </div>
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

      <section aria-labelledby="cash-flow-history-title">
        <h2
          id="cash-flow-history-title"
          className="text-2xl font-extrabold text-slate-950"
        >
          Aportes, resgates e rendas
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Aportes e resgates atualizam a posição; rendas ficam separadas do principal.
        </p>
        {historyResult.cashFlows.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Nenhum aporte, resgate ou renda foi registrado.
          </p>
        ) : (
          <ol className="mt-4 grid gap-3">
            {historyResult.cashFlows.map((cashFlow) => (
              <li
                key={cashFlow.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-blue-700">
                      {cashFlow.cash_flow_type === "income" && cashFlow.income_type
                        ? INVESTMENT_INCOME_TYPE_LABELS[cashFlow.income_type]
                        : INVESTMENT_CASH_FLOW_LABELS[cashFlow.cash_flow_type]}
                    </p>
                    <time
                      dateTime={cashFlow.cash_flow_date}
                      className="mt-1 block text-sm text-slate-500"
                    >
                      {formatDate(cashFlow.cash_flow_date)}
                    </time>
                  </div>
                  <div className="flex items-center gap-4 sm:justify-end sm:text-right">
                    <div>
                    <p className="text-xl font-extrabold text-slate-950">
                      {formatMoney(
                        cashFlow.amount_minor,
                        position.currency,
                        CURRENCY_LOCALES[position.currency],
                      )}
                    </p>
                    {cashFlow.quantity ? (
                      <p className="mt-1 text-sm text-slate-500">
                        {formatInvestmentQuantity(cashFlow.quantity)} unidades
                      </p>
                    ) : null}
                    {cashFlow.transaction_id ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        {cashFlow.source_transfer_id
                          ? "Vinculado à transferência e ao extrato"
                          : "Vinculado ao extrato da conta"}
                      </p>
                    ) : null}
                    </div>
                    <form action={deleteInvestmentCashFlow}>
                      <input type="hidden" name="cashFlowId" value={cashFlow.id} />
                      <input type="hidden" name="positionId" value={position.id} />
                      <ConfirmSubmitButton
                        confirmation={`Excluir este ${INVESTMENT_CASH_FLOW_LABELS[cashFlow.cash_flow_type].toLocaleLowerCase("pt-BR")}? O efeito na posição também será revertido.`}
                        className="rounded-lg px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Excluir
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
                {cashFlow.notes ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {cashFlow.notes}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="position-history-title">
        <h2
          id="position-history-title"
          className="text-2xl font-extrabold text-slate-950"
        >
          Fotografias da posição
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Quantidade, custo e valor conhecidos em cada atualização.
        </p>
        <ol className="mt-4 grid gap-3">
          {historyResult.snapshots.map((snapshot, index) => (
            <li
              key={snapshot.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <time
                    dateTime={snapshot.position_date}
                    className="text-sm font-semibold text-slate-600"
                  >
                    {formatDate(snapshot.position_date)}
                  </time>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatInvestmentQuantity(snapshot.quantity)} unidades
                  </p>
                </div>
                <dl className="grid gap-1 text-sm sm:text-right">
                  <div>
                    <dt className="inline text-slate-500">Custo: </dt>
                    <dd className="inline font-semibold text-slate-950">
                      {formatMoney(
                        snapshot.accumulated_cost_minor,
                        snapshot.currency,
                        CURRENCY_LOCALES[snapshot.currency],
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-500">Valor atual: </dt>
                    <dd className="inline font-semibold text-slate-950">
                      {formatMoney(
                        snapshot.current_value_minor,
                        snapshot.currency,
                        CURRENCY_LOCALES[snapshot.currency],
                      )}
                    </dd>
                  </div>
                </dl>
                <span className="text-xs font-semibold text-slate-500">
                  {index === historyResult.snapshots.length - 1
                    ? "Posição inicial"
                    : "Atualização"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
