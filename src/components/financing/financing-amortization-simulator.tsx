"use client";

import { useState, type FormEvent } from "react";
import { normalizeFinancingMoney } from "@/domain/financing-schedule";
import { simulateFinancing, type FinancingAmortizationMethod, type FinancingSimulation } from "@/domain/financing-imports";
import { formatMoney, parseMoneyInputToMinor } from "@/domain/money";
import { compareAmortizationBenefits, projectInstallmentDifference, monthlyYieldBps } from "@/domain/financing-reinvestment";
import type { SupportedCurrency } from "@/types/database";
import { formatIsoDatePtBr } from "@/utils/dates";

type Comparison = [FinancingSimulation, FinancingSimulation, FinancingSimulation];

function ReinvestmentResult({ result, currency }: { result: ReturnType<typeof projectInstallmentDifference>; currency: SupportedCurrency }) {
  const money = (minor: number) => formatMoney(minor, currency);
  const rate = (result.rateBps / 100).toLocaleString("pt-BR");
  return <section className="mt-4 rounded-xl border border-slate-200 p-4" aria-label="Reinvestimento da diferença">
    <h3 className="font-bold">Reduzir prestação e investir a diferença</h3>
    <p className="my-2 text-sm">A cada mês, você aplica o que pagaria a mais na opção de reduzir prazo. Quando essa opção quita, os aportes param; o saldo segue rendendo até a última prestação.</p>
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div><dt>Total aportado</dt><dd className="font-bold">{money(result.contributions)}</dd></div>
      <div><dt>Rendimento a {rate}% ao mês</dt><dd className="font-bold">{money(result.earnings)}</dd></div>
      <div><dt>Saldo em {result.months} mês(es)</dt><dd className="font-bold">{money(result.balance)}</dd></div>
    </dl>
  </section>;
}

type Decision = ReturnType<typeof compareAmortizationBenefits>;

export function AmortizationDecision({ comparison: [baseline, term, payment], decision, currency }: { comparison: Comparison; decision: Decision; currency: SupportedCurrency }) {
  const money = (value: number) => formatMoney(value, currency);
  const months = baseline.rows.length - term.rows.length;
  return <section aria-label="Comparação das alternativas" className="mt-4 grid gap-3 sm:grid-cols-2">
    <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
      <h3 className="font-bold">{decision.winner === "tie"
        ? "Empate: as duas opções têm o mesmo benefício estimado."
        : `Nesta simulação, ${decision.winner === "term" ? "reduzir prazo" : "reduzir prestação e investir a diferença"} é a melhor opção: vantagem de ${money(decision.advantage)}.`}</h3>
      <p className="mt-2 text-sm">Reduzir prazo: {money(decision.termSavings)} de juros poupados.</p>
      <p className="text-sm">Reduzir prestação: {money(decision.paymentSavings)} de juros poupados + {money(decision.earnings)} de rendimentos líquidos estimados = {money(decision.paymentBenefit)}. Os aportes não contam como ganho.</p>
    </div>
    <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="font-bold">Reduzir prazo</h3>
      <p className="mt-2 text-xl font-bold">{months === 0 ? "Mesmo número de parcelas" : `${months} parcela(s) a menos`}</p>
      <p className="text-sm">{term.rows.length} parcela(s) até quitar, contra {baseline.rows.length} sem a amortização.</p>
    </article>
    <article className="rounded-xl border border-sky-200 bg-sky-50 p-4">
      <h3 className="font-bold">Reduzir valor das parcelas</h3>
      <p className="mt-2 text-xl font-bold">{payment.rows[1] ? money(payment.rows[1].paymentMinor) : "Sem próxima prestação"}</p>
      <p className="text-sm">{payment.rows[1] ? `Prestação seguinte, sem encargos. Sem amortizar: ${money(baseline.rows[1]?.paymentMinor ?? 0)}.` : "O saldo é quitado no vencimento simulado."}</p>
    </article>
  </section>;
}

