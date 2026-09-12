import Link from "next/link";
import { notFound } from "next/navigation";
import { FinancingAmortizationSimulator } from "@/components/financing/financing-amortization-simulator";
import { formatMoney } from "@/domain/money";
import { getCurrentUserFinancingContract } from "@/services/finance/financing-imports-service";
import { formatFinancialDate } from "@/utils/financial-formatters";

const messages: Record<string, string> = {
  imported: "Financiamento criado a partir do PDF revisado.",
};

function formatRate(value: string | null, suffix = "a.a.") {
  return value ? `${value.replace(".", ",")}% ${suffix}` : "Não informado";
}

export default async function FinancingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { contract, schedule, extraAmortizations, hasError } =
    await getCurrentUserFinancingContract(id);
  if (!contract) notFound();

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:py-10">
      <header>
        <Link href="/investments?tab=financing" className="text-sm font-bold text-emerald-700 hover:underline">
          ← Voltar para financiamentos
        </Link>
        <p className="mt-5 text-sm font-extrabold uppercase tracking-[0.18em] text-emerald-700">
          Fluxo financeiro do contrato
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">{contract.name}</h1>
        <p className="mt-2 text-slate-600">
          {contract.institution} · {contract.amortization_system ?? "Sistema não informado"} · saldo em {formatFinancialDate(contract.balance_date)}
        </p>
      </header>

      {query.message && messages[query.message] ? (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">{messages[query.message]}</p>
      ) : null}
      {hasError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">Parte dos detalhes não pôde ser carregada.</p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Saldo devedor", contract.current_balance_minor],
          ["Valor pago", contract.total_paid_minor],
          ["Principal amortizado", contract.principal_paid_minor],
          ["Juros pagos", contract.interest_paid_minor],
          ["Encargos pagos", contract.charges_paid_minor],
          ["Extra com recursos próprios", contract.extra_cash_minor],
          ["Extra com FGTS", contract.extra_fgts_minor],
          ["Valor original", contract.original_principal_minor],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-black text-slate-950">{formatMoney(Number(value), contract.currency)}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Condições do contrato</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">Taxa nominal</dt>
            <dd className="font-bold text-slate-950">{formatRate(contract.nominal_annual_rate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Taxa efetiva</dt>
            <dd className="font-bold text-slate-950">{formatRate(contract.effective_annual_rate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">CET</dt>
            <dd className="font-bold text-slate-950">{formatRate(contract.cet_annual_rate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">CESH</dt>
            <dd className="font-bold text-slate-950">{formatRate(contract.cesh_annual_rate)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Saldo inicial</dt>
            <dd className="font-bold text-slate-950">{formatMoney(contract.original_principal_minor, contract.currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Saldo atual</dt>
            <dd className="font-bold text-slate-950">{formatMoney(contract.current_balance_minor, contract.currency)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Prazo original</dt>
            <dd className="font-bold text-slate-950">{contract.original_term_months ? `${contract.original_term_months} meses` : "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Indexador</dt>
            <dd className="font-bold text-slate-950">{contract.indexer ?? "Não informado"}</dd>
          </div>
        </dl>
      </section>

      <FinancingAmortizationSimulator
        currency={contract.currency}
        principalMinor={contract.current_balance_minor}
        annualRate={contract.nominal_annual_rate}
        termMonths={contract.original_term_months}
      />

      {extraAmortizations.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Amortizações extraordinárias</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extraAmortizations.map((entry) => (
              <article key={entry.id} className="rounded-xl bg-slate-50 p-4">
                <p className="font-bold text-slate-950">{formatFinancialDate(entry.event_date)}</p>
                <p className="mt-1 text-sm text-slate-600">{entry.reduction_type === "term" ? "Redução do prazo" : "Redução da prestação"}</p>
                <p className="mt-2 font-extrabold text-emerald-800">{formatMoney(entry.cash_amount_minor + entry.fgts_amount_minor, contract.currency)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">Parcelas e projeção</h2>
          <p className="mt-1 text-sm text-slate-600">Valores importados do extrato; nenhuma baixa bancária é criada automaticamente.</p>
        </div>
        <div className="max-h-[38rem] overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Nº</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Principal</th><th className="px-4 py-3">Juros</th><th className="px-4 py-3">Encargos</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Situação</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedule.map((entry) => {
                const charges = entry.insurance_mip_minor + entry.insurance_dfi_minor + entry.service_fee_minor + entry.penalty_minor + entry.late_interest_minor;
                return (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 font-bold">{entry.installment_number}</td>
                    <td className="px-4 py-3">{formatFinancialDate(entry.due_date)}</td>
                    <td className="px-4 py-3">{formatMoney(entry.principal_minor, contract.currency)}</td>
                    <td className="px-4 py-3">{formatMoney(entry.interest_minor, contract.currency)}</td>
                    <td className="px-4 py-3">{formatMoney(charges, contract.currency)}</td>
                    <td className="px-4 py-3 font-bold">{formatMoney(entry.total_amount_minor, contract.currency)}</td>
                    <td className="px-4 py-3">{formatMoney(entry.outstanding_balance_minor, contract.currency)}</td>
                    <td className="px-4 py-3">{entry.payment_status === "paid" ? "Paga" : "A vencer"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
