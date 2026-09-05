import { calculateSavingsRatePercentage } from "@/domain/financial-dashboard";
import { formatMoney } from "@/domain/money";
import type {
  FinancialDashboardInvoice,
  FinancialReportBasis,
  SupportedCurrency,
} from "@/types/database";

function formatPercentage(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function FinancialPulse({
  basis,
  currency,
  locale,
  incomeAmountMinor,
  expenseAmountMinor,
  resultAmountMinor,
  plannedAmountMinor,
  budgetPercentageConsumed,
  recurrenceCount,
  invoices,
}: {
  basis: FinancialReportBasis;
  currency: SupportedCurrency;
  locale: string;
  incomeAmountMinor: number;
  expenseAmountMinor: number;
  resultAmountMinor: number;
  plannedAmountMinor: number;
  budgetPercentageConsumed: number | null;
  recurrenceCount: number;
  invoices: FinancialDashboardInvoice[];
}) {
  const savingsRate = calculateSavingsRatePercentage({
    incomeAmountMinor,
    resultAmountMinor,
  });
  const budgetAvailableMinor = plannedAmountMinor - expenseAmountMinor;
  const overdueInvoices = invoices.filter(
    (invoice) => invoice.effective_status === "overdue",
  ).length;

  return (
    <section
      aria-label="Leitura rápida do mês"
      className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3"
    >
      <article className="border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Capacidade de poupança
        </p>
        <p
          className={`mt-1 text-xl font-black ${
            resultAmountMinor < 0 ? "text-rose-700" : "text-emerald-700"
          }`}
        >
          {savingsRate === null ? "Sem base" : formatPercentage(savingsRate)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {savingsRate === null
            ? "Não houve receita realizada no mês."
            : "Resultado em relação às receitas do mês."}
        </p>
      </article>

      <article className="border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Orçamento
        </p>
        <p className="mt-1 text-xl font-black text-slate-950">
          {basis === "cash"
            ? "Por competência"
            : budgetPercentageConsumed === null
              ? "Não planejado"
              : formatPercentage(budgetPercentageConsumed)}
        </p>
        <p
          className={`mt-1 text-xs ${
            budgetAvailableMinor < 0 ? "text-rose-700" : "text-slate-500"
          }`}
        >
          {basis === "cash"
            ? "O orçamento acompanha o consumo, não a data de pagamento."
            : plannedAmountMinor === 0
              ? "Cadastre valores para comparar o mês."
              : budgetAvailableMinor < 0
                ? `Excesso de ${formatMoney(Math.abs(budgetAvailableMinor), currency, locale)}.`
                : `${formatMoney(budgetAvailableMinor, currency, locale)} ainda disponível.`}
        </p>
      </article>

      <article className="px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Agenda financeira
        </p>
        <p className="mt-1 text-xl font-black text-slate-950">
          {recurrenceCount + invoices.length} compromisso(s)
        </p>
        <p
          className={`mt-1 text-xs ${overdueInvoices ? "text-rose-700" : "text-slate-500"}`}
        >
          {overdueInvoices
            ? `${overdueInvoices} fatura(s) vencida(s) exigem atenção.`
            : `${recurrenceCount} conta(s) a pagar e ${invoices.length} fatura(s) próxima(s).`}
        </p>
      </article>
    </section>
  );
}
