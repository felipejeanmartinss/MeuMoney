"use client";

import { useState } from "react";
import {
  correctFinancialImportClassification,
  toggleFinancialImportRow,
} from "@/app/actions/file-imports";
import { minorUnitsToInput } from "@/domain/money";
import type {
  Category,
  ImportStagingRow,
  Account,
  TransactionType,
} from "@/types/database";
import { CategoryCombobox } from "./category-combobox";
import { inputClass } from "./form-controls";

const statusPresentation = {
  needs_review: {
    label: "Revisar",
    className: "bg-amber-100 text-amber-800",
  },
  valid: {
    label: "Pronta",
    className: "bg-emerald-100 text-emerald-800",
  },
  duplicate: {
    label: "Duplicidade",
    className: "bg-violet-100 text-violet-800",
  },
  ignored: {
    label: "Ignorada",
    className: "bg-slate-100 text-slate-700",
  },
  imported: {
    label: "Importada",
    className: "bg-blue-100 text-blue-800",
  },
  error: {
    label: "Corrigir",
    className: "bg-red-100 text-red-800",
  },
} as const;

function expectedType(value: string): TransactionType {
  return value.trim().startsWith("-") ? "expense" : "income";
}

export function ImportStagingRowForm({
  jobId,
  row,
  categories,
  accounts,
  page,
}: {
  jobId: string;
  row: ImportStagingRow;
  categories: Pick<
    Category,
    "id" | "parent_id" | "name" | "kind" | "context"
  >[];
  accounts: Pick<Account, "id" | "name" | "type" | "currency">[];
  page: number;
}) {
  const initialAmount =
    row.signed_amount_minor === null
      ? row.source_amount_text
      : minorUnitsToInput(row.signed_amount_minor);
  const [amount, setAmount] = useState(initialAmount);
  const transactionType = expectedType(amount);
  const presentation = statusPresentation[row.status];
  const editable = !["imported"].includes(row.status);
  const isTransfer = row.record_kind === "transfer";
  const [classification, setClassification] = useState(
    isTransfer && row.transfer_account_id
      ? `transfer:${row.transfer_account_id}`
      : row.category_id
        ? `category:${row.category_id}`
        : "",
  );
  function changeAmount(nextAmount: string) {
    setAmount(nextAmount);
    if (!classification.startsWith("category:")) return;
    const categoryId = classification.slice("category:".length);
    const selected = categories.find((category) => category.id === categoryId);
    if (!selected || selected.kind !== expectedType(nextAmount)) {
      setClassification("");
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-500">
            Linha {row.source_row_number}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${presentation.className}`}
          >
            {presentation.label}
          </span>
        </div>
        {row.source_external_id ? (
          <span className="max-w-56 truncate text-xs text-slate-500">
            ID do banco: {row.source_external_id}
          </span>
        ) : null}
      </div>

      {row.source_pages.length > 0 || row.confidence !== null ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          {row.source_pages.length > 0 ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">
              Página{row.source_pages.length === 1 ? "" : "s"}{" "}
              {row.source_pages.join(", ")}
            </span>
          ) : null}
          {row.confidence !== null ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1">
              Confiança {Math.round(row.confidence * 100)}%
            </span>
          ) : null}
        </div>
      ) : null}

      {row.source_description_original ? (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold">Descrição original:</span>{" "}
          {row.source_description_original}
        </p>
      ) : null}

      {row.source_category_name ? (
        <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span className="font-semibold">Categoria no QIF:</span>{" "}
          {row.source_category_name}
        </p>
      ) : null}
      {row.transfer_account_name ? (
        <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span className="font-semibold">Conta indicada no QIF:</span>{" "}
          {row.transfer_account_name}
        </p>
      ) : null}

      {row.status === "duplicate" ? (
        <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
          {isTransfer
            ? "Uma transferência com as mesmas contas, data e valor já existe."
            : "Uma movimentação com a mesma conta, data, valor e descrição já existe. Edite a linha se ela realmente for diferente."}
        </p>
      ) : null}
      {row.validation_code ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          O arquivo trouxe um dado inválido. Valores originais: data{" "}
          <strong>{row.source_date_text || "vazia"}</strong> e valor{" "}
          <strong>{row.source_amount_text || "vazio"}</strong>.
        </p>
      ) : null}

      {editable && row.status !== "ignored" ? (
        <form
          action={correctFinancialImportClassification}
          className="mt-4 grid gap-4 lg:grid-cols-12"
        >
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="rowId" value={row.id} />
          <input type="hidden" name="page" value={page} />
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700 lg:col-span-2">
            Data
            <input
              className={inputClass()}
              name="transactionDate"
              type="date"
              defaultValue={row.transaction_date ?? ""}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700 lg:col-span-4">
            Descrição
            <input
              className={inputClass()}
              name="description"
              defaultValue={row.description ?? ""}
              maxLength={180}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700 lg:col-span-2">
            Valor com sinal
            <input
              className={inputClass()}
              name="signedAmountMinor"
              value={amount}
              onChange={(event) => changeAmount(event.target.value)}
              inputMode="decimal"
              placeholder="-120,50"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700 lg:col-span-3">
            Categoria ou transferência
            <CategoryCombobox
              name="classification"
              categories={categories}
              transactionType={transactionType}
              value={classification}
              onValueChange={setClassification}
              transferAccounts={accounts}
              sourceAccountId={row.account_id}
              prefixCategoryValue
            />
          </label>
          <div className="flex items-end lg:col-span-1">
            <button className="min-h-12 w-full rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800">
              Salvar
            </button>
          </div>
          <p className="text-xs text-slate-500 lg:col-span-12">
            Transferências entre contas correntes, poupança, caixa e
            investimentos ficam fora das receitas e despesas. Pagamentos de
            cartão continuam no fluxo da fatura para evitar gasto duplicado.
          </p>
        </form>
      ) : (
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <span>{row.transaction_date ?? row.source_date_text}</span>
          <span className="font-semibold text-slate-950">
            {row.description ?? "Sem descrição"}
          </span>
          <span>{initialAmount}</span>
        </div>
      )}

      {editable ? (
        <form action={toggleFinancialImportRow} className="mt-3">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="rowId" value={row.id} />
          <input type="hidden" name="page" value={page} />
          <input
            type="hidden"
            name="ignored"
            value={row.status === "ignored" ? "false" : "true"}
          />
          <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            {row.status === "ignored" ? "Reincluir na revisão" : "Ignorar linha"}
          </button>
        </form>
      ) : null}
    </article>
  );
}
