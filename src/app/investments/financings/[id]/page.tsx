import { FinancingPaymentPicker } from "@/components/financing/financing-payment-picker";
import { getFinancingPaymentOptions } from "@/services/finance/financing-payments-service";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FinancingAmortizationSimulator } from "@/components/financing/financing-amortization-simulator";
import { nextFinancingInstallment } from "@/domain/financing-schedule";
import { formatMoney } from "@/domain/money";
import { getCurrentUserFinancingContract } from "@/services/finance/financing-imports-service";
import { currentIsoDate } from "@/utils/dates";
import { formatFinancialDate } from "@/utils/financial-formatters";

const messages: Record<string, string> = {
  linked: "Pagamento vinculado. Nenhuma movimentação foi criada na conta.",
  "link-error": "Não foi possível vincular. Reabra a parcela e confira se o débito já foi usado ou alterado.",
  imported: "Financiamento criado a partir do PDF revisado.",
  created: "Financiamento e histórico cadastrados.",
  updated: "Financiamento e fluxo de parcelas atualizados.",
};

function formatRate(value: string | null, suffix = "a.a.") {
  return value ? `${String(value).replace(".", ",")}% ${suffix}` : "Não informado";
}

export default async function FinancingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; aba?: string; periodo?: string; parcela?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { contract, schedule, extraAmortizations, hasError } =
    await getCurrentUserFinancingContract(id);
  if (!contract) notFound();
  const nextInstallment = nextFinancingInstallment(
    schedule.map((row) => ({ ...row, dueDate: row.due_date, paymentStatus: row.payment_status })),
    contract.balance_date,
    currentIsoDate(),
  );
  const today = currentIsoDate();
  const base = "/investments/financings/" + id;
  const simulation = query.aba === "simular";
  const all = query.periodo === "todas";
  const visible = schedule.filter(e => all || e.due_date >= today.slice(0,7) + "-01").sort((a,b) => a.due_date.localeCompare(b.due_date));
  const selected = !simulation && !hasError ? schedule.find(e => e.id === query.parcela && !e.linked_transaction_id) : undefined;
  const options = selected ? await getFinancingPaymentOptions(contract.currency) : null;
  const simulationMethod = contract.amortization_system?.toLowerCase();

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

      <nav aria-label="Financiamento" className="flex flex-wrap gap-4 rounded-xl border bg-white p-3 font-bold text-emerald-800">
        <Link aria-current={!simulation ? "page" : undefined} href={base}>Parcelas</Link>
        <Link aria-current={simulation ? "page" : undefined} href={base + "?aba=simular"}>Simular amortização</Link>
        <Link href={base + "/edit"}>Editar fluxo e Excel</Link>
      </nav>
      {!simulation && nextInstallment && <section className="rounded-xl bg-emerald-50 p-4">
        <h2 className="font-bold">Próxima parcela · nº {nextInstallment.next.installment_number}</h2>
        <p>{formatFinancialDate(nextInstallment.next.dueDate)} · {formatMoney(nextInstallment.next.total_amount_minor,contract.currency)}</p>
        {!nextInstallment.next.linked_transaction_id && <Link href={base + "?parcela=" + nextInstallment.next.id + "#vinculo"} className="text-emerald-800 underline">Vincular pagamento</Link>}
      </section>}
      {selected && options && <div id="vinculo">{options.hasError ? <p role="alert">Não foi possível carregar os débitos.</p> : <FinancingPaymentPicker key={selected.id} contractId={id} entryId={selected.id} version={contract.updated_at}
        number={selected.installment_number} expected={(selected.payment_status === "paid" ? selected.paid_amount_minor : selected.total_amount_minor + (selected.extra_amortization_minor ?? 0)) - (selected.extra_fgts_minor ?? 0)}
        currency={contract.currency} options={options.transactions} />}</div>}
      <details className="rounded-xl border bg-white p-3"><summary>Resumo e condições do contrato</summary>
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
          <div>
            <dt className="text-slate-500">Sistema de amortização</dt>
            <dd className="font-bold text-slate-950">{contract.amortization_system ?? "Não informado"}</dd>
          </div>
        </dl>
      </section>

      </details>
      {simulation && (nextInstallment && contract.nominal_annual_rate && (simulationMethod === "sac" || simulationMethod === "price") && contract.current_balance_minor > 0 ? (
        <FinancingAmortizationSimulator
          currency={contract.currency}
          principalMinor={contract.current_balance_minor}
          balanceDate={contract.balance_date}
          annualRate={contract.nominal_annual_rate}
          termMonths={nextInstallment.remainingMonths}
          method={simulationMethod}
          nextDueDate={nextInstallment.next.dueDate}
          nextPrincipalMinor={nextInstallment.next.principal_minor}
          nextInterestMinor={nextInstallment.next.interest_minor}
          nextTotalMinor={nextInstallment.next.total_amount_minor}
        />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <h2 className="font-bold text-slate-950">Simular amortização</h2>
          <p className="mt-1">Para simular, mantenha saldo positivo, taxa nominal, sistema SAC ou PRICE e uma próxima parcela em aberto no fluxo.</p>
        </section>
      ))}

      {simulation && extraAmortizations.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Amortizações extraordinárias</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extraAmortizations.map((entry) => (
              <article key={entry.id} className="rounded-xl bg-slate-50 p-4">
                <p className="font-bold text-slate-950">{formatFinancialDate(entry.event_date)}</p>
                <p className="mt-1 text-sm text-slate-600">{entry.reduction_type === "term" ? "Redução do prazo" : "Redução da prestação"}</p>
                <p className="mt-2 font-extrabold text-emerald-800">{formatMoney(entry.cash_amount_minor + entry.fgts_amount_minor, contract.currency)}</p>
                <p className="mt-1 text-xs text-slate-600">FGTS: {formatMoney(entry.fgts_amount_minor, contract.currency)} · Recursos próprios: {formatMoney(entry.cash_amount_minor, contract.currency)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!simulation && <section className="overflow-auto rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Parcelas · {all ? "histórico completo" : "desde o mês atual"}</h2>
          <Link href={all ? base : base + "?periodo=todas"} className="text-emerald-700 underline">{all ? "Voltar ao mês atual" : "Mostrar todas desde o início"}</Link>
        </div>
        <table className="mt-3 w-full text-left text-sm"><thead><tr>{["Parcela","Vencimento","Prestação","Situação","Pagamento"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{visible.map(entry => <tr key={entry.id} className="border-t">
            <th className="p-2">{entry.installment_number}</th><td>{formatFinancialDate(entry.due_date)}</td><td>{formatMoney(entry.total_amount_minor,contract.currency)}</td>
            <td>{entry.payment_status === "paid" ? (entry.linked_transaction_id ? "Paga · vinculada" : "Paga · sem vínculo") : (entry.due_date < today ? "Vencida" : "A vencer")}</td>
            <td className="p-2">{entry.payment_status === "paid" && <p>{entry.payment_date && formatFinancialDate(entry.payment_date)} · {formatMoney(entry.paid_amount_minor,contract.currency)}</p>}
            {!entry.linked_transaction_id && <Link className="text-emerald-700 underline" href={base + "?parcela=" + entry.id + (all ? "&periodo=todas" : "") + "#vinculo"}>Vincular pagamento</Link>}</td>
          </tr>)}</tbody></table>
        {!visible.length && <p className="p-3">Nenhuma parcela neste período.</p>}
      </section>}
    </main>
  );
}
