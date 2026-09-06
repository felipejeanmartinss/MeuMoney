"use client";

import { useId, useState } from "react";
import {
  AccountEntryForm,
  type AccountEntryAccountOption,
  type AccountEntryCategoryOption,
  type AccountEntryMode,
} from "@/components/forms/account-entry-form";
import type { CategoryGroupItem } from "@/domain/categories";
import type { CreditCardTransferDestination } from "@/domain/transfers";
import type {
  AccountType,
  InvestmentPositionSummary,
} from "@/types/database";

export type AccountRegisterEntryComposerProps = {
  accountId: string;
  accountType: AccountType;
  transactionDate: string;
  accounts: AccountEntryAccountOption[];
  categories: AccountEntryCategoryOption[];
  groups: CategoryGroupItem[];
  creditCards: CreditCardTransferDestination[];
  investmentPositions: InvestmentPositionSummary[];
  hasError: boolean;
};

export function AccountRegisterEntryComposer({
  accountId,
  accountType,
  transactionDate,
  accounts,
  categories,
  groups,
  creditCards,
  investmentPositions,
  hasError,
}: AccountRegisterEntryComposerProps) {
  const panelId = useId();
  const [mode, setMode] = useState<AccountEntryMode | null>(null);
  const movementMode: AccountEntryMode =
    accountType === "investment" ? "investment" : "expense";

  function toggleMode(nextMode: AccountEntryMode) {
    setMode((currentMode) =>
      currentMode === nextMode ? null : nextMode,
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          aria-expanded={mode === movementMode}
          aria-controls={panelId}
          onClick={() => toggleMode(movementMode)}
          className="inline-flex min-h-9 items-center justify-center rounded-md bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800"
        >
          Novo lançamento
        </button>
        <button
          type="button"
          aria-expanded={mode === "transfer"}
          aria-controls={panelId}
          onClick={() => toggleMode("transfer")}
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
        >
          Transferir
        </button>
      </div>

      {mode ? (
        <section
          id={panelId}
          aria-label="Novo registro na conta"
          className="mt-2 border-t border-amber-300 bg-amber-50/70 px-2.5 py-2.5 sm:px-3"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold text-slate-950">
              Registrar direto no extrato
            </h3>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="min-h-8 rounded-md px-2 text-xs font-bold text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
          {hasError ? (
            <p role="alert" className="text-sm font-semibold text-red-800">
              Não foi possível carregar as opções do lançamento.
            </p>
          ) : (
            <AccountEntryForm
              key={mode}
              accounts={accounts}
              categories={categories}
              groups={groups}
              creditCards={creditCards}
              investmentPositions={investmentPositions}
              accountId={accountId}
              transactionDate={transactionDate}
              initialMode={mode}
              returnAccountId={accountId}
              compact
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
