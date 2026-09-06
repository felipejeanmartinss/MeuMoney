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
}) {
  const [mode, setMode] = useState<AccountEntryMode>(initialMode);
  const [transferDestinationTarget, setTransferDestinationTarget] =
    useState("");

  return (
    <div className="grid gap-6">
      <div
        role="tablist"
        aria-label="Tipo de entrada na conta"
        className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 sm:grid-cols-4"
      >
        {(Object.keys(MODE_LABELS) as AccountEntryMode[]).map((entryMode) => (
          <button
            key={entryMode}
            type="button"
            role="tab"
            aria-selected={mode === entryMode}
            onClick={() => setMode(entryMode)}
            className={`min-h-11 rounded-lg px-3 text-sm font-extrabold transition ${
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
        />
      )}
    </div>
  );
}
