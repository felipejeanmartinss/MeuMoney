"use client";

import { useActionState, useRef, useState } from "react";
import {
  createManualFinancingContract,
  type FinancingImportFormState,
} from "@/app/actions/financing-imports";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES } from "@/domain/currencies";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type EditableScheduleRow = {
  key: string;
  installmentNumber: string;
  dueDate: string;
  totalAmountMinor: string;
  principalMinor: string;
  interestMinor: string;
  correctionFactor: string;
  chargesMinor: string;
  outstandingBalanceMinor: string;
  paymentStatus: "paid" | "scheduled";
  paymentDate: string;
  paidAmountMinor: string;
};

const initialState: FinancingImportFormState = { status: "idle" };

function emptyRow(
  installmentNumber: number,
  key = `row-${installmentNumber}`,
): EditableScheduleRow {
  return {
    key,
    installmentNumber: String(installmentNumber),
    dueDate: "",
    totalAmountMinor: "0,00",
    principalMinor: "0,00",
    interestMinor: "0,00",
    correctionFactor: "",
    chargesMinor: "0,00",
    outstandingBalanceMinor: "0,00",
    paymentStatus: "scheduled",
    paymentDate: "",
    paidAmountMinor: "0,00",
  };
}

const cellInputClass =
  "h-8 w-full min-w-24 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-emerald-700";

function serializeRow(row: EditableScheduleRow) {
  return {
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    totalAmountMinor: row.totalAmountMinor,
    principalMinor: row.principalMinor,
    interestMinor: row.interestMinor,
    correctionFactor: row.correctionFactor,
    chargesMinor: row.chargesMinor,
    outstandingBalanceMinor: row.outstandingBalanceMinor,
    paymentStatus: row.paymentStatus,
    paymentDate: row.paymentDate,
    paidAmountMinor: row.paidAmountMinor,
  };
}

