"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatMoney } from "@/domain/money";
import type {
  CashFlowForecastReportAccount,
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

type ChartSeries = {
  key: string;
  label: string;
  color: string;
  width: number;
  values: Array<number | null>;
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

function lineSegments(
  values: Array<number | null>,
  x: (index: number) => number,
  y: (value: number) => number,
) {
  const segments: string[] = [];
  let current = "";
  values.forEach((value, index) => {
    if (value === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? " L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`;
  });
  if (current) segments.push(current);
  return segments;
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
  const [hovered, setHovered] = useState<{
    index: number;
    seriesKey: string;
  } | null>(null);

  if (!points.length) {
    return (
      <p className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Não há datas no período selecionado.
      </p>
    );
  }

  const series: ChartSeries[] = [
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
  const xTickIndexes = [
    ...new Set(
      Array.from({ length: Math.min(6, points.length) }, (_, index) =>
        Math.round(
          (index * (points.length - 1)) /
            Math.max(1, Math.min(5, points.length - 1)),
        ),
      ),
    ),
  ];
  const zeroY = y(Math.max(minimum, Math.min(maximum, 0)));
  const totalValues = series[0].values as number[];
  const totalAreaPath = [
    `M${x(0).toFixed(2)},${zeroY.toFixed(2)}`,
    ...totalValues.map(
      (value, index) =>
        `L${x(index).toFixed(2)},${y(value).toFixed(2)}`,
    ),
    `L${x(points.length - 1).toFixed(2)},${zeroY.toFixed(2)} Z`,
  ].join(" ");
  const hoveredSeries = hovered
    ? series.find((item) => item.key === hovered.seriesKey) ?? null
    : null;
  const hoveredValue =
    hovered && hoveredSeries ? hoveredSeries.values[hovered.index] : null;
  const tooltipX = hovered
    ? Math.min(width - right - 218, Math.max(left + 8, x(hovered.index) + 12))
    : 0;
  const tooltipY =
    hoveredValue === null
      ? top
      : Math.min(height - bottom - 72, Math.max(top + 6, y(hoveredValue) - 34));

  function updateHover(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * height;
    const index = Math.max(
      0,
      Math.min(
        points.length - 1,
        Math.round(((pointerX - left) / chartWidth) * (points.length - 1)),
      ),
    );
    const nearest = series.reduce<ChartSeries | null>((current, item) => {
      const value = item.values[index];
      if (value === null) return current;
      if (!current) return item;
      const currentValue = current.values[index];
      if (currentValue === null) return item;
      return Math.abs(y(value) - pointerY) < Math.abs(y(currentValue) - pointerY)
        ? item
        : current;
    }, null);
    if (nearest) setHovered({ index, seriesKey: nearest.key });
  }

  function handleKeyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    setHovered((current) => ({
      index: Math.max(
        0,
        Math.min(points.length - 1, (current?.index ?? 0) + offset),
      ),
      seriesKey: current?.seriesKey ?? "total",
    }));
  }

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
      <p className="mb-2 text-xs text-slate-500">
        Passe sobre uma linha para consultar o saldo em cada data.
      </p>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label="Evolução projetada dos saldos por conta e do total consolidado. Use as setas do teclado para percorrer as datas."
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[760px] touch-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          tabIndex={0}
          onPointerMove={updateHover}
          onPointerLeave={() => setHovered(null)}
          onFocus={() => setHovered((current) => current ?? { index: 0, seriesKey: "total" })}
          onBlur={() => setHovered(null)}
          onKeyDown={handleKeyboard}
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
          <path d={totalAreaPath} fill="#0f172a" fillOpacity="0.09" />
          {series.slice(1).map((item) =>
            lineSegments(item.values, x, y).map((path, index) => (
              <path
                key={`${item.key}:${index}`}
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )),
          )}
          {lineSegments(series[0].values, x, y).map((path, index) => (
            <path
              key={`total:${index}`}
              d={path}
              fill="none"
              stroke={series[0].color}
              strokeWidth={series[0].width}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hovered && hoveredSeries && hoveredValue !== null ? (
            <g aria-live="polite">
              <line
                x1={x(hovered.index)}
                x2={x(hovered.index)}
                y1={top}
                y2={height - bottom}
                stroke="#64748b"
                strokeDasharray="4 4"
                strokeOpacity="0.7"
              />
              <circle
                cx={x(hovered.index)}
                cy={y(hoveredValue)}
                r="5"
                fill="white"
                stroke={hoveredSeries.color}
                strokeWidth="3"
              />
              <foreignObject x={tooltipX} y={tooltipY} width="210" height="66">
                <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
                  <div className="font-semibold text-slate-500">
                    {formatIsoDatePtBr(points[hovered.index].date)}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-bold text-slate-800">
                      {hoveredSeries.label}
                    </span>
                    <span className="shrink-0 font-black tabular-nums text-slate-950">
                      {formatMoney(hoveredValue, currency)}
                    </span>
                  </div>
                </div>
              </foreignObject>
            </g>
          ) : null}
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