export function FinancingAmortizationSimulator({
  currency, principalMinor, balanceDate, annualRate, termMonths, method, nextDueDate,
  nextPrincipalMinor, nextInterestMinor, nextTotalMinor,
}: {
  currency: SupportedCurrency;
  principalMinor: number;
  balanceDate: string;
  annualRate: string | number;
  termMonths: number;
  method: FinancingAmortizationMethod;
  nextDueDate: string;
  nextPrincipalMinor: number;
  nextInterestMinor: number;
  nextTotalMinor: number;
}) {
  const [projection, setProjection] = useState<{ comparison: Comparison; investment: ReturnType<typeof projectInstallmentDifference>; decision: Decision } | null>(null);
  const comparison = projection?.comparison;
  const [error, setError] = useState<string | null>(null);

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const extraAmortizationMinor = parseMoneyInputToMinor(String(data.get("extraAmortization") ?? ""));
      if (extraAmortizationMinor <= 0) throw new Error("Informe uma amortização maior que zero.");
      const annualRatePercent = Number(String(annualRate).replace(",", "."));
      const baseInput = { principalMinor, annualRatePercent, termMonths, method, nextPrincipalMinor, nextInterestMinor };
      const baseline = simulateFinancing(baseInput);
      const scenarios: Comparison = [baseline,
        simulateFinancing({ ...baseInput, extraAmortizationMinor, extraAmortizationMode: "term" }),
        simulateFinancing({ ...baseInput, extraAmortizationMinor, extraAmortizationMode: "payment" }),
      ];
      const rate = monthlyYieldBps(String(data.get("monthlyYield") ?? ""));
      const investment = projectInstallmentDifference(scenarios[1], scenarios[2], rate);
      const decision = compareAmortizationBenefits(baseline.totalInterestMinor, scenarios[1].totalInterestMinor, scenarios[2].totalInterestMinor, investment.earnings);
      setProjection({ comparison: scenarios, investment, decision });
      setError(null);
    } catch (caughtError) {
      setProjection(null);
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível calcular a simulação.");
    }
  }

  const money = (minor: number) => formatMoney(minor, currency);

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-black text-slate-950">Simular amortização</h2>
    <p className="mt-1 text-sm text-slate-600">Compare quitar antes ou diminuir a prestação usando o mesmo valor extra no próximo vencimento. A simulação não altera o contrato.</p>
    <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div><span className="block text-xs text-slate-500">Próximo vencimento</span><strong>{formatIsoDatePtBr(nextDueDate)}</strong></div>
      <div><span className="block text-xs text-slate-500">Saldo em {formatIsoDatePtBr(balanceDate)}</span><strong>{formatMoney(principalMinor, currency)}</strong></div>
      <div><span className="block text-xs text-slate-500">Parcelas restantes</span><strong>{termMonths}</strong></div>
      <div><span className="block text-xs text-slate-500">Sistema · taxa nominal anual</span><strong>{method.toUpperCase()} · {String(annualRate).replace(".", ",")}%</strong></div>
    </div>
    <form onChange={() => { setProjection(null); setError(null); }} onSubmit={calculate} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.6fr)_auto] sm:items-end">
      <label className="grid gap-1 text-xs font-bold text-slate-700">Amortização única no próximo vencimento ({currency})
        <input name="extraAmortization" inputMode="decimal" defaultValue="0,00" onBlur={(event) => { event.target.value = normalizeFinancingMoney(event.target.value); }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" required />
      </label>
      <label className="grid gap-1 text-xs font-bold text-slate-700">Rendimento líquido estimado (% ao mês)
        <input name="monthlyYield" inputMode="decimal" defaultValue="1,00" className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" required />
      </label>
      <button className="min-h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800">Comparar prazo e prestação</button>
    </form>
    {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {projection && <AmortizationDecision comparison={projection.comparison} decision={projection.decision} currency={currency} />}
    {projection && <ReinvestmentResult result={projection.investment} currency={currency} />}
    {comparison && <div className="mt-5 overflow-x-auto"><table className="w-full text-sm tabular-nums">
      <caption className="text-left font-bold">Impacto estimado da amortização única</caption>
      <thead><tr>{["Indicador","Sem extra","Reduzir prazo","Reduzir prestação"].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
      <tbody>{[
        ["Próximo pagamento", (s: FinancingSimulation) => money(nextTotalMinor + s.totalExtraAmortizationMinor)],
        ["Saldo após o vencimento", (s: FinancingSimulation) => money(s.rows[0].balanceMinor)],
        ["Parcela seguinte, sem encargos", (s: FinancingSimulation) => money(s.rows[1]?.paymentMinor ?? 0)],
        ["Parcelas até a quitação", (s: FinancingSimulation) => String(s.rows.length)],
        ["Juros até a quitação", (s: FinancingSimulation) => money(s.totalInterestMinor)],
        ["Economia de juros", (s: FinancingSimulation) => money(comparison[0].totalInterestMinor - s.totalInterestMinor)],
      ].map((item) => { const [label, format] = item as [string, (s: FinancingSimulation) => string]; return <tr key={label} className="border-t"><th className="p-2 text-left">{label}</th>{comparison.map((s,i) => <td key={i} className="p-2">{format(s)}</td>)}</tr>; })}</tbody>
    </table></div>}
    <p className="mt-3 text-xs text-slate-500">Estimativa com taxa nominal constante. Correção monetária, seguros, tarifas e regras específicas do banco podem alterar os valores efetivos.</p>
  </section>;
}
