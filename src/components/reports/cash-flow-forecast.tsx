import { formatMoney } from "@/domain/money";
import type { CashFlowForecastReportEvent } from "@/services/reports/financial-reports-service";
import type { SupportedCurrency } from "@/types/database";
import { formatIsoDatePtBr } from "@/utils/dates";
export { CashFlowForecastChart } from "./cash-flow-forecast-chart";

const EVENT_LABELS: Record<CashFlowForecastReportEvent["kind"], string> = {
  scheduled: "Lançamento",
  recurrence: "Recorrência",
  "card-invoice": "Fatura",
  transfer: "Transferência",
  "variable-average": "Média variável",
};

export function CashFlowForecastEventTable({
  events,
  currency,
}: {
  events: readonly CashFlowForecastReportEvent[];
  currency: SupportedCurrency;
}) {
  if (!events.length) {
    return (
      <p className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Nenhum lançamento compõe a projeção neste período.
      </p>
    );
  }
  return (
    <div className="border-t border-slate-200">
      <div className="px-4 py-3">
        <h3 className="font-black text-slate-950">Lançamentos considerados</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Ordem cronológica, com o saldo consolidado após cada evento.
        </p>
      </div>
      <div className="max-h-[38rem] overflow-auto border-t border-slate-200">
        <table className="w-full min-w-[900px] border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
            <tr className="border-b border-slate-300">
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Lançamento</th>
              <th className="px-3 py-2 text-left">Conta</th>
              <th className="px-3 py-2 text-left">Origem</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Saldo da conta</th>
              <th className="px-3 py-2 text-right">Saldo consolidado</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {formatIsoDatePtBr(event.date)}
                </td>
                <th scope="row" className="px-3 py-2 text-left font-semibold text-slate-900">
                  {event.description}
                  {event.categoryLabel ? (
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {event.categoryLabel}
                    </span>
                  ) : null}
                </th>
                <td className="px-3 py-2 text-slate-600">{event.accountName}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${event.conservativeOnly ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                    {EVENT_LABELS[event.kind]}
                  </span>
                </td>
                <td className={`px-3 py-2 text-right font-bold ${event.amountMinor !== null && event.amountMinor < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {event.amountMinor === null ? "—" : formatMoney(event.amountMinor, currency)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-700">
                  {event.accountBalanceMinor === null ? "—" : formatMoney(event.accountBalanceMinor, currency)}
                </td>
                <td className={`px-3 py-2 text-right font-black ${event.totalBalanceMinor < 0 ? "text-rose-700" : "text-slate-950"}`}>
                  {formatMoney(event.totalBalanceMinor, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
