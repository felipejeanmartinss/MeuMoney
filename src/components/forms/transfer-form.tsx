"use client";

import { useActionState, useState } from "react";
import {
  createTransfer,
  updateTransfer,
} from "@/app/actions/transfers";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  TRANSACTION_STATUSES,
  TRANSACTION_STATUS_LABELS,
} from "@/domain/transactions";
import { CONTEXT_LABELS } from "@/domain/accounts";
import {
  accountTransferDestinationValue,
  calculateTransferExchangeRate,
  creditCardTransferDestinationValue,
  parseTransferDestinationTarget,
  type CreditCardTransferDestination,
} from "@/domain/transfers";
import { formatMoney, parseMoneyInputToMinor } from "@/domain/money";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";
import type {
  FinancialContext,
  SupportedCurrency,
  TransactionStatus,
} from "@/types/database";

type AccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  context: FinancialContext;
};

type TransferFormValues = {
  id?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  destinationCreditCardId?: string;
  destinationTarget?: string;
  amountMinor?: string;
  destinationAmountMinor?: string;
  transactionDate?: string;
  status?: TransactionStatus;
  description?: string;
  notes?: string;
};

const initialState: FinancialFormState = { status: "idle" };

export function TransferForm({
  accounts,
  creditCards = [],
  values,
  returnAccountId,
  compact = false,
}: {
  accounts: AccountOption[];
  creditCards?: CreditCardTransferDestination[];
  values: TransferFormValues;
  returnAccountId?: string;
  compact?: boolean;
}) {
  const action = values.id ? updateTransfer : createTransfer;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [sourceId, setSourceId] = useState(values.sourceAccountId ?? "");
  const [destinationTarget, setDestinationTarget] = useState(
    values.destinationTarget ??
      (values.destinationAccountId
      ? accountTransferDestinationValue(values.destinationAccountId)
      : values.destinationCreditCardId
        ? creditCardTransferDestinationValue(values.destinationCreditCardId)
        : ""),
  );
  const [amountInput, setAmountInput] = useState(values.amountMinor ?? "0,00");
  const [destinationAmountInput, setDestinationAmountInput] = useState(
    values.destinationAmountMinor ?? values.amountMinor ?? "0,00",
  );
  const source = accounts.find((account) => account.id === sourceId);
  const parsedDestination = parseTransferDestinationTarget(destinationTarget);
  const destinationAccountId =
    parsedDestination?.kind === "account" ? parsedDestination.id : "";
  const selectedDestinationAccount =
    parsedDestination?.kind === "account"
      ? accounts.find((account) => account.id === parsedDestination.id)
      : undefined;
  const selectedCreditCard =
    parsedDestination?.kind === "credit_card"
      ? creditCards.find(
          (destination) => destination.id === parsedDestination.id,
        )
      : undefined;
  const destinationOptions = accounts.filter(
    (account) => account.id !== sourceId,
  );
  const creditCardOptions = creditCards.filter(
    (destination) => !source || destination.currency === source.currency,
  );

  function destinationCurrency(target: string) {
    const parsed = parseTransferDestinationTarget(target);
    if (parsed?.kind === "account") {
      return accounts.find((account) => account.id === parsed.id)?.currency;
    }
    if (parsed?.kind === "credit_card") {
      return creditCards.find(
        (destination) => destination.id === parsed.id,
      )?.currency;
    }
    return undefined;
  }

  function changeDestination(target: string) {
    setDestinationTarget(target);
  }

  function changeSource(id: string) {
    setSourceId(id);
    const nextSource = accounts.find((account) => account.id === id);
    if (!destinationTarget || destinationAccountId === id) {
      setDestinationTarget("");
      return;
    }
    const destination = parseTransferDestinationTarget(destinationTarget);
    if (
      destination?.kind === "credit_card" &&
      destinationCurrency(destinationTarget) !== nextSource?.currency
    ) {
      setDestinationTarget("");
    }
  }

  const isCurrencyConversion = Boolean(
    source &&
      selectedDestinationAccount &&
      source.currency !== selectedDestinationAccount.currency,
  );
  let exchangeRate: number | null = null;
  if (isCurrencyConversion) {
    try {
      exchangeRate = calculateTransferExchangeRate(
        parseMoneyInputToMinor(amountInput),
        parseMoneyInputToMinor(destinationAmountInput),
      );
    } catch {
      exchangeRate = null;
    }
  }

  return (
    <form action={formAction} className={`grid ${compact ? "gap-3" : "gap-5"}`}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {returnAccountId ? (
        <input type="hidden" name="returnAccountId" value={returnAccountId} />
      ) : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <div className={`grid sm:grid-cols-2 ${compact ? "gap-3" : "gap-5"}`}>
        <Field
          label="Conta de origem"
          error={state.fieldErrors?.sourceAccountId?.[0]}
          compact={compact}
        >
          <select
            className={inputClass(
              Boolean(state.fieldErrors?.sourceAccountId),
              compact,
            )}
            name="sourceAccountId"
            value={sourceId}
            onChange={(event) => changeSource(event.target.value)}
            required
          >
            <option value="" disabled>
              Selecione
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency} ·{" "}
                {CONTEXT_LABELS[account.context]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Conta ou cartão de destino"
          error={
            state.fieldErrors?.destinationTarget?.[0] ??
            state.fieldErrors?.destinationAccountId?.[0]
          }
          compact={compact}
        >
          <select
            className={inputClass(
              Boolean(
                state.fieldErrors?.destinationTarget ??
                  state.fieldErrors?.destinationAccountId,
              ),
              compact,
            )}
            name="destinationTarget"
            value={destinationTarget}
            onChange={(event) => changeDestination(event.target.value)}
            required
          >
            <option value="" disabled>
              {sourceId
                ? "Selecione uma conta ou cartão"
                : "Escolha primeiro a origem"}
            </option>
            {destinationOptions.length > 0 ? (
              <optgroup label="Contas">
                {destinationOptions.map((account) => (
                  <option
                    key={account.id}
                    value={accountTransferDestinationValue(account.id)}
                  >
                    {account.name} · {account.currency} ·{" "}
                    {CONTEXT_LABELS[account.context]}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {creditCardOptions.length > 0 ? (
              <optgroup label="Cartões de crédito">
                {creditCardOptions.map((destination) => (
                  <option
                    key={destination.id}
                    value={creditCardTransferDestinationValue(
                      destination.id,
                    )}
                  >
                    {destination.cardName} · saldo{" "}
                    {formatMoney(
                      destination.currentBalanceMinor,
                      destination.currency,
                    )}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </Field>
      </div>

      <div
        className={`grid ${
          isCurrencyConversion
            ? "sm:grid-cols-2 lg:grid-cols-4"
            : "sm:grid-cols-3"
        } ${compact ? "gap-3" : "gap-5"}`}
      >
        <Field
          label={
            isCurrencyConversion && source
              ? `Valor de saída (${source.currency})`
              : "Valor"
          }
          error={state.fieldErrors?.amountMinor?.[0]}
          compact={compact}
        >
          <input
            className={inputClass(Boolean(state.fieldErrors?.amountMinor), compact)}
            name="amountMinor"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </Field>

        {isCurrencyConversion && selectedDestinationAccount ? (
          <Field
            label={`Valor de entrada (${selectedDestinationAccount.currency})`}
            error={state.fieldErrors?.destinationAmountMinor?.[0]}
            compact={compact}
          >
            <input
              className={inputClass(
                Boolean(state.fieldErrors?.destinationAmountMinor),
                compact,
              )}
              name="destinationAmountMinor"
              value={destinationAmountInput}
              onChange={(event) =>
                setDestinationAmountInput(event.target.value)
              }
              inputMode="decimal"
              placeholder="0,00"
              required
            />
          </Field>
        ) : (
          <input
            type="hidden"
            name="destinationAmountMinor"
            value={amountInput}
          />
        )}

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

      {selectedCreditCard ? (
        <p className={`${compact ? "rounded-md px-3 py-2 text-xs leading-5" : "rounded-xl p-4 text-sm leading-6"} border border-blue-200 bg-blue-50 text-blue-950`}>
          A transferência reduz o caixa da conta de origem e o saldo devedor
          de {selectedCreditCard.cardName}. Ela entra apenas no regime de
          caixa; as compras continuam no mês de competência.
        </p>
      ) : null}

      {isCurrencyConversion && source && selectedDestinationAccount ? (
        <p
          className={`${
            compact
              ? "rounded-md px-3 py-2 text-xs"
              : "rounded-xl px-4 py-3 text-sm"
          } border border-emerald-200 bg-emerald-50 text-emerald-950`}
        >
          Conversão entre contas: sai em {source.currency} e entra em{" "}
          {selectedDestinationAccount.currency}.
          {exchangeRate !== null ? (
            <span className="ml-1 font-bold">
              Taxa implícita: 1 {source.currency} ={" "}
              {exchangeRate.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6,
              })}{" "}
              {selectedDestinationAccount.currency}.
            </span>
          ) : null}
        </p>
      ) : null}

      <Field
        label="Descrição opcional"
        error={state.fieldErrors?.description?.[0]}
        compact={compact}
      >
        <input
          className={inputClass(Boolean(state.fieldErrors?.description), compact)}
          name="description"
          defaultValue={values.description}
          maxLength={180}
          placeholder="Ex.: Reserva para emergência"
        />
      </Field>

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]} compact={compact}>
        <textarea
          className={`${inputClass(Boolean(state.fieldErrors?.notes), compact)} ${compact ? "min-h-14 py-2" : "min-h-28 py-3"}`}
          name="notes"
          defaultValue={values.notes}
          maxLength={1000}
          placeholder="Opcional"
        />
      </Field>

      <SubmitButton pending={pending} compact={compact}>
        {values.id
          ? "Salvar alterações"
          : selectedCreditCard
            ? "Transferir para o cartão"
            : isCurrencyConversion
              ? "Converter e transferir"
            : "Criar transferência"}
      </SubmitButton>
    </form>
  );
}
