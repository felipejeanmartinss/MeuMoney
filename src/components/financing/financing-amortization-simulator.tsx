"use client";

import { useState, type FormEvent } from "react";
import {
  formatMoney,
  minorUnitsToInput,
  parseMoneyInputToMinor,
} from "@/domain/money";
import {
  simulateFinancing,
  type FinancingAmortizationMethod,
  type FinancingExtraAmortizationMode,
  type FinancingSimulation,
} from "@/domain/financing-imports";
import type { SupportedCurrency } from "@/types/database";

function parseRateInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^\d+(?:\.\d{1,4})?$/.test(normalized)) {
    throw new Error("Informe uma taxa anual válida.");
  }
  const rate = Number(normalized);
  if (!Number.isFinite(rate)) throw new Error("Informe uma taxa anual válida.");
  return rate;
}

function defaultRate(value: string | null) {
  return value?.replace(".", ",") ?? "0,00";
}

export function FinancingAmortizationSimulator({
  currency,
  principalMinor,
  annualRate,
  termMonths,
}: {
  currency: SupportedCurrency;
  principalMinor: number;
  annualRate: string | null;
  termMonths: number | null;
}) {
  const [result, setResult] = useState<FinancingSimulation | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const simulation = simulateFinancing({
        principalMinor: parseMoneyInputToMinor(
          String(data.get("principal") ?? ""),
        ),
        annualRatePercent: parseRateInput(String(data.get("annualRate") ?? "")),
        termMonths: Number(data.get("termMonths")),
        method: String(data.get("method")) as FinancingAmortizationMethod,
        extraAmortizationMinor: (() => {
          const value = String(data.get("extraAmortization") ?? "").trim();
          return value ? parseMoneyInputToMinor(value) : 0;
        })(),
        extraAmortizationMode: String(
          data.get("extraAmortizationMode"),
        ) as FinancingExtraAmortizationMode,
      });
      setResult(simulation);
      setError(null);
    } catch (caughtError) {
      setResult(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível calcular a simulação.",
      );
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-black text-slate-950">
          Simular amortização
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Compare SAC e PRICE e veja o efeito de uma amortização extra mensal.
          A simulação não altera o contrato.
        </p>
      </div>
      <form onSubmit={calculate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Saldo inicial ({currency})
          <input
            name="principal"
            inputMode="decimal"
            defaultValue={minorUnitsToInput(principalMinor)}
            className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Taxa anual (%)
          <input
            name="annualRate"
            inputMode="decimal"
            defaultValue={defaultRate(annualRate)}
            className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Prazo (meses)
          <input
            name="termMonths"
            type="number"
            min="1"
            max="600"
            defaultValue={termMonths ?? 360}
            className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Sistema
          <select
            name="method"
            defaultValue="sac"
            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="sac">SAC</option>
            <option value="price">PRICE</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700 sm:col-span-2">
          Amortização extra mensal ({currency})
          <input
            name="extraAmortization"
            inputMode="decimal"
            defaultValue="0,00"
            className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Aplicar extra para
          <select
            name="extraAmortizationMode"
            defaultValue="term"
            className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="term">Reduzir prazo</option>
            <option value="payment">Reduzir prestação</option>
          </select>
        </label>
        <button className="min-h-10 self-end rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">
          Calcular
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1.6fr)]">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {[
              ["Primeira parcela", result.initialPaymentMinor],
              ["Última parcela", result.finalPaymentMinor],
              ["Total pago", result.totalPaymentMinor],
              ["Total de juros", result.totalInterestMinor],
              ["Amortização extra", result.totalExtraAmortizationMinor],
              ["Parcelas simuladas", result.rows.length.toString()],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="font-extrabold text-slate-950">
                  {typeof value === "number"
                    ? formatMoney(value, currency)
                    : value}
                </p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Primeiras parcelas
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-white text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Nº</th>
                    <th className="px-3 py-2">Parcela</th>
                    <th className="px-3 py-2">Juros</th>
                    <th className="px-3 py-2">Extra</th>
                    <th className="px-3 py-2">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.slice(0, 12).map((row) => (
                    <tr key={row.installment}>
                      <td className="px-3 py-2 font-bold">{row.installment}</td>
                      <td className="px-3 py-2">{formatMoney(row.paymentMinor, currency)}</td>
                      <td className="px-3 py-2">{formatMoney(row.interestMinor, currency)}</td>
                      <td className="px-3 py-2">{formatMoney(row.extraAmortizationMinor, currency)}</td>
                      <td className="px-3 py-2 font-bold">{formatMoney(row.balanceMinor, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
