"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createCreditCardPurchase,
  updateCreditCardPurchase,
} from "@/app/actions/credit-cards";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  CREDIT_CARD_ENTRY_KIND_LABELS,
  getInvoiceBillingMonth,
  getInvoiceDueDate,
  splitInstallments,
} from "@/domain/credit-cards";
import {
  formatMoney,
  minorUnitsToInput,
  parseMoneyInputToMinor,
} from "@/domain/money";
import type {
  CategoryKind,
  CreditCardEntryKind,
  FinancialContext,
  SupportedCurrency,
} from "@/types/database";
import {
  formatIsoDatePtBr,
  formatReferenceMonthPtBr,
} from "@/utils/dates";
import { CategoryCombobox } from "./category-combobox";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type Values = {
  purchaseId?: string;
  entryKind?: CreditCardEntryKind;
  categoryId?: string | null;
  description?: string;
  totalAmount?: string;
  purchaseDate?: string;
  installmentCount?: number;
  installmentAmounts?: string[];
  isRecurring?: boolean;
  notes?: string | null;
};

type CategoryOption = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: CategoryKind;
  context: FinancialContext;
};

const initialState: FinancialFormState = { status: "idle" };
const ALL_ENTRY_KINDS: CreditCardEntryKind[] = [
  "purchase",
  "refund",
  "cashback",
];

function buildInstallmentAmountInputs(
  amount: string,
  count: number,
  date: string,
  closingDay: number,
) {
  try {
    return splitInstallments(
      parseMoneyInputToMinor(amount),
      count,
      date,
      closingDay,
    ).map((item) => minorUnitsToInput(item.amountMinor));
  } catch {
    return [];
  }
}

