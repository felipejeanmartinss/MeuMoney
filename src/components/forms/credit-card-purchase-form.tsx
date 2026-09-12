"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createCreditCardPurchase,
  updateCreditCardPurchase,
} from "@/app/actions/credit-cards";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  getInvoiceDueDate,
  splitInstallments,
} from "@/domain/credit-cards";
import {
  formatMoney,
  minorUnitsToInput,
  parseMoneyInputToMinor,
} from "@/domain/money";
import {
  formatIsoDatePtBr,
  formatReferenceMonthPtBr,
} from "@/utils/dates";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import { CategoryCombobox } from "./category-combobox";
import type { FinancialContext, SupportedCurrency } from "@/types/database";

type Values = {
  purchaseId?: string;
  categoryId?: string;
  description?: string;
  totalAmount?: string;
  purchaseDate?: string;
  installmentCount?: number;
  installmentAmounts?: string[];
  isRecurring?: boolean;
  notes?: string | null;
};

const initialState: FinancialFormState = { status: "idle" };

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
}: {
  cardId: string;
  closingDay: number;
  dueDay: number;
  currency: SupportedCurrency;
  categories: {
    id: string;
    parent_id: string | null;
    name: string;
    context: FinancialContext;
  }[];
  values: Values;
}) {
  const action = values.purchaseId
    ? updateCreditCardPurchase
    : createCreditCardPurchase;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [amount, setAmount] = useState(values.totalAmount ?? "");
  const [date, setDate] = useState(values.purchaseDate ?? "");
  const [count, setCount] = useState(values.installmentCount ?? 1);
  const [isRecurring, setIsRecurring] = useState(values.isRecurring ?? false);
  const [installmentAmounts, setInstallmentAmounts] = useState(() =>
    values.installmentAmounts ??
      buildInstallmentAmountInputs(
        values.totalAmount ?? "",
        values.installmentCount ?? 1,
        values.purchaseDate ?? "",
        closingDay,
      ),
  );

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

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="cardId" value={cardId} />
      {values.purchaseId ? (
        <input type="hidden" name="purchaseId" value={values.purchaseId} />
      ) : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.description))}
          name="description"
          defaultValue={values.description}
          maxLength={180}
          placeholder="Ex.: Supermercado"
          required
        />
      </Field>

      <Field
        label="Categoria de despesa"
        error={state.fieldErrors?.categoryId?.[0]}
      >
        <CategoryCombobox
          name="categoryId"
          categories={categories.map((category) => ({
            ...category,
            kind: "expense" as const,
          }))}
          transactionType="expense"
          defaultValue={values.categoryId ?? ""}
          invalid={Boolean(state.fieldErrors?.categoryId)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Valor total" error={state.fieldErrors?.totalAmount?.[0]}>
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
        {isRecurring ? (
          <div className="grid content-end gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Cobrança</span>
            <div className="flex min-h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
              Mensal, sem quantidade fixa
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

      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800">
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

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
        <textarea
          className={inputClass(Boolean(state.fieldErrors?.notes))}
          name="notes"
          defaultValue={values.notes ?? ""}
          rows={3}
          maxLength={1000}
        />
      </Field>

      {preview.length ? (
        <section aria-live="polite" className="overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
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
                : "A soma precisa coincidir com a compra"}
            </span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-2">{isRecurring ? "Tipo" : "Parcela"}</th>
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
                      {formatReferenceMonthPtBr(item.competenceDate)}
                    </td>
                    <td className="px-4 py-2">
                      {formatIsoDatePtBr(
                        getInvoiceDueDate(
                          item.competenceDate,
                          closingDay,
                          dueDay,
                        ),
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
      ) : null}

      <SubmitButton pending={pending} disabled={!distributionMatches}>
        {values.purchaseId ? "Salvar compra" : "Registrar compra"}
      </SubmitButton>
    </form>
  );
}
