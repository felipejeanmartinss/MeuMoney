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
import { formatMoney, parseMoneyInputToMinor } from "@/domain/money";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type { SupportedCurrency } from "@/types/database";

type Values = {
  purchaseId?: string;
  categoryId?: string;
  description?: string;
  totalAmount?: string;
  purchaseDate?: string;
  installmentCount?: number;
  notes?: string | null;
};

const initialState: FinancialFormState = { status: "idle" };

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
  categories: { id: string; name: string; context: string }[];
  values: Values;
}) {
  const action = values.purchaseId
    ? updateCreditCardPurchase
    : createCreditCardPurchase;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [amount, setAmount] = useState(values.totalAmount ?? "");
  const [date, setDate] = useState(values.purchaseDate ?? "");
  const [count, setCount] = useState(values.installmentCount ?? 1);

  const preview = useMemo(() => {
    try {
      const total = parseMoneyInputToMinor(amount);
      return splitInstallments(total, count, date, closingDay).slice(0, 12);
    } catch {
      return [];
    }
  }, [amount, closingDay, count, date]);

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
        <select
          className={inputClass(Boolean(state.fieldErrors?.categoryId))}
          name="categoryId"
          defaultValue={values.categoryId ?? ""}
          required
        >
          <option value="" disabled>
            Selecione
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} ·{" "}
              {category.context === "professional"
                ? "Profissional"
                : "Pessoal"}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Valor total" error={state.fieldErrors?.totalAmount?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.totalAmount))}
            name="totalAmount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
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
            onChange={(event) => setCount(Number(event.target.value))}
            required
          />
        </Field>
      </div>

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
        <section
          aria-live="polite"
          className="rounded-xl border border-blue-100 bg-blue-50 p-4"
        >
          <h2 className="font-bold text-blue-950">Prévia das parcelas</h2>
          <ul className="mt-3 grid gap-2 text-sm text-blue-950 sm:grid-cols-2">
            {preview.map((item) => (
              <li key={item.installmentNumber}>
                {item.installmentNumber}/{item.installmentCount} ·{" "}
                {formatMoney(item.amountMinor, currency)} · fatura{" "}
                {item.competenceDate.slice(0, 7)} · vence{" "}
                {getInvoiceDueDate(item.competenceDate, closingDay, dueDay)}
              </li>
            ))}
          </ul>
          {count > 12 ? (
            <p className="mt-2 text-xs text-blue-800">
              Mostrando as 12 primeiras de {count} parcelas.
            </p>
          ) : null}
        </section>
      ) : null}

      <SubmitButton pending={pending}>
        {values.purchaseId ? "Salvar compra" : "Registrar compra"}
      </SubmitButton>
    </form>
  );
}
