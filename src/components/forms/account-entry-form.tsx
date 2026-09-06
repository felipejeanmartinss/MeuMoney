"use client";

import { useState } from "react";
import type { CategoryGroupItem } from "@/domain/categories";
import type { CreditCardTransferDestination } from "@/domain/transfers";
import type {
  AccountType,
  FinancialContext,
  SupportedCurrency,
  InvestmentPositionSummary,
  TransactionType,
} from "@/types/database";
import { TransactionForm } from "./transaction-form";
import { TransferForm } from "./transfer-form";
import { InvestmentAccountEntryForm } from "./investment-account-entry-form";

export type AccountEntryMode = TransactionType | "transfer" | "investment";

export type AccountEntryAccountOption = {
  id: string;
  name: string;
  currency: SupportedCurrency;
  context: FinancialContext;
  type: AccountType;
};

export type AccountEntryCategoryOption = {
  id: string;
  group_id: string;
  parent_id: string | null;
  name: string;
  kind: TransactionType;
  context: FinancialContext;
  is_system: boolean;
  archived_at: string | null;
};

const MODE_LABELS: Record<AccountEntryMode, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
  investment: "Investimento",
};

export function AccountEntryForm({
  accounts,
  categories,
  groups,
  creditCards,
  investmentPositions,
  accountId,
  transactionDate,
  initialMode,
  returnAccountId,
  compact = false,
}: {
  accounts: AccountEntryAccountOption[];
  categories: AccountEntryCategoryOption[];
  groups: CategoryGroupItem[];
  creditCards: CreditCardTransferDestination[];
  investmentPositions: InvestmentPositionSummary[];
  accountId?: string;
  transactionDate: string;
  initialMode: AccountEntryMode;
  returnAccountId?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<AccountEntryMode>(initialMode);
  const [transferDestinationTarget, setTransferDestinationTarget] =
    useState("");

  return (
    <div className={`grid ${compact ? "gap-3" : "gap-6"}`}>
      <div
        role="tablist"
        aria-label="Tipo de entrada na conta"
        className={`grid grid-cols-2 bg-slate-100 sm:grid-cols-4 ${compact ? "rounded-md p-0.5" : "rounded-xl p-1"}`}
      >
        {(Object.keys(MODE_LABELS) as AccountEntryMode[]).map((entryMode) => (
          <button
            key={entryMode}
            type="button"
            role="tab"
            aria-selected={mode === entryMode}
            onClick={() => setMode(entryMode)}
            className={`${compact ? "min-h-8 rounded px-2 text-xs" : "min-h-11 rounded-lg px-3 text-sm"} font-extrabold transition ${
              mode === entryMode
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-600 hover:text-slate-950"
            }`}
          >
            {MODE_LABELS[entryMode]}
          </button>
        ))}
      </div>

      {mode === "investment" ? (
        <InvestmentAccountEntryForm
          key="investment"
          accounts={accounts.filter((account) => account.type === "investment")}
          positions={investmentPositions}
          initialAccountId={
            accounts.find(
              (account) =>
                account.id === accountId && account.type === "investment",
            )?.id
          }
          transactionDate={transactionDate}
          returnAccountId={returnAccountId}
          compact={compact}
        />
      ) : mode === "transfer" ? (
        <TransferForm
          key="transfer"
          accounts={accounts}
          creditCards={creditCards}
          values={{
            sourceAccountId: accountId,
            destinationTarget: transferDestinationTarget,
            transactionDate,
            status: "completed",
            amountMinor: "0,00",
          }}
          returnAccountId={returnAccountId}
          compact={compact}
        />
      ) : (
        <TransactionForm
          key={mode}
          accounts={accounts}
          categories={categories}
          groups={groups}
          fixedType={mode}
          transferAccounts={accounts}
          transferCreditCards={creditCards}
          onTransferSelected={(destinationTarget) => {
            setTransferDestinationTarget(destinationTarget);
            setMode("transfer");
          }}
          values={{
            accountId,
            transactionType: mode,
            transactionDate,
            amountMinor: "0,00",
          }}
          returnAccountId={returnAccountId}
          compact={compact}
        />
      )}
    </div>
  );
}
