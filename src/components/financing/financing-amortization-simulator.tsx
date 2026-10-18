"use client";

import { useState, type FormEvent } from "react";
import { normalizeFinancingMoney } from "@/domain/financing-schedule";
import { simulateFinancing, type FinancingAmortizationMethod, type FinancingExtraAmortizationMode, type FinancingSimulation } from "@/domain/financing-imports";
import { formatMoney, parseMoneyInputToMinor } from "@/domain/money";
import type { SupportedCurrency } from "@/types/database";
import { formatIsoDatePtBr } from "@/utils/dates";

type Comparison = { baseline: FinancingSimulation; scenario: FinancingSimulation; mode: FinancingExtraAmortizationMode };

export function FinancingAmortizationSimulator({
  currency, principalMinor, balanceDate, annualRate, termMonths, method, nextDueDate,
  nextPrincipalMinor, nextInterestMinor, nextTotalMinor,
}: {
  currency: SupportedCurrency;
  principalMinor: number;
  balanceDate: string;
  annualRate: string;
  termMonths: number;
  method: FinancingAmortizationMethod;
  nextDueDate: string;
  nextPrincipalMinor: number;
  nextInterestMinor: number;
  nextTotalMinor: number;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const extraAmortizationMinor = parseMoneyInputToMinor(String(data.get("extraAmortization") ?? ""));
      if (extraAmortizationMinor <= 0) throw new Error("Informe uma amortização maior que zero.");
      const mode = String(data.get("extraAmortizationMode")) as FinancingExtraAmortizationMode;
      const annualRatePercent = Number(annualRate.replace(",", "."));
      const baseInput = { principalMinor, annualRatePercent, termMonths, method, nextPrincipalMinor, nextInterestMinor };
      const baseline = simulateFinancing(baseInput);
      const scenario = simulateFinancing({ ...baseInput, extraAmortizationMinor, extraAmortizationMode: mode });
      setComparison({ baseline, scenario, mode });
      setError(null);
    } catch (caughtError) {
      setComparison(null);
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível calcular a simulação.");
    }
  }

  const row = (label: string, before: string, after: string) => <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-slate-100 px-4 py-3 text-sm" key={label}>
    <span className="text-slate-600">{label}</span><span className="min-w-24 text-right tabular-nums text-slate-500">{before}</span><span className="min-w-24 text-right font-bold tabular-nums text-slate-950">{after}</span>
  </div>;

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-black text-slate-950">Simular amortização</h2>
    <p className="mt-1 text-sm text-slate-600">Uma amortização extra no próximo vencimento, sem alterar o contrato.</p>
    <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><span className="block text-xs text-slate-500">Próximo vencimento</span><strong>{formatIsoDatePtBr(nextDueDate)}</strong></div>
      <div><span className="block text-xs text-slate-500">Saldo em {formatIsoDatePtBr(balanceDate)}</span><strong>{formatMoney(principalMinor, currency)}</strong></div>
      <div><span className="block text-xs text-slate-500">Parcelas restantes</span><strong>{termMonths}</strong></div>
      <div><span className="block text-xs text-slate-500">Sistema · taxa nominal anual</span><strong>{method.toUpperCase()} · {annualRate.replace(".", ",")}%</strong></div>
    </div>
    <form onSubmit={calculate} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.6fr)_auto] sm:items-end">
      <label className="grid gap-1 text-xs font-bold text-slate-700">Amortização única no próximo vencimento ({currency})
        <input name="extraAmortization" inputMode="decimal" defaultValue="0,00" onBlur={(event) => { event.target.value = normalizeFinancingMoney(event.target.value); }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" required />
      </label>
      <label className="grid gap-1 text-xs font-bold text-slate-700">Reduzir
        <select name="extraAmortizationMode" defaultValue="term" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="term">Prazo</option><option value="payment">Valor da prestação</option></select>
      </label>
      <button className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">Simular</button>
    </form>
    {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {comparison ? <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500"><span>Impacto estimado</span><span className="min-w-24 text-right">Sem extra</span><span className="min-w-24 text-right">Com extra</span></div>
      {row("Próximo pagamento (parcela + extra)", formatMoney(nextTotalMinor, currency), formatMoney(nextTotalMinor + comparison.scenario.totalExtraAmortizationMinor, currency))}
      {row("Saldo após o vencimento", formatMoney(comparison.baseline.rows[0].balanceMinor, currency), formatMoney(comparison.scenario.rows[0].balanceMinor, currency))}
      {row("Parcela seguinte, sem encargos", formatMoney(comparison.baseline.rows[1]?.paymentMinor ?? 0, currency), formatMoney(comparison.scenario.rows[1]?.paymentMinor ?? 0, currency))}
      {row("Parcelas até a quitação", String(comparison.baseline.rows.length), String(comparison.scenario.rows.length))}
      {row("Juros até a quitação", formatMoney(comparison.baseline.totalInterestMinor, currency), formatMoney(comparison.scenario.totalInterestMinor, currency))}
      <p className="border-t bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{comparison.mode === "term" ? `${comparison.baseline.rows.length - comparison.scenario.rows.length} parcela(s) a menos` : "Prazo preservado"} · Economia estimada de juros: {formatMoney(comparison.baseline.totalInterestMinor - comparison.scenario.totalInterestMinor, currency)}.</p>
    </div> : null}
    <p className="mt-3 text-xs text-slate-500">Estimativa com taxa nominal constante. Correção monetária, seguros, tarifas e regras específicas do banco podem alterar os valores efetivos.</p>
  </section>;
}
