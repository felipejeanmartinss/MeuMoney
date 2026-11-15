"use client";

import { useState } from "react";
import { confirmFinancingPayment } from "@/app/actions/financing-imports";
import { formatMoney } from "@/domain/money";
import type { FinancingTransactionOption } from "@/types/financing";
import { formatIsoDatePtBr } from "@/utils/dates";

export function FinancingPaymentPicker({ contractId, entryId, version, number, expected, currency, options }: {
  contractId: string; entryId: string; version: string; number: number; expected: number; currency: string; options: FinancingTransactionOption[];
}) {
  const [search, setSearch] = useState("");
  const [id, setId] = useState("");
  const choices = options.filter(t => [t.description, t.account_name, formatIsoDatePtBr(t.transaction_date), formatMoney(t.amount_minor,currency)].join(" ").toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  const tx = choices.find(t => t.id === id);
  const diff = tx ? tx.amount_minor - expected : 0;
  return <form action={confirmFinancingPayment} className="grid gap-3 rounded-xl border bg-white p-4">
    <h2 className="font-bold">Vincular pagamento · parcela {number}</h2>
    <p>Débito esperado em conta: {formatMoney(expected, currency)}</p>
    <label>Buscar por descrição, conta, data ou valor<input className="block w-full rounded-lg border p-2" value={search} onChange={e => {setSearch(e.target.value); setId("");}} /></label>
    <label>Débito realizado<select className="block w-full rounded-lg border p-2" value={id} onChange={e => setId(e.target.value)} required>
      <option value="">Selecione um lançamento</option>{choices.map(t => <option key={t.id} value={t.id}>{formatIsoDatePtBr(t.transaction_date)} · {t.account_name} · {t.description} · {formatMoney(t.amount_minor,currency)}</option>)}
    </select></label>
    {!choices.length && <p>Nenhum débito disponível para este filtro.</p>}
    {tx && <div key={tx.id} className="grid gap-2">
      <p>{tx.account_name} · {formatIsoDatePtBr(tx.transaction_date)} · {formatMoney(tx.amount_minor,currency)}</p>
      {diff !== 0 && <label><input type="checkbox" name="accept_difference" value="yes" required /> Diferença: {formatMoney(diff,currency)}. Confirmo que este débito quita a parcela, mesmo com essa diferença.</label>}
      {Object.entries({contract_id_in:contractId,entry_id_in:entryId,version_in:version,transaction_id_in:tx.id,amount_in:tx.amount_minor,date_in:tx.transaction_date,account_in:tx.account_id}).map(([name,value]) => <input type="hidden" key={name} name={name} value={value} />)}
      <p className="text-sm text-slate-600">A parcela ficará paga na data do débito. Nenhum lançamento será criado ou alterado na conta.</p>
      <button className="w-fit rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white">Confirmar vínculo e baixa</button>
    </div>}
  </form>;
}
