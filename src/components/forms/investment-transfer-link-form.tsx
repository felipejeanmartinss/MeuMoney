"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  linkInvestmentTransferEntry,
  type InvestmentFormState,
} from "@/app/actions/investments";
import { CURRENCY_LOCALES } from "@/domain/currencies";
import {
  inferInvestmentTransferEvent,
  INVESTMENT_ACCOUNT_EVENT_LABELS,
  INVESTMENT_CLASSES,
  INVESTMENT_CLASS_LABELS,
  INVESTMENT_TYPES_BY_CLASS,
  INVESTMENT_TYPE_LABELS,
} from "@/domain/investments";
import { formatMoney } from "@/domain/money";
import type {
  InvestmentAccountEventType,
  InvestmentClass,
  InvestmentPositionSummary,
  InvestmentTransferCandidate,
} from "@/types/database";
import { formatFinancialDate } from "@/utils/financial-formatters";
import { Field, FormMessage, inputClass, SubmitButton } from "./form-controls";

const initialState: InvestmentFormState = { status: "idle" };

function normalizedAssetName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function InvestmentTransferLinkForm({
  candidate,
  positions,
  returnAccountId,
  returnPage,
}: {
  candidate: InvestmentTransferCandidate;
  positions: InvestmentPositionSummary[];
  returnAccountId?: string;
  returnPage?: string;
}) {
  const [state, formAction, pending] = useActionState(
    linkInvestmentTransferEntry,
    initialState,
  );
  const compatiblePositions = useMemo(
    () =>
      positions.filter(
        (position) =>
          position.is_active &&
          position.currency === candidate.currency &&
          position.context === candidate.context,
      ),
    [candidate.context, candidate.currency, positions],
  );
  const suggestedPosition = compatiblePositions.find(
    (position) =>
      normalizedAssetName(position.asset_name) ===
      normalizedAssetName(candidate.description),
  );
  const suggestedEvent = inferInvestmentTransferEvent(
    candidate.direction,
    candidate.description,
  );
  const [eventType, setEventType] =
    useState<InvestmentAccountEventType>(suggestedEvent);
  const [positionId, setPositionId] = useState(suggestedPosition?.id ?? "");
  const [investmentClass, setInvestmentClass] =
    useState<InvestmentClass>("fixed_income");
  const eventOptions: InvestmentAccountEventType[] =
    candidate.direction === "inflow"
      ? ["contribution"]
      : ["redemption", "interest_on_capital", "dividend", "bonus", "other"];

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="accountId" value={candidate.account_id} />
      <input
        type="hidden"
        name="transferEntryId"
        value={candidate.entry_id}
      />
      {returnAccountId ? (
        <input type="hidden" name="returnAccountId" value={returnAccountId} />
      ) : null}
      {returnPage ? (
        <input type="hidden" name="returnPage" value={returnPage} />
      ) : null}

      {state.message ? <FormMessage>{state.message}</FormMessage> : null}

      <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate font-extrabold text-slate-950">
            {candidate.description}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {candidate.account_name} · {formatFinancialDate(candidate.transaction_date)}
          </p>
        </div>
        <p className="text-sm font-bold text-slate-600">
          {candidate.direction === "inflow" ? "Entrada" : "Saída"}
        </p>
        <p className="font-black text-slate-950">
          {formatMoney(
            candidate.amount_minor,
            candidate.currency,
            CURRENCY_LOCALES[candidate.currency],
          )}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Operação" error={state.fieldErrors?.eventType?.[0]}>
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
            {eventOptions.map((item) => (
              <option key={item} value={item}>
                {INVESTMENT_ACCOUNT_EVENT_LABELS[item]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Posição"
          error={state.fieldErrors?.positionId?.[0]}
        >
          <select
            className={inputClass(Boolean(state.fieldErrors?.positionId))}
            name="positionId"
            value={positionId}
            onChange={(event) => setPositionId(event.target.value)}
            required
          >
            <option value="" disabled>
              Selecione
            </option>
            {compatiblePositions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.asset_name} · {position.institution}
              </option>
            ))}
            {eventType === "contribution" ? (
              <option value="new">+ Criar posição com esta aplicação</option>
            ) : null}
          </select>
        </Field>
      </div>

      {positionId === "new" ? (
        <fieldset className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <legend className="px-1 text-sm font-black text-emerald-950">
            Nova posição
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Instituição"
              error={state.fieldErrors?.newInstitution?.[0]}
            >
              <input
                className={inputClass(
                  Boolean(state.fieldErrors?.newInstitution),
                )}
                name="newInstitution"
                defaultValue={candidate.account_name}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Ativo" error={state.fieldErrors?.newAssetName?.[0]}>
              <input
                className={inputClass(
                  Boolean(state.fieldErrors?.newAssetName),
                )}
                name="newAssetName"
                defaultValue={candidate.description}
                maxLength={160}
                required
              />
            </Field>
            <Field label="Classe">
              <select
                className={inputClass(false)}
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

      {candidate.direction === "outflow" && compatiblePositions.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Cadastre primeiro a posição anterior a 2026 para vincular este resgate
          ou rendimento. <Link className="font-bold underline" href="/investments/new">Cadastrar posição</Link>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantidade movimentada" error={state.fieldErrors?.quantity?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.quantity))}
            name="quantity"
            inputMode="decimal"
            placeholder="Opcional"
          />
        </Field>
        <Field label="Observações" error={state.fieldErrors?.notes?.[0]}>
          <input
            className={inputClass(Boolean(state.fieldErrors?.notes))}
            name="notes"
            maxLength={1000}
            placeholder="Opcional"
          />
        </Field>
      </div>

      <p className="text-sm text-slate-600">
        O vínculo cria a aplicação, liquidação ou renda no extrato e mantém a
        transferência original como movimentação de caixa.
      </p>

      <SubmitButton pending={pending}>Vincular à posição</SubmitButton>
    </form>
  );
}