export function ManualFinancingForm() {
  const [state, formAction, pending] = useActionState(
    createManualFinancingContract,
    initialState,
  );
  const [rows, setRows] = useState<EditableScheduleRow[]>([emptyRow(1)]);
  const nextRowKey = useRef(2);

  function updateRow<K extends keyof EditableScheduleRow>(
    key: string,
    field: K,
    value: EditableScheduleRow[K],
  ) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  }

  function updatePaymentStatus(
    key: string,
    paymentStatus: EditableScheduleRow["paymentStatus"],
  ) {
    setRows((current) =>
      current.map((row) =>
        row.key !== key
          ? row
          : {
              ...row,
              paymentStatus,
              paymentDate:
                paymentStatus === "scheduled" ? "" : row.paymentDate,
              paidAmountMinor:
                paymentStatus === "scheduled" ? "0,00" : row.paidAmountMinor,
            },
      ),
    );
  }

  const serializedSchedule = rows.map(serializeRow);

  return (
    <form action={formAction} className="grid gap-5">
      <input
        type="hidden"
        name="schedule"
        value={JSON.stringify(serializedSchedule)}
      />
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <section className="grid gap-4 rounded-xl border border-slate-200 p-4">
        <div>
          <h2 className="font-extrabold text-slate-950">Contrato</h2>
          <p className="mt-1 text-xs text-slate-500">
            SAC e PRICE são sistemas de amortização; o tipo continua sendo
            financiamento ou empréstimo.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Nome" error={state.fieldErrors?.name?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.name))} name="name" required />
          </Field>
          <Field label="Instituição" error={state.fieldErrors?.institution?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.institution))} name="institution" required />
          </Field>
          <Field label="Nº do contrato" error={state.fieldErrors?.contractReference?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.contractReference))} name="contractReference" required />
          </Field>
          <Field label="Contexto" error={state.fieldErrors?.context?.[0]} compact>
            <select className={inputClass(Boolean(state.fieldErrors?.context))} name="context" defaultValue="personal">
              <option value="personal">Pessoal</option>
              <option value="professional">Profissional</option>
            </select>
          </Field>
          <Field label="Tipo" error={state.fieldErrors?.productType?.[0]} compact>
            <select className={inputClass(Boolean(state.fieldErrors?.productType))} name="productType" defaultValue="financing">
              <option value="financing">Financiamento</option>
              <option value="loan">Empréstimo</option>
            </select>
          </Field>
          <Field label="Sistema de amortização" error={state.fieldErrors?.amortizationSystem?.[0]} compact>
            <select className={inputClass(Boolean(state.fieldErrors?.amortizationSystem))} name="amortizationSystem" defaultValue="SAC">
              <option value="SAC">SAC</option>
              <option value="PRICE">PRICE</option>
            </select>
          </Field>
          <Field label="Moeda" error={state.fieldErrors?.currency?.[0]} compact>
            <select className={inputClass(Boolean(state.fieldErrors?.currency))} name="currency" defaultValue="BRL">
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>{CURRENCY_LABELS[currency]}</option>
              ))}
            </select>
          </Field>
          <Field label="Indexador" error={state.fieldErrors?.indexer?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.indexer))} name="indexer" placeholder="Ex.: TR, IPCA" />
          </Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 p-4">
        <h2 className="font-extrabold text-slate-950">Valores e taxas</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Saldo devedor inicial" error={state.fieldErrors?.originalPrincipalMinor?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.originalPrincipalMinor))} name="originalPrincipalMinor" inputMode="decimal" required />
          </Field>
          <Field label="Saldo devedor atual" error={state.fieldErrors?.currentBalanceMinor?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.currentBalanceMinor))} name="currentBalanceMinor" inputMode="decimal" required />
          </Field>
          <Field label="Prazo original (meses)" error={state.fieldErrors?.originalTermMonths?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.originalTermMonths))} name="originalTermMonths" type="number" min="1" max="1200" required />
          </Field>
          <Field label="Data do contrato" error={state.fieldErrors?.contractDate?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.contractDate))} name="contractDate" type="date" required />
          </Field>
          <Field label="Data de liberação" error={state.fieldErrors?.releaseDate?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.releaseDate))} name="releaseDate" type="date" />
          </Field>
          <Field label="Data-base do saldo" error={state.fieldErrors?.balanceDate?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.balanceDate))} name="balanceDate" type="date" required />
          </Field>
          <Field label="Taxa nominal anual (%)" error={state.fieldErrors?.nominalAnnualRate?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.nominalAnnualRate))} name="nominalAnnualRate" inputMode="decimal" />
          </Field>
          <Field label="Taxa efetiva anual (%)" error={state.fieldErrors?.effectiveAnnualRate?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.effectiveAnnualRate))} name="effectiveAnnualRate" inputMode="decimal" />
          </Field>
          <Field label="CET anual (%)" error={state.fieldErrors?.cetAnnualRate?.[0]} compact>
            <input className={inputClass(Boolean(state.fieldErrors?.cetAnnualRate))} name="cetAnnualRate" inputMode="decimal" />
          </Field>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="font-extrabold text-slate-950">Histórico de parcelas</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Amortização corresponde ao valor principal da parcela.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const key = `row-${nextRowKey.current}`;
              nextRowKey.current += 1;
              setRows((current) => [
                ...current,
                emptyRow(current.length + 1, key),
              ]);
            }}
            className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-100"
          >
            + Parcela
          </button>
        </div>
        {state.fieldErrors?.schedule?.[0] ? (
          <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            {state.fieldErrors.schedule[0]}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] table-fixed text-left text-xs">
            <thead className="bg-slate-100 text-[0.68rem] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-16 px-2 py-2">Parcela</th>
                <th className="w-32 px-2 py-2">Data</th>
                <th className="w-32 px-2 py-2">Amortização</th>
                <th className="w-32 px-2 py-2">Valor total</th>
                <th className="w-28 px-2 py-2">Juros</th>
                <th className="w-24 px-2 py-2">Correção</th>
                <th className="w-28 px-2 py-2">Taxas/multas</th>
                <th className="w-36 px-2 py-2">Saldo devedor</th>
                <th className="w-28 px-2 py-2">Situação</th>
                <th className="w-32 px-2 py-2">Pagamento</th>
                <th className="w-32 px-2 py-2">Valor pago</th>
                <th className="w-14 px-2 py-2" aria-label="Ações" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="p-1"><input className={cellInputClass} type="number" min="0" value={row.installmentNumber} onChange={(event) => updateRow(row.key, "installmentNumber", event.target.value)} required /></td>
                  <td className="p-1"><input className={cellInputClass} type="date" value={row.dueDate} onChange={(event) => updateRow(row.key, "dueDate", event.target.value)} required /></td>
                  <td className="p-1"><input className={cellInputClass} inputMode="decimal" value={row.principalMinor} onChange={(event) => updateRow(row.key, "principalMinor", event.target.value)} required /></td>
                  <td className="p-1"><input className={cellInputClass} inputMode="decimal" value={row.totalAmountMinor} onChange={(event) => updateRow(row.key, "totalAmountMinor", event.target.value)} required /></td>
                  <td className="p-1"><input className={cellInputClass} inputMode="decimal" value={row.interestMinor} onChange={(event) => updateRow(row.key, "interestMinor", event.target.value)} required /></td>
                  <td className="p-1"><input className={cellInputClass} inputMode="decimal" value={row.correctionFactor} onChange={(event) => updateRow(row.key, "correctionFactor", event.target.value)} /></td>
                  <td className="p-1"><input className={cellInputClass} inputMode="decimal" value={row.chargesMinor} onChange={(event) => updateRow(row.key, "chargesMinor", event.target.value)} required /></td>
                  <td className="p-1"><input className={cellInputClass} inputMode="decimal" value={row.outstandingBalanceMinor} onChange={(event) => updateRow(row.key, "outstandingBalanceMinor", event.target.value)} required /></td>
                  <td className="p-1">
                    <select className={cellInputClass} value={row.paymentStatus} onChange={(event) => updatePaymentStatus(row.key, event.target.value as EditableScheduleRow["paymentStatus"])}>
                      <option value="scheduled">A vencer</option>
                      <option value="paid">Paga</option>
                    </select>
                  </td>
                  <td className="p-1"><input className={cellInputClass} type="date" value={row.paymentDate} disabled={row.paymentStatus === "scheduled"} onChange={(event) => updateRow(row.key, "paymentDate", event.target.value)} /></td>
                  <td className="p-1"><input className={cellInputClass} inputMode="decimal" value={row.paidAmountMinor} onChange={(event) => updateRow(row.key, "paidAmountMinor", event.target.value)} required /></td>
                  <td className="p-1 text-center">
                    <button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="h-8 rounded-md px-2 font-bold text-red-700 hover:bg-red-50 disabled:opacity-30" aria-label={`Excluir parcela ${row.installmentNumber}`}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <SubmitButton pending={pending}>Cadastrar financiamento</SubmitButton>
      </div>
    </form>
  );
}
