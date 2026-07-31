"use client";

import { useState, type FormEvent } from "react";
import { formatMoney, parseMoneyInputToMinor } from "@/domain/money";
import {
  parseAnnualRateToBps,
  projectSavings,
  type SavingsProjectionPoint,
} from "@/domain/savings-simulator";
import type { SupportedCurrency } from "@/types/database";

function graphHeight(value: number, maximum: number) {
  if (maximum <= 0) return 0;
  return Number((BigInt(value) * 100n) / BigInt(maximum));
}

export function SavingsSimulator() {
  const [currency, setCurrency] = useState<SupportedCurrency>("BRL");
  const [result, setResult] = useState<{
    projectedMinor: number;
    contributedMinor: number;
    earningsMinor: number;
    points: SavingsProjectionPoint[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const projection = projectSavings({
        initialMinor: parseMoneyInputToMinor(
          String(data.get("initialValue") ?? ""),
        ),
        monthlyContributionMinor: parseMoneyInputToMinor(
          String(data.get("monthlyContribution") ?? ""),
        ),
        annualRateBps: parseAnnualRateToBps(
          String(data.get("annualRate") ?? ""),
        ),
        years: Number(data.get("years")),
      });
      setResult(projection);
      setError(null);
    } catch (caughtError) {
      setResult(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível calcular a projeção.",
      );
    }
  }

  const maximum = Math.max(
    1,
    ...(result?.points.map((point) => point.projectedMinor) ?? []),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">
          Simulador de poupança
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Projeção educativa com capitalização mensal. Nenhuma simulação é
          salva.
        </p>
        <form onSubmit={calculate} className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Moeda
            <select
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value as SupportedCurrency)
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
            >
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Valor inicial
            <input
              name="initialValue"
              inputMode="decimal"
              defaultValue="10.000,00"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Aporte mensal
            <input
              name="monthlyContribution"
              inputMode="decimal"
              defaultValue="1.000,00"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Taxa anual nominal (%)
            <input
              name="annualRate"
              inputMode="decimal"
              defaultValue="10,00"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Prazo em anos
            <input
              name="years"
              type="number"
              min="1"
              max="100"
              defaultValue="10"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
              required
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}
          <button className="min-h-12 rounded-xl bg-emerald-700 px-4 font-extrabold text-white hover:bg-emerald-800">
            Calcular projeção
          </button>
        </form>
      </section>

      <section
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-live="polite"
      >
        <h2 className="text-xl font-black text-slate-950">Projeção</h2>
        {!result ? (
          <div className="mt-6 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
            Preencha os dados e calcule para visualizar o resultado anual.
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <article className="rounded-xl bg-slate-950 p-4 text-white">
                <p className="text-xs font-bold text-slate-300">
                  Valor projetado
                </p>
                <p className="mt-2 text-xl font-black">
                  {formatMoney(result.projectedMinor, currency)}
                </p>
              </article>
              <article className="rounded-xl bg-slate-100 p-4">
                <p className="text-xs font-bold text-slate-500">
                  Total aportado
                </p>
                <p className="mt-2 text-xl font-black text-slate-950">
                  {formatMoney(result.contributedMinor, currency)}
                </p>
              </article>
              <article className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">
                  Rendimento estimado
                </p>
                <p className="mt-2 text-xl font-black text-emerald-800">
                  {formatMoney(result.earningsMinor, currency)}
                </p>
              </article>
            </div>
            <div
              className="mt-8 flex min-h-64 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-1"
              role="img"
              aria-label="Evolução anual do valor projetado"
            >
              {result.points.map((point) => (
                <div
                  key={point.year}
                  className="grid min-w-14 flex-1 grid-rows-[13rem_auto] items-end gap-2"
                >
                  <div className="flex h-full items-end justify-center">
                    <div
                      className="w-7 rounded-t-lg bg-emerald-600 sm:w-10"
                      style={{
                        height: `${Math.max(
                          2,
                          graphHeight(point.projectedMinor, maximum),
                        )}%`,
                      }}
                      title={`Ano ${point.year}: ${formatMoney(
                        point.projectedMinor,
                        currency,
                      )}`}
                    />
                  </div>
                  <p className="text-center text-xs font-bold text-slate-500">
                    Ano {point.year}
                  </p>
                </div>
              ))}
            </div>
            <details className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <summary className="cursor-pointer font-bold text-slate-800">
                Alternativa textual do gráfico
              </summary>
              <ul className="mt-3 grid gap-2">
                {result.points.map((point) => (
                  <li key={point.year}>
                    Ano {point.year}:{" "}
                    <strong>
                      {formatMoney(point.projectedMinor, currency)}
                    </strong>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Simulação educativa. A taxa é nominal e constante; impostos,
          inflação, custos e variações reais não estão incluídos.
        </p>
      </section>
    </div>
  );
}
