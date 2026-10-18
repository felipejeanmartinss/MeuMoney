"use client";

import { useState } from "react";
import Link from "next/link";
import { closeCreditCardInvoice } from "@/app/actions/credit-cards";

export type RecurrenceCalendarEvent = {
  id: string;
  date: string;
  description: string;
  accountName: string;
  amountLabel: string;
  transactionType: "income" | "expense" | "transfer";
  href?: string;
  invoice?: { cardId: string; invoiceId: string; closingDate: string; status: string; hasLinkedAccount: boolean };
};

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const EVENT_COLORS = { income: "bg-emerald-500", expense: "bg-rose-500", transfer: "bg-blue-500" } as const;
const EVENT_TONES = { income: "border-emerald-200 bg-emerald-50", expense: "border-rose-200 bg-rose-50", transfer: "border-blue-200 bg-blue-50" } as const;

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function RecurrenceCalendar({
  month,
  events,
  today,
}: {
  month: string;
  events: RecurrenceCalendarEvent[];
  today: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dayCells = Array.from(
    { length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 },
    (_, index) => {
      const day = index - firstWeekday + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    },
  );
  const hoveredEvent = events.find((event) => event.id === hoveredId);
  const eventsByDate = new Map<string, RecurrenceCalendarEvent[]>();
  for (const event of events) {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  }

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid grid-cols-7 text-center text-[0.68rem] font-black uppercase text-slate-400">
          {WEEKDAYS.map((weekday, index) => (
            <span key={`${weekday}-${index}`} className="py-2">
              {weekday}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dayCells.map((day, index) => {
            if (day === null) {
              return <span key={`empty-${index}`} className="aspect-square" />;
            }
            const key = dateKey(year, monthNumber, day);
            const dayEvents = eventsByDate.get(key) ?? [];
            const highlighted = hoveredEvent?.date === key;
            return (
              <div
                key={key}
                className={`relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-xl border text-sm font-extrabold transition ${
                  highlighted
                    ? "scale-105 border-slate-950 bg-slate-950 text-white shadow-lg"
                    : key >= today || dayEvents.length
                      ? "border-slate-300 bg-white text-slate-950"
                      : "border-transparent text-slate-500"
                }`}
              >
                <time dateTime={key}>{day}</time>
                {dayEvents.length ? (
                  <span className="mt-1 flex max-w-full gap-0.5" aria-label={`${dayEvents.length} ocorrência(s)`}>
                    {dayEvents.slice(0, 4).map((event) => (
                      <span
                        key={event.id}
                        title={`${event.description}: ${event.amountLabel}`}
                        className={`size-1.5 rounded-full ${EVENT_COLORS[event.transactionType]}`}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {events.length ? (
        <ol className="grid content-start gap-2 sm:grid-cols-2">
          {events.map((event) => {
            const active = event.id === hoveredId;
            return (
              <li key={event.id}>
                <Link
                  href={event.href ?? "/recurring-transactions"}
                  onMouseEnter={() => setHoveredId(event.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(event.id)}
                  onBlur={() => setHoveredId(null)}
                  className={`relative grid w-full grid-cols-[auto_1fr] gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? `${EVENT_TONES[event.transactionType]} shadow-md`
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-1 size-2.5 rounded-full ${EVENT_COLORS[event.transactionType]}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-slate-950">
                      {event.description}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {event.date.slice(8, 10)}/{event.date.slice(5, 7)} · {event.accountName}
                    </span>
                    <span
                      className={`mt-1 block text-sm font-extrabold ${
                        event.transactionType === "income" ? "text-emerald-700"
                          : event.transactionType === "transfer" ? "text-blue-700" : "text-rose-700"
                      }`}
                    >
                      {event.amountLabel}
                    </span>
                  </span>
                  {active ? (
                    <span className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white shadow-lg">
                      Destacado no dia {event.date.slice(8, 10)}
                    </span>
                  ) : null}
                </Link>
                {event.invoice?.status === "open" && event.invoice.closingDate <= today ? (
                  event.invoice.hasLinkedAccount ? <form action={closeCreditCardInvoice} className="mt-1 text-right">
                    <input type="hidden" name="cardId" value={event.invoice.cardId} />
                    <input type="hidden" name="invoiceId" value={event.invoice.invoiceId} />
                    <button className="text-xs font-bold text-emerald-800 hover:underline">Fechar fatura e prever pagamento →</button>
                  </form> : <Link href={`/credit-cards/${event.invoice.cardId}/edit`} className="mt-1 block text-right text-xs font-bold text-amber-800 hover:underline">Definir conta do cartão para prever pagamento →</Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Nenhuma ocorrência prevista neste mês.
        </p>
      )}
    </div>
  );
}
