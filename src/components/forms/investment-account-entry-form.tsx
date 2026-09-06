"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  createInvestmentAccountEntry,
  type InvestmentFormState,
} from "@/app/actions/investments";
import {
  INVESTMENT_ACCOUNT_EVENT_LABELS,
  INVESTMENT_ACCOUNT_EVENT_TYPES,
  INVESTMENT_CLASSES,
  INVESTMENT_CLASS_LABELS,
  INVESTMENT_TYPES_BY_CLASS,
  INVESTMENT_TYPE_LABELS,
  investmentEventTransactionType,
} from "@/domain/investments";
import type {
  FinancialContext,
  InvestmentAccountEventType,
  InvestmentClass,
  InvestmentPositionSummary,
  SupportedCurrency,
} from "@/types/database";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

type InvestmentAccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  context: FinancialContext;
};

const initialState: InvestmentFormState = { status: "idle" };

export function InvestmentAccountEntryForm({
  accounts,
  positions,
  initialAccountId,
  transactionDate,
  returnAccountId,
}: {
  accounts: InvestmentAccountOption[];
  positions: InvestmentPositionSummary[];
  initialAccountId?: string;
  transactionDate: string;
  returnAccountId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createInvestmentAccountEntry,
    initialState,
  );
  const [accountId, setAccountId] = useState(initialAccountId ?? "");
  const [eventType, setEventType] = useState<InvestmentAccountEventType>(
    "contribution",
  );
  const [positionId, setPositionId] = useState("");
  const [investmentClass, setInvestmentClass] =
    useState<InvestmentClass>("fixed_income");
  const account = accounts.find((item) => item.id === accountId);
  const accountCurrency = account?.currency;
  const accountContext = account?.context;
  const compatiblePositions = useMemo(
    () =>
      positions.filter(
        (position) =>
          position.is_active &&
          position.currency === accountCurrency &&
          position.context === accountContext,
      ),
    [accountContext, accountCurrency, positions],
  );
  const transactionType = investmentEventTransactionType(eventType);

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Cadastre ou reative uma conta do tipo Investimento antes de registrar
        aplicações e liquidações.
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      {returnAccountId ? (
        <input type="hidden" name="returnAccountId" value={returnAccountId} />
      ) : null}
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Conta de investimento" error={state.fieldErrors?.accountId?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.accountId))}
            name="accountId"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setPositionId("");
            }}
            required
          >
            <option value="" disabled>Selecione</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.currency}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Movimento" error={state.fieldErrors?.eventType?.[0]}>
          <select
            className={inputClass(Boolean(state.fieldErrors?.eventType))}
            name="eventType"
            value={eventType}
            onChange={(event) => {
              const nextEvent = event.target.value as InvestmentAccountEventType;
              setEventType(nextEvent);
              if (nextEvent !== "contribution" && positionId === "new") {
                setPositionId("");
              }
            }}
            required
          >
            {INVESTMENT_ACCOUNT_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {INVESTMENT_ACCOUNT_EVENT_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Posição vinculada" error={state.fieldErrors?.positionId?.[0]}>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            className={inputClass(Boolean(state.fieldErrors?.positionId))}
            name="positionId"
            value={positionId}
            onChange={(event) => setPositionId(event.target.value)}
            required
          >
            <option value="" disabled>
              {account ? "Selecione a posição" : "Escolha a conta primeiro"}
            </option>
            {compatiblePositions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.asset_name} · {position.institution}
              </option>
            ))}
            {eventType === "contribution" ? (
              <option value="new">+ Criar nova posição com este aporte</option>
            ) : null}
          </select>
          <Link
            href="/investments/new"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Nova posição
          </Link>
        </div>
        {account && compatiblePositions.length === 0 ? (
          <span className="text-xs font-normal text-amber-700">
            Não há posição ativa com a mesma moeda e contexto desta conta.
          </span>
        ) : null}
      </Field>

      {positionId === "new" ? (
        <fieldset className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <legend className="px-1 text-sm font-black text-emerald-950">
            Nova posição
          </legend>
          <p className="text-sm text-emerald-950">
            O aporte inicial será usado como custo e valor da primeira
            fotografia, sem ganho presumido.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Instituição"
              error={state.fieldErrors?.newInstitution?.[0]}
            >
              <input
                className={inputClass(Boolean(state.fieldErrors?.newInstitution))}
                name="newInstitution"
                maxLength={120}
                required
              />
            </Field>
            <Field label="Ativo" error={state.fieldErrors?.newAssetName?.[0]}>
              <input
                className={inputClass(Boolean(state.fieldErrors?.newAssetName))}
                name="newAssetName"
                maxLength={160}
                required
              />
            </Field>
            <Field label="Classe">
              <select
                className={inputClass()}
                name="newInvestmentClass"
                value={investmentClass}
                onChange={(event) =>
                  setInvestmentClass(event.target.value as InvestmentClass)
                }
                required
              >
                {INVESTMENT_CLASSES.map((item) => (
                  <option key={item} value={item}>
                    {INVESTMENT_CLASS_LABELS[item]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Produto"
              error={state.fieldErrors?.newInvestmentType?.[0]}
            >
              <select
                key={investmentClass}
                className={inputClass(
                  Boolean(state.fieldErrors?.newInvestmentType),
                )}
                name="newInvestmentType"
                defaultValue={INVESTMENT_TYPES_BY_CLASS[investmentClass][0]}
                required
              >
                {INVESTMENT_TYPES_BY_CLASS[investmentClass].map((item) => (
                  <option key={item} value={item}>
                    {INVESTMENT_TYPE_LABELS[item]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>
      ) : null}

      <Field label="Descrição" error={state.fieldErrors?.description?.[0]}>
        <input
          className={inputClass(Boolean(state.fieldErrors?.description))}
          name="description"
          maxLength={180}
          placeholder={INVESTMENT_ACCOUNT_EVENT_LABELS[eventType]}
          required
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Valor" error={state.fieldErrors?.amountMinor?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.amountMinor))}
            name="amountMinor"
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </Field>
        <Field label="Quantidade movimentada" error={state.fieldErrors?.quantity?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.quantity))}
            name="quantity"
            inputMode="decimal"
            placeholder="Opcional"
          />
        </Field>
        <Field label="Data" error={state.fieldErrors?.transactionDate?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.transactionDate))}
            name="transactionDate"
            type="date"
            defaultValue={transactionDate}
            required
          />
        </Field>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        Este movimento entra como <strong>{transactionType === "expense" ? "saída" : "entrada"}</strong> na
        conta. A posição continua com avaliação manual; o vínculo registra o
        histórico sem inventar preço, custo ou rentabilidade.
      </div>

      <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
        <textarea
          className={`${inputClass(Boolean(state.fieldErrors?.notes))} min-h-24 py-3`}
          name="notes"
          maxLength={1000}
          placeholder="Opcional"
        />
      </Field>

      <SubmitButton pending={pending}>Registrar investimento</SubmitButton>
    </form>
  );
}
