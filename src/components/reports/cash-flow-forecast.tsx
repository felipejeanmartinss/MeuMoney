import { formatMoney } from "@/domain/money";
import type {
  CashFlowForecastReportAccount,
  CashFlowForecastReportEvent,
  CashFlowForecastReportPoint,
} from "@/services/reports/financial-reports-service";
import type { SupportedCurrency } from "@/types/database";
import { formatIsoDatePtBr } from "@/utils/dates";

const SERIES_COLORS = [
  "#047857",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#ea580c",
];

const EVENT_LABELS: Record<CashFlowForecastReportEvent["kind"], string> = {
  scheduled: "Lançamento",
  recurrence: "Recorrência",
  "card-invoice": "Fatura",
  transfer: "Transferência",
  "variable-average": "Média variável",
};

function compactMoney(amountMinor: number, currency: SupportedCurrency) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${value}T12:00:00Z`))
    .replace(".", "");
}

export function CashFlowForecastChart({
  accounts,
  points,
  currency,
}: {
  accounts: readonly CashFlowForecastReportAccount[];
  points: readonly CashFlowForecastReportPoint[];
  currency: SupportedCurrency;
}) {
  if (!points.length) {
    return (
      <p className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Não há datas no período selecionado.
      </p>
    );
  }
  const series = [
    {
      key: "total",
      label: "Total consolidado",
      color: "#0f172a",
      width: 3,
      values: points.map((point) => point.totalBalanceMinor),
    },
    ...accounts.map((account, index) => ({
      key: account.id,
      label: account.name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      width: 1.75,
      values: points.map((point) => point.balancesByAccount[account.id]),
    })),
  ];
  const values = series.flatMap((item) =>
    item.values.filter((value): value is number => value !== null),
  );
  const rawMinimum = Math.min(...values, 0);
  const rawMaximum = Math.max(...values, 0);
  const spread = Math.max(rawMaximum - rawMinimum, 100);
  const minimum = rawMinimum - spread * 0.08;
  const maximum = rawMaximum + spread * 0.08;
  const width = 1_000;
  const height = 330;
  const left = 92;
  const right = 24;
  const top = 22;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index: number) =>
    left + (index / Math.max(1, points.length - 1)) * chartWidth;
  const y = (value: number) =>
    top + ((maximum - value) / (maximum - minimum)) * chartHeight;
  const yTicks = Array.from({ length: 5 }, (_, index) =>
    Math.round(maximum - ((maximum - minimum) * index) / 4),
  );
  const xTickIndexes = [...new Set(
    Array.from({ length: Math.min(6, points.length) }, (_, index) =>
      Math.round((index * (points.length - 1)) / Math.max(1, Math.min(5, points.length - 1))),
    ),
  )];

  return (
    <div className="border-t border-slate-200 p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-700">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label="Evolução projetada dos saldos por conta e do total consolidado"
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[760px]"
        >
          <rect x={left} y={top} width={chartWidth} height={chartHeight} fill="#f8fafc" />
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={left - 10}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#64748b"
              >
                {compactMoney(tick, currency)}
              </text>
            </g>
          ))}
          {minimum < 0 && maximum > 0 ? (
            <line
              x1={left}
              x2={width - right}
              y1={y(0)}
              y2={y(0)}
              stroke="#f43f5e"
              strokeDasharray="5 4"
            />
          ) : null}
          {series.map((item) => {
            const segments: string[] = [];
            let current = "";
            item.values.forEach((value, index) => {
              if (value === null) {
                if (current) segments.push(current);
                current = "";
                return;
              }
              current += `${current ? " L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`;
            });
            if (current) segments.push(current);
            return segments.map((path, index) => (
              <path
                key={`${item.key}:${index}`}
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ));
          })}
          {xTickIndexes.map((index) => (
            <text
              key={points[index].date}
              x={x(index)}
              y={height - 18}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
            >
              {shortDate(points[index].date)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

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
