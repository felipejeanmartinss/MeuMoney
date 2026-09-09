"use client";

import { useActionState, useMemo, useState } from "react";
import {
  updateInvestmentUnitPrices,
  type InvestmentFormState,
} from "@/app/actions/investments";
import {
  calculateInvestmentValueFromUnitPrice,
  calculateInvestmentUnitPriceFromValue,
  formatInvestmentQuantity,
} from "@/domain/investments";
import {
  formatMoney,
  minorUnitsToInput,
  parseMoneyInputToMinor,
} from "@/domain/money";
import type { SupportedCurrency } from "@/types/database";
import { FormMessage, inputClass, SubmitButton } from "./form-controls";

type Position = {
  id: string;
  asset_name: string;
  institution: string;
  currency: SupportedCurrency;
  quantity: string;
  current_value_minor: number;
};

const initialState: InvestmentFormState = { status: "idle" };

function currentUnitPrice(position: Position) {
  const unitPrice = calculateInvestmentUnitPriceFromValue(
    position.current_value_minor,
    position.quantity,
  );
  return minorUnitsToInput(unitPrice ?? 0);
}

export function InvestmentUnitPriceForm({ positions }: { positions: Position[] }) {
  const [state, action, pending] = useActionState(
    updateInvestmentUnitPrices,
    initialState,
  );
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(
      positions.map((position) => [position.id, currentUnitPrice(position)]),
    ),
  );
  const projectedValues = useMemo(
    () =>
      Object.fromEntries(
        positions.map((position) => {
          try {
            return [
              position.id,
              calculateInvestmentValueFromUnitPrice(
                position.quantity,
                parseMoneyInputToMinor(prices[position.id] ?? ""),
              ),
            ];
          } catch {
            return [position.id, null];
          }
        }),
      ) as Record<string, number | null>,
    [positions, prices],
  );

  return (
    <form action={action} className="grid gap-4">
      {state.message ? <FormMessage>{state.message}</FormMessage> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Ativo</th>
                <th className="px-4 py-3">Quantidade</th>
                <th className="px-4 py-3 text-right">Valor unitário</th>
                <th className="px-4 py-3 text-right">Valor calculado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {positions.map((position) => {
                const projectedValue = projectedValues[position.id];
                return (
                <tr key={position.id}>
                  <td className="px-4 py-3">
                    <input type="hidden" name="positionId" value={position.id} />
                    <p className="font-extrabold text-slate-950">{position.asset_name}</p>
                    <p className="text-xs text-slate-500">{position.institution} · {position.currency}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {formatInvestmentQuantity(position.quantity)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      aria-label={`Valor unitário de ${position.asset_name}`}
                      className={`${inputClass()} ml-auto h-10 max-w-40 text-right`}
                      name="unitPriceMinor"
                      value={prices[position.id] ?? ""}
                      onChange={(event) =>
                        setPrices((current) => ({
                          ...current,
                          [position.id]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      required
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-slate-950">
                    {projectedValue === null
                      ? "—"
                      : formatMoney(projectedValue, position.currency)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <SubmitButton
        pending={pending}
        disabled={Object.values(projectedValues).some((value) => value === null)}
      >
        Atualizar valores
      </SubmitButton>
    </form>
  );
}