export function CreditCardPurchaseForm({
  cardId,
  closingDay,
  dueDay,
  currency,
  categories,
  values,
  compact = false,
  targetInvoiceId = null,
  entryKinds = ALL_ENTRY_KINDS,
}: {
  cardId: string;
  closingDay: number;
  dueDay: number;
  currency: SupportedCurrency;
  categories: CategoryOption[];
  values: Values;
  compact?: boolean;
  targetInvoiceId?: string | null;
  entryKinds?: CreditCardEntryKind[];
}) {
  const action = values.purchaseId
    ? updateCreditCardPurchase
    : createCreditCardPurchase;
  const [state, formAction, pending] = useActionState(action, initialState);
  const initialEntryKind = values.entryKind ?? entryKinds[0] ?? "purchase";
  const [entryKind, setEntryKind] = useState(initialEntryKind);
  const [amount, setAmount] = useState(values.totalAmount ?? "");
  const [date, setDate] = useState(values.purchaseDate ?? "");
  const [count, setCount] = useState(values.installmentCount ?? 1);
  const [isRecurring, setIsRecurring] = useState(values.isRecurring ?? false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [installmentAmounts, setInstallmentAmounts] = useState(() =>
    values.installmentAmounts ??
      buildInstallmentAmountInputs(
        values.totalAmount ?? "",
        values.installmentCount ?? 1,
        values.purchaseDate ?? "",
        closingDay,
      ),
  );
  const isCredit = entryKind !== "purchase";

  const preview = useMemo(() => {
    try {
      const total = parseMoneyInputToMinor(amount);
      return splitInstallments(total, count, date, closingDay).map(
        (item, index) => ({
          ...item,
          amountInput:
            installmentAmounts[index] ?? minorUnitsToInput(item.amountMinor),
        }),
      );
    } catch {
      return [];
    }
  }, [amount, closingDay, count, date, installmentAmounts]);

  const distributionMatches = useMemo(() => {
    if (preview.length !== count) return false;
    try {
      return (
        installmentAmounts.reduce(
          (sum, item) => sum + parseMoneyInputToMinor(item),
          0,
        ) === parseMoneyInputToMinor(amount)
      );
    } catch {
      return false;
    }
  }, [amount, count, installmentAmounts, preview.length]);

  function changeAmount(nextAmount: string) {
    setAmount(nextAmount);
    setInstallmentAmounts(
      buildInstallmentAmountInputs(nextAmount, count, date, closingDay),
    );
  }

  function changeCount(nextCount: number) {
    setCount(nextCount);
    setPreviewOpen(false);
    setInstallmentAmounts(
      buildInstallmentAmountInputs(amount, nextCount, date, closingDay),
    );
  }

  function changeInstallmentAmount(index: number, nextAmount: string) {
    setInstallmentAmounts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? nextAmount : item,
      ),
    );
  }

  function changeRecurring(nextRecurring: boolean) {
    setIsRecurring(nextRecurring);
    if (nextRecurring) changeCount(1);
  }

  function changeEntryKind(nextKind: CreditCardEntryKind) {
    setEntryKind(nextKind);
    if (nextKind !== "purchase") {
      setIsRecurring(false);
      changeCount(1);
    }
  }

  const previewTable = preview.length ? (
    <section aria-live="polite" className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2.5">
        <h2 className="font-bold text-slate-950">
          {isRecurring ? "Primeira cobrança" : "Prévia das parcelas"}
        </h2>
        <span
          className={`text-xs font-semibold ${
            distributionMatches ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {distributionMatches
            ? `Total ${formatMoney(parseMoneyInputToMinor(amount), currency)}`
            : "A soma precisa coincidir com o lançamento"}
        </span>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-2">Parcela</th>
              <th className="px-4 py-2">Fatura</th>
              <th className="px-4 py-2">Vencimento</th>
              <th className="px-4 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((item, index) => (
              <tr key={item.installmentNumber} className="border-t">
                <td className="px-4 py-2 font-semibold">
                  {isRecurring
                    ? "Assinatura"
                    : `${item.installmentNumber}/${item.installmentCount}`}
                </td>
                <td className="px-4 py-2">
                  {formatReferenceMonthPtBr(
                    getInvoiceBillingMonth(
                      getInvoiceDueDate(
                        item.competenceDate,
                        closingDay,
                        dueDay,
                      ),
                    ),
                  )}
                </td>
                <td className="px-4 py-2">
                  {formatIsoDatePtBr(
                    getInvoiceDueDate(item.competenceDate, closingDay, dueDay),
                  )}
                </td>
                <td className="px-4 py-1.5 text-right">
                  <input
                    aria-label={`Valor da parcela ${item.installmentNumber}`}
                    className={`${inputClass(
                      Boolean(state.fieldErrors?.installmentAmounts),
                    )} ml-auto h-10 max-w-36 text-right`}
                    name="installmentAmounts"
                    value={item.amountInput}
                    onChange={(event) =>
                      changeInstallmentAmount(index, event.target.value)
                    }
                    inputMode="decimal"
                    required
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.fieldErrors?.installmentAmounts?.[0] ? (
        <p className="border-t bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {state.fieldErrors.installmentAmounts[0]}
        </p>
      ) : null}
    </section>
  ) : null;

  return (
    <form action={formAction} className={`grid ${compact ? "gap-3" : "gap-5"}`}>
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="entryKind" value={entryKind} />
      <input
        type="hidden"
        name="targetInvoiceId"
        value={targetInvoiceId ?? ""}
      />
      {values.purchaseId ? (
        <input type="hidden" name="purchaseId" value={values.purchaseId} />
      ) : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {entryKinds.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={entryKind === kind}
            className={`min-h-9 rounded-lg px-4 text-sm font-bold ${
              entryKind === kind
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600 hover:text-slate-950"
            }`}
            onClick={() => changeEntryKind(kind)}
          >
            {CREDIT_CARD_ENTRY_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.description))}
            name="description"
            defaultValue={values.description}
            maxLength={180}
            placeholder={isCredit ? "Ex.: Estorno da compra" : "Ex.: Supermercado"}
            required
          />
        </Field>

        {isCredit ? (
          <input type="hidden" name="categoryId" value="" />
        ) : (
          <Field
            label="Categoria de despesa"
            error={state.fieldErrors?.categoryId?.[0]}
          >
            <CategoryCombobox
              name="categoryId"
              categories={categories.filter(
                (category) => category.kind === "expense",
              )}
              transactionType="expense"
              defaultValue={values.categoryId ?? ""}
              invalid={Boolean(state.fieldErrors?.categoryId)}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={isCredit ? "Valor do crédito" : "Valor total"}
          error={state.fieldErrors?.totalAmount?.[0]}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.totalAmount))}
            name="totalAmount"
            value={amount}
            onChange={(event) => changeAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </Field>
        <Field label="Data" error={state.fieldErrors?.purchaseDate?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.purchaseDate))}
            name="purchaseDate"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </Field>
        {isCredit || isRecurring ? (
          <div className="grid content-end gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Forma</span>
            <div className="flex min-h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
              {isCredit ? "Crédito único" : "Mensal, sem quantidade fixa"}
            </div>
            <input type="hidden" name="installmentCount" value="1" />
          </div>
        ) : (
          <Field
            label="Parcelas"
            error={state.fieldErrors?.installmentCount?.[0]}
          >
            <input
              className={inputClass(Boolean(state.fieldErrors?.installmentCount))}
              name="installmentCount"
              type="number"
              min={1}
              max={240}
              value={count}
              onChange={(event) => changeCount(Number(event.target.value))}
              required
            />
          </Field>
        )}
      </div>

      {!isCredit ? (
        <label className="flex min-h-10 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800">
          <input
            className="h-4 w-4 accent-blue-700"
            type="checkbox"
            name="isRecurring"
            value="true"
            checked={isRecurring}
            onChange={(event) => changeRecurring(event.target.checked)}
          />
          Assinatura ou compra recorrente
        </label>
      ) : (
        <input type="hidden" name="isRecurring" value="false" />
      )}

      {!compact ? (
        <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
          <textarea
            className={inputClass(Boolean(state.fieldErrors?.notes))}
            name="notes"
            defaultValue={values.notes ?? ""}
            rows={3}
            maxLength={1000}
          />
        </Field>
      ) : (
        <input type="hidden" name="notes" value={values.notes ?? ""} />
      )}

      {compact && !previewOpen
        ? preview.map((item) => (
            <input
              key={item.installmentNumber}
              type="hidden"
              name="installmentAmounts"
              value={item.amountInput}
            />
          ))
        : !compact
          ? previewTable
          : null}

      {compact && count > 1 ? (
        <button
          type="button"
          className="min-h-11 rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:opacity-50"
          disabled={!distributionMatches}
          onClick={() => setPreviewOpen(true)}
        >
          Revisar {count} parcelas
        </button>
      ) : (
        <SubmitButton pending={pending} disabled={!distributionMatches}>
          {values.purchaseId
            ? "Salvar lançamento"
            : isCredit
              ? "Registrar crédito"
              : "Registrar compra"}
        </SubmitButton>
      )}

      {compact && count > 1 && previewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Revisão das parcelas"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
        >
          <section className="grid max-h-[90vh] w-full max-w-3xl gap-4 overflow-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">
                  Revisar parcelas
                </h2>
                <p className="text-sm text-slate-500">
                  Ajuste centavos antes de registrar a compra.
                </p>
              </div>
              <button
                type="button"
                className="min-h-9 rounded-lg border px-3 text-sm font-bold"
                onClick={() => setPreviewOpen(false)}
              >
                Voltar
              </button>
            </div>
            {previewTable}
            <SubmitButton pending={pending} disabled={!distributionMatches}>
              Registrar compra
            </SubmitButton>
          </section>
        </div>
      ) : null}
    </form>
  );
}
