"use client";

import { useActionState, useCallback, useState } from "react";
import {
  createTransaction,
  updateTransaction,
} from "@/app/actions/transactions";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "@/domain/transactions";
import type { CategoryGroupItem } from "@/domain/categories";
import type { CreditCardTransferDestination } from "@/domain/transfers";
import { CategoryCombobox } from "./category-combobox";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import {
  QuickCategoryCreate,
  type QuickCreatedCategory,
} from "./quick-category-create";
import type {
  FinancialContext,
  AccountType,
  SupportedCurrency,
  TransactionStatus,
  TransactionType,
} from "@/types/database";

type AccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  context: FinancialContext;
  type: AccountType;
};

type CategoryOption = {
  id: string;
  group_id: string;
  parent_id: string | null;
  name: string;
  kind: TransactionType;
  context: FinancialContext;
  is_system: boolean;
  archived_at: string | null;
};

type TransactionFormValues = {
  id?: string;
  accountId?: string;
  categoryId?: string;
  transactionType?: TransactionType;
  description?: string;
  amountMinor?: string;
  transactionDate?: string;
  status?: TransactionStatus;
  notes?: string;
};

const initialState: FinancialFormState = { status: "idle" };

export function TransactionForm({
  accounts,
  categories,
  groups,
  values,
  fixedType,
  transferAccounts,
  transferCreditCards,
  onTransferSelected,
  returnAccountId,
  compact = false,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  groups?: CategoryGroupItem[];
  values: TransactionFormValues;
  fixedType?: TransactionType;
  transferAccounts?: AccountOption[];
  transferCreditCards?: CreditCardTransferDestination[];
  onTransferSelected?: (destinationTarget: string) => void;
  returnAccountId?: string;
  compact?: boolean;
}) {
  const action = values.id ? updateTransaction : createTransaction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [transactionType, setTransactionType] = useState<TransactionType>(
    fixedType ?? values.transactionType ?? "expense",
  );
  const [accountId, setAccountId] = useState(values.accountId ?? "");
  const [createdCategories, setCreatedCategories] = useState<
    QuickCreatedCategory[]
  >([]);
  const categoryOptions = [
    ...categories,
    ...createdCategories.filter(
      (created) => !categories.some((category) => category.id === created.id),
    ),
  ];
  const [categoryId, setCategoryId] = useState(values.categoryId ?? "");
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const handleCategoryCreated = useCallback(
    (category: QuickCreatedCategory) => {
      setCreatedCategories((current) => [
        ...current.filter((item) => item.id !== category.id),
        category,
      ]);
      setCategoryId(category.id);
      setQuickCreateOpen(false);
    },
    [setCategoryId, setCreatedCategories, setQuickCreateOpen],
  );

  function changeTransactionType(type: TransactionType) {
    setTransactionType(type);
    const selected = categoryOptions.find(
      (category) => category.id === categoryId,
    );
    if (!selected || selected.kind !== type) setCategoryId("");
  }

  function changeClassification(selection: string) {
    if (selection.startsWith("transfer:")) {
      setCategoryId("");
      onTransferSelected?.(
        `account:${selection.slice("transfer:".length)}`,
      );
      return;
    }
    if (selection.startsWith("credit-card:")) {
      setCategoryId("");
      onTransferSelected?.(selection);
      return;
    }
    setCategoryId(selection);
  }

  return (
    <div className={`grid ${compact ? "gap-3" : "gap-5"}`}>
      <form action={formAction} className={`grid ${compact ? "gap-3" : "gap-5"}`}>
        {values.id ? (
          <input type="hidden" name="id" value={values.id} />
        ) : null}
        {returnAccountId ? (
          <input type="hidden" name="returnAccountId" value={returnAccountId} />
        ) : null}
        {fixedType ? (
          <input type="hidden" name="transactionType" value={fixedType} />
        ) : null}
        {state.message ? <FormMessage>{state.message}</FormMessage> : null}

        <Field
          label="Tipo de lançamento"
          error={state.fieldErrors?.transactionType?.[0]}
          compact={compact}
        >
          <select
            className={inputClass(Boolean(state.fieldErrors?.transactionType), compact)}
            name={fixedType ? undefined : "transactionType"}
            value={transactionType}
            disabled={Boolean(fixedType)}
            onChange={(event) =>
              changeTransactionType(event.target.value as TransactionType)
            }
            required
          >
            {TRANSACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {TRANSACTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

      <Field label="Descrição" error={state.fieldErrors?.description?.[0]} compact={compact}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.description), compact)}
          name="description"
          defaultValue={values.description}
          maxLength={180}
          placeholder={
            transactionType === "income"
              ? "Ex.: Salário"
              : "Ex.: Compra do supermercado"
          }
          required
          aria-invalid={Boolean(state.fieldErrors?.description)}
        />
      </Field>

      <div className={`grid sm:grid-cols-2 ${compact ? "gap-3" : "gap-5"}`}>
        <Field label="Conta" error={state.fieldErrors?.accountId?.[0]} compact={compact}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.accountId), compact)}
            name="accountId"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setCategoryId("");
            }}
            required
            aria-invalid={Boolean(state.fieldErrors?.accountId)}
          >
            <option value="" disabled>
              Selecione
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Categoria" error={state.fieldErrors?.categoryId?.[0]} compact={compact}>
          <div className={`grid ${compact ? "gap-1" : "gap-2"}`}>
            <CategoryCombobox
              name="categoryId"
              categories={categoryOptions}
              transactionType={transactionType}
              value={categoryId}
              onValueChange={changeClassification}
              transferAccounts={values.id ? [] : (transferAccounts ?? [])}
              transferCreditCards={
                values.id ? [] : (transferCreditCards ?? [])
              }
              sourceAccountId={accountId}
              invalid={Boolean(state.fieldErrors?.categoryId)}
              compact={compact}
            />
            {!values.id && accountId && onTransferSelected ? (
              <p className="text-xs text-slate-500">
                Contas e cartões compatíveis aparecem junto às categorias. Ao
                escolher um destino, o formulário muda para Transferência.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setQuickCreateOpen(true)}
              className={`${compact ? "min-h-8 text-xs" : "min-h-10 text-sm"} justify-self-start rounded-lg px-2 font-bold text-blue-700 hover:bg-blue-50`}
            >
              + Criar categoria ou subcategoria
            </button>
          </div>
        </Field>
      </div>

      <div className={`grid sm:grid-cols-3 ${compact ? "gap-3" : "gap-5"}`}>
        <Field label="Valor" error={state.fieldErrors?.amountMinor?.[0]} compact={compact}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.amountMinor), compact)}
            name="amountMinor"
            defaultValue={values.amountMinor}
            inputMode="decimal"
            placeholder="0,00"
            required
            aria-invalid={Boolean(state.fieldErrors?.amountMinor)}
          />
        </Field>

        <Field label="Data" error={state.fieldErrors?.transactionDate?.[0]} compact={compact}>
          <input
            className={inputClass(
              Boolean(state.fieldErrors?.transactionDate),
              compact,
            )}
            name="transactionDate"
            type="date"
            defaultValue={values.transactionDate}
            required
            aria-invalid={Boolean(state.fieldErrors?.transactionDate)}
          />
        </Field>

        <Field label="Status" error={state.fieldErrors?.status?.[0]} compact={compact}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.status), compact)}
            name="status"
            defaultValue={values.status ?? "completed"}
            required
          >
            {TRANSACTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TRANSACTION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]} compact={compact}>
        <textarea
          className={`${inputClass(Boolean(state.fieldErrors?.notes), compact)} ${compact ? "min-h-14 py-2" : "min-h-28 py-3"}`}
          name="notes"
          defaultValue={values.notes}
          maxLength={1000}
          placeholder="Opcional"
          aria-invalid={Boolean(state.fieldErrors?.notes)}
        />
      </Field>

        <SubmitButton pending={pending} compact={compact}>
          {values.id ? "Salvar alterações" : "Criar lançamento"}
        </SubmitButton>
      </form>
      <QuickCategoryCreate
        key={transactionType}
        open={quickCreateOpen}
        kind={transactionType}
        categories={categoryOptions}
        groups={groups ?? []}
        onCreated={handleCategoryCreated}
        onClose={() => setQuickCreateOpen(false)}
      />
    </div>
  );
}
