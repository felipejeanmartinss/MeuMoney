"use client";

import { useActionState, useRef, useState } from "react";
import { createManualFinancingContract, type FinancingImportFormState } from "@/app/actions/financing-imports";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { amortizeFinancingSchedule, financingMoneyInput, normalizeFinancingMoney, projectFinancingSchedule } from "@/domain/financing-schedule";
import { formatMoney, parseMoneyInputToMinor } from "@/domain/money";
import type { FinancingContractSummary, FinancingScheduleEntry } from "@/types/database";
import type { FinancingTransactionOption } from "@/types/financing";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type Row = {
  key: string; id?: string; installmentNumber: string; dueDate: string;
  totalAmountMinor: string; principalMinor: string; interestMinor: string;
  correctionFactor: string; chargesMinor: string; outstandingBalanceMinor: string;
  paymentStatus: "paid" | "scheduled"; paymentDate: string; paidAmountMinor: string;
  extraAmortizationMinor: string; installmentsReduced: string; linkedTransactionId: string;
};
const monetaryFields = ["principalMinor", "totalAmountMinor", "interestMinor", "chargesMinor", "outstandingBalanceMinor", "paidAmountMinor", "extraAmortizationMinor"] as const;
const cell = "h-9 w-full min-w-24 rounded-md border border-slate-300 bg-white px-2 text-xs tabular-nums text-slate-900 focus:border-emerald-700";
const initialState: FinancingImportFormState = { status: "idle" };
function emptyRow(number: number, key: string): Row {
  return { key, installmentNumber: String(number), dueDate: "", totalAmountMinor: "0,00", principalMinor: "0,00", interestMinor: "0,00", correctionFactor: "", chargesMinor: "0,00", outstandingBalanceMinor: "0,00", paymentStatus: "scheduled", paymentDate: "", paidAmountMinor: "0,00", extraAmortizationMinor: "0,00", installmentsReduced: "0", linkedTransactionId: "" };
}
function fromEntry(entry: FinancingScheduleEntry): Row {
  return { key: entry.id, id: entry.id, installmentNumber: String(entry.installment_number), dueDate: entry.due_date,
    totalAmountMinor: financingMoneyInput(entry.total_amount_minor), principalMinor: financingMoneyInput(entry.principal_minor),
    interestMinor: financingMoneyInput(entry.interest_minor), correctionFactor: String(entry.correction_factor ?? "").replace(".", ","),
    chargesMinor: financingMoneyInput(entry.insurance_mip_minor + entry.insurance_dfi_minor + entry.service_fee_minor + entry.penalty_minor + entry.late_interest_minor),
    outstandingBalanceMinor: financingMoneyInput(entry.outstanding_balance_minor), paymentStatus: entry.payment_status,
    paymentDate: entry.payment_date ?? "", paidAmountMinor: financingMoneyInput(entry.paid_amount_minor),
    extraAmortizationMinor: financingMoneyInput(entry.extra_amortization_minor ?? 0), installmentsReduced: String(entry.installments_reduced ?? 0),
    linkedTransactionId: entry.linked_transaction_id ?? "" };
}
function monthlyDate(start: string, offset: number) {
  const [year, month, day] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function ManualFinancingForm({ contract, schedule = [], transactions = [] }: {
  contract?: FinancingContractSummary; schedule?: FinancingScheduleEntry[]; transactions?: FinancingTransactionOption[];
}) {
  const [state, formAction, pending] = useActionState(createManualFinancingContract, initialState);
  const [rows, setRows] = useState<Row[]>(() => schedule.length ? schedule.map(fromEntry) : [emptyRow(1, "row-1")]);
  const [method, setMethod] = useState<"SAC" | "PRICE">(contract?.amortization_system === "PRICE" ? "PRICE" : "SAC");
  const [principal, setPrincipal] = useState(contract ? financingMoneyInput(contract.original_principal_minor) : "");
  const [term, setTerm] = useState(String(contract?.original_term_months ?? ""));
  const [start, setStart] = useState(contract?.contract_date ?? "");
  const [rate, setRate] = useState(String(contract?.nominal_annual_rate ?? "").replace(".", ","));
  const [balance, setBalance] = useState(contract ? financingMoneyInput(contract.current_balance_minor) : "");
  const [balanceDate, setBalanceDate] = useState(contract?.balance_date ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [extraRow, setExtraRow] = useState("");
  const [extraValue, setExtraValue] = useState("");
  const [extraCount, setExtraCount] = useState("0");
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [linkRow, setLinkRow] = useState("");
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const sequence = useRef(1);
  const rowKey = () => `new-${sequence.current++}`;
  function update(key: string, field: keyof Row, value: string) {
    setPreview(null);
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }
  function paid(key: string, status: "paid" | "scheduled") {
    const selected = rows.find((row) => row.key === key);
    if (!selected) return;
    const amount = status === "paid" ? financingMoneyInput(parseMoneyInputToMinor(selected.totalAmountMinor) + parseMoneyInputToMinor(selected.extraAmortizationMinor)) : "0,00";
    setPreview(null);
    setRows((current) => current.map((row) => row.key !== key ? row : { ...row, paymentStatus: status,
      paymentDate: status === "paid" ? row.paymentDate || row.dueDate : "",
      paidAmountMinor: amount }));
  }
  function project() {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("Informe a data do contrato.");
      if (rows.some((row) => row.id || row.paymentStatus === "paid" || row.linkedTransactionId)) throw new Error("Para preservar o histórico, ajuste as parcelas existentes ou use a amortização abaixo.");
      const projected = projectFinancingSchedule({ principalMinor: parseMoneyInputToMinor(principal), months: Number(term), annualRate: rate, method });
      setPreview(projected.map((row, i) => ({ ...emptyRow(i + 1, rowKey()), dueDate: monthlyDate(start, i + 1),
        principalMinor: financingMoneyInput(row.principalMinor), interestMinor: financingMoneyInput(row.interestMinor),
        totalAmountMinor: financingMoneyInput(row.paymentMinor), outstandingBalanceMinor: financingMoneyInput(row.balanceMinor) })));
      setMessage("Confira a prévia e aplique à tabela. As alterações só serão gravadas ao salvar.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível projetar."); }
  }
  function amortize() {
    try {
      const numeric = rows.map((row) => ({ ...row,
        ...Object.fromEntries(monetaryFields.map((field) => [field, parseMoneyInputToMinor(row[field])])) as Record<typeof monetaryFields[number], number>,
        installmentsReduced: Number(row.installmentsReduced), linkedTransactionId: row.linkedTransactionId || null }));
      const result = amortizeFinancingSchedule(numeric, rows.findIndex((row) => row.key === extraRow), {
        amountMinor: extraValue.trim() ? parseMoneyInputToMinor(extraValue) : 0, installments: Number(extraCount), annualRate: rate, method,
      });
      setPreview(result.map((row) => ({ ...row,
        ...Object.fromEntries(monetaryFields.map((field) => [field, financingMoneyInput(row[field])])) as Record<typeof monetaryFields[number], string>,
        installmentsReduced: String(row.installmentsReduced), linkedTransactionId: row.linkedTransactionId ?? "" })));
      setMessage("A prévia mantém as parcelas anteriores e recalcula as seguintes. Seguros e taxas são preservados; confira os reajustes do banco.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível amortizar."); }
  }
  const displayRows = preview ?? rows;
  function moneyCell(row: Row, field: typeof monetaryFields[number], label: string) {
    return <input aria-label={`${label}, parcela ${row.installmentNumber}`} className={`${cell} text-right`} inputMode="decimal" value={row[field]} disabled={Boolean(preview)}
      onChange={(event) => update(row.key, field, event.target.value)} onBlur={(event) => update(row.key, field, normalizeFinancingMoney(event.target.value))} required />;
  }
  return (
    <form action={formAction} className="grid min-w-0 gap-4">
      <input type="hidden" name="contractId" value={contract?.id ?? ""} />
      <input type="hidden" name="expectedUpdatedAt" value={contract?.updated_at ?? ""} />
      <input type="hidden" name="schedule" value={JSON.stringify(rows.map((row) => ({ ...row, key: undefined })))} />
      {state.message ? <FormMessage>{state.message}{state.fieldErrors ? <ul>{Object.entries(state.fieldErrors).map(([field, errors]) => <li key={field}>{errors?.join(" ")}</li>)}</ul> : null}</FormMessage> : null}
      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Contrato</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Nome" compact><input className={inputClass()} name="name" defaultValue={contract?.name} required /></Field>
          <Field label="Instituição" compact><input className={inputClass()} name="institution" defaultValue={contract?.institution} required /></Field>
          <Field label="Nº do contrato" compact><input className={inputClass()} name="contractReference" defaultValue={contract?.contract_reference} required /></Field>
          <Field label="Contexto" compact><select className={inputClass()} name="context" defaultValue={contract?.context ?? "personal"}><option value="personal">Pessoal</option><option value="professional">Profissional</option></select></Field>
          <Field label="Tipo" compact><select className={inputClass()} name="productType" defaultValue={contract?.product_type ?? "financing"}><option value="financing">Financiamento</option><option value="loan">Empréstimo</option></select></Field>
          <Field label="Sistema" compact><select className={inputClass()} name="amortizationSystem" value={method} onChange={(event) => { setPreview(null); setMethod(event.target.value as "SAC" | "PRICE"); }}><option>SAC</option><option>PRICE</option></select></Field>
          <Field label="Moeda" compact><select className={inputClass()} name="currency" defaultValue={contract?.currency ?? "BRL"}>{SUPPORTED_CURRENCIES.map((currency) => <option key={currency} value={currency}>{CURRENCY_LABELS[currency]}</option>)}</select></Field>
          <Field label="Indexador" compact><input className={inputClass()} name="indexer" defaultValue={contract?.indexer ?? ""} placeholder="TR, IPCA…" /></Field>
          <Field label="Saldo devedor inicial" compact><input className={inputClass()} name="originalPrincipalMinor" inputMode="decimal" value={principal} onChange={(event) => setPrincipal(event.target.value)} onBlur={() => setPrincipal(normalizeFinancingMoney(principal))} required /></Field>
          <Field label="Saldo devedor atual" compact><input className={inputClass()} name="currentBalanceMinor" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} onBlur={() => setBalance(normalizeFinancingMoney(balance))} required /></Field>
          <Field label="Prazo original (meses)" compact><input className={inputClass()} name="originalTermMonths" type="number" min="1" max="1200" value={term} onChange={(event) => setTerm(event.target.value)} required /></Field>
          <Field label="Data do contrato" compact><input className={inputClass()} name="contractDate" type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></Field>
          <Field label="Data de liberação" compact><input className={inputClass()} name="releaseDate" type="date" defaultValue={contract?.release_date ?? ""} /></Field>
          <Field label="Data-base do saldo" compact><input className={inputClass()} name="balanceDate" type="date" value={balanceDate} onChange={(event) => setBalanceDate(event.target.value)} required /></Field>
          <Field label="Taxa nominal anual (%)" compact><input className={inputClass()} name="nominalAnnualRate" inputMode="decimal" value={rate} onChange={(event) => { setPreview(null); setRate(event.target.value); }} /></Field>
          <Field label="Taxa efetiva anual (%)" compact><input className={inputClass()} name="effectiveAnnualRate" inputMode="decimal" defaultValue={String(contract?.effective_annual_rate ?? "").replace(".", ",")} /></Field>
          <Field label="CET anual (%)" compact><input className={inputClass()} name="cetAnnualRate" inputMode="decimal" defaultValue={String(contract?.cet_annual_rate ?? "").replace(".", ",")} /></Field>
        </div>
      </section>
      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Ajustar fluxo</h2>{!contract ? <button type="button" onClick={project} className="min-h-11 rounded-lg border px-3 text-sm font-semibold">Projetar parcelas</button> : null}</div>
        <p className="text-xs text-slate-600">Só valor: reduz as prestações seguintes. Só quantidade: antecipa o principal das últimas parcelas. Ambos: aplica o valor e reduz o prazo informado.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Amortizar após a parcela" compact><select className={cell} value={extraRow} onChange={(event) => { setPreview(null); setExtraRow(event.target.value); }}><option value="">Selecione</option>{rows.map((row) => <option key={row.key} value={row.key}>{row.installmentNumber} · {row.dueDate.split("-").reverse().join("/")}</option>)}</select></Field>
          <Field label="Valor extra" compact><input className={cell} value={extraValue} inputMode="decimal" placeholder="0,00" onChange={(event) => { setPreview(null); setExtraValue(event.target.value); }} onBlur={() => setExtraValue(normalizeFinancingMoney(extraValue))} /></Field>
          <Field label="Parcelas a reduzir" compact><input className={cell} type="number" min="0" value={extraCount} onChange={(event) => { setPreview(null); setExtraCount(event.target.value); }} /></Field>
          <button type="button" onClick={amortize} className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white">Prévia da amortização</button>
        </div>
        {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
        {preview ? <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 p-3"><span className="text-sm">Prévia: {preview.length} parcelas no fluxo.</span><button type="button" className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white" onClick={() => { setRows(preview); setPreview(null); setMessage("Prévia aplicada. Confira o saldo atual e salve o contrato."); }}>Aplicar à tabela</button><button type="button" className="min-h-11 px-3 text-sm" onClick={() => setPreview(null)}>Descartar prévia</button></div> : null}
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h2 className="font-semibold">Parcelas</h2><p className="text-xs text-slate-500">Edite qualquer célula. O vínculo com lançamento é apenas histórico; nenhuma movimentação bancária será alterada.</p></div>
          <button type="button" disabled={Boolean(preview)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => setRows((current) => [...current, emptyRow(Math.max(0, ...current.map((row) => Number(row.installmentNumber))) + 1, rowKey())])}>+ Parcela</button>
        </div>
        <div className="max-h-[36rem] overflow-auto">
          <table data-sortable="false" className="w-full min-w-[1840px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600"><tr>{["Parcela", "Vencimento", "Principal", "Valor total", "Juros", "Correção", "Taxas/multas", "Amortização extra", "Parcelas reduzidas", "Saldo devedor", "Situação", "Pagamento", "Valor pago", "Lançamento vinculado", "Ações"].map((label) => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{displayRows.map((row) => <tr key={row.key}>
              <td className="p-1"><input aria-label="Número da parcela" className={cell} type="number" min="0" value={row.installmentNumber} disabled={Boolean(preview)} onChange={(event) => update(row.key, "installmentNumber", event.target.value)} required /></td>
              <td className="p-1"><input aria-label="Vencimento" className={cell} type="date" value={row.dueDate} disabled={Boolean(preview)} onChange={(event) => update(row.key, "dueDate", event.target.value)} required /></td>
              <td className="p-1">{moneyCell(row, "principalMinor", "Principal")}</td>
              <td className="p-1">{moneyCell(row, "totalAmountMinor", "Valor total")}</td>
              <td className="p-1">{moneyCell(row, "interestMinor", "Juros")}</td>
              <td className="p-1"><input aria-label="Fator de correção" className={cell} value={row.correctionFactor} disabled={Boolean(preview)} onChange={(event) => update(row.key, "correctionFactor", event.target.value)} /></td>
              <td className="p-1">{moneyCell(row, "chargesMinor", "Taxas e multas")}</td>
              <td className="p-1">{moneyCell(row, "extraAmortizationMinor", "Amortização extra")}</td>
              <td className="p-1"><input aria-label="Parcelas reduzidas" className={cell} type="number" min="0" value={row.installmentsReduced} disabled={Boolean(preview)} onChange={(event) => update(row.key, "installmentsReduced", event.target.value)} /></td>
              <td className="p-1">{moneyCell(row, "outstandingBalanceMinor", "Saldo devedor")}</td>
              <td className="p-1"><select aria-label="Situação" className={cell} value={row.paymentStatus} disabled={Boolean(preview)} onChange={(event) => { try { paid(row.key, event.target.value as "paid" | "scheduled"); } catch { setMessage("Revise os valores antes de marcar o pagamento."); } }}><option value="scheduled">A vencer</option><option value="paid">Paga</option></select></td>
              <td className="p-1"><input aria-label="Data de pagamento" className={cell} type="date" value={row.paymentDate} disabled={Boolean(preview) || row.paymentStatus === "scheduled"} onChange={(event) => update(row.key, "paymentDate", event.target.value)} /></td>
              <td className="p-1">{moneyCell(row, "paidAmountMinor", "Valor pago, incluindo extra")}</td>
              <td className="min-w-64 p-1">{row.linkedTransactionId ? <><span>{transactionById.get(row.linkedTransactionId)?.description ?? "Lançamento vinculado"}</span><button type="button" disabled={Boolean(preview)} className="min-h-11 px-2 text-emerald-800" onClick={() => update(row.key, "linkedTransactionId", "")}>Desvincular</button></> : <button type="button" disabled={Boolean(preview)} className="min-h-11 px-2 text-emerald-800" onClick={() => setLinkRow(row.key)}>Vincular lançamento</button>}</td>
              <td className="p-1"><button type="button" disabled={Boolean(preview) || rows.length === 1} className="min-h-11 px-2 text-red-700 disabled:opacity-30" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>Excluir parcela</button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      {linkRow ? <section aria-label="Vincular pagamento" className="sticky bottom-2 z-20 rounded-xl border border-emerald-600 bg-white p-4 shadow-lg">
        <label className="grid gap-2 text-sm font-semibold">Lançamento da parcela {rows.find((row) => row.key === linkRow)?.installmentNumber}
          <select autoFocus className={inputClass()} value="" onChange={(event) => { if (event.target.value) { update(linkRow, "linkedTransactionId", event.target.value); setLinkRow(""); } }}>
            <option value="">Selecione um pagamento</option>{transactions.filter((tx) => !rows.some((row) => row.linkedTransactionId === tx.id)).map((tx) => <option key={tx.id} value={tx.id}>{tx.transaction_date.split("-").reverse().join("/")} · {tx.description} · {formatMoney(tx.amount_minor, tx.currency)}</option>)}
          </select>
        </label><button type="button" className="min-h-11 px-2 text-sm" onClick={() => setLinkRow("")}>Cancelar vínculo</button>
      </section> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="min-h-11 rounded-lg border px-3 text-sm" onClick={() => { const latest = rows.filter((row) => row.paymentStatus === "paid" && row.paymentDate).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || Number(a.installmentNumber) - Number(b.installmentNumber)).at(-1); if (latest) { setBalance(latest.outstandingBalanceMinor); setBalanceDate(latest.paymentDate); setMessage("Saldo atual atualizado pela última parcela paga."); } else setMessage("Nenhuma parcela paga para atualizar o saldo."); }}>Usar saldo da última parcela paga</button>
        <SubmitButton pending={pending} disabled={Boolean(preview)}>{contract ? "Salvar alterações" : "Cadastrar financiamento"}</SubmitButton>
      </div>
    </form>
  );
}
