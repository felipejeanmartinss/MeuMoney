import { z } from "zod";
import type { TransactionStatus } from "@/types/database";

export const ACCOUNT_REGISTER_ENTRY_TYPES = [
  "transaction",
  "transfer_entry",
] as const;

export type AccountRegisterEntryType =
  (typeof ACCOUNT_REGISTER_ENTRY_TYPES)[number];

export type AccountRegisterDirection =
  | "income"
  | "expense"
  | "inflow"
  | "outflow";

export type AccountRegisterSourceEntry = {
  id: string;
  entryType: AccountRegisterEntryType;
  transferId: string | null;
  transactionDate: string;
  createdAt: string;
  description: string;
  detail: string;
  status: TransactionStatus;
  isActive: boolean;
  reconciledAt: string | null;
  direction: AccountRegisterDirection;
  amountMinor: number;
  editHref: string | null;
};

export type AccountRegisterEntry = AccountRegisterSourceEntry & {
  signedAmountMinor: number;
  runningBalanceMinor: number;
  isFuture: boolean;
};

export type AccountRegisterBalanceSummary = {
  asOfDate: string;
  currentBalanceMinor: number;
  projectedBalanceMinor: number;
};

export const accountRegisterReconciliationSchema = z.object({
  accountId: z.uuid("Conta inválida."),
  entryType: z.enum(ACCOUNT_REGISTER_ENTRY_TYPES),
  entryId: z.uuid("Movimentação inválida."),
  reconciled: z.enum(["true", "false"]).transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).max(100_000),
});

export function accountRegisterSignedAmount(
  direction: AccountRegisterDirection,
  amountMinor: number,
) {
  return direction === "income" || direction === "inflow"
    ? amountMinor
    : -amountMinor;
}

function affectsCurrentBalance(
  entry: AccountRegisterSourceEntry,
  asOfDate: string,
) {
  return (
    entry.isActive &&
    entry.status === "completed" &&
    entry.transactionDate <= asOfDate
  );
}

function affectsProjectedBalance(
  entry: AccountRegisterSourceEntry,
  asOfDate: string,
) {
  return (
    affectsCurrentBalance(entry, asOfDate) ||
    (entry.isActive && entry.transactionDate > asOfDate)
  );
}

export function summarizeAccountRegisterBalances(
  entries: AccountRegisterSourceEntry[],
  openingBalanceMinor: number,
  asOfDate: string,
): AccountRegisterBalanceSummary {
  let currentBalanceMinor = openingBalanceMinor;
  let projectedBalanceMinor = openingBalanceMinor;

  for (const entry of entries) {
    const signedAmountMinor = accountRegisterSignedAmount(
      entry.direction,
      entry.amountMinor,
    );
    if (affectsCurrentBalance(entry, asOfDate)) {
      currentBalanceMinor += signedAmountMinor;
    }
    if (affectsProjectedBalance(entry, asOfDate)) {
      projectedBalanceMinor += signedAmountMinor;
    }
  }

  return { asOfDate, currentBalanceMinor, projectedBalanceMinor };
}

export function buildAccountRegister(
  entries: AccountRegisterSourceEntry[],
  openingBalanceMinor: number,
  asOfDate = "9999-12-31",
) {
  let runningBalanceMinor = openingBalanceMinor;

  const chronologicalEntries = [...entries]
    .sort(
      (left, right) =>
        left.transactionDate.localeCompare(right.transactionDate) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .map((entry) => {
      const signedAmountMinor = accountRegisterSignedAmount(
        entry.direction,
        entry.amountMinor,
      );
      if (affectsProjectedBalance(entry, asOfDate)) {
        runningBalanceMinor += signedAmountMinor;
      }

      return {
        ...entry,
        signedAmountMinor,
        runningBalanceMinor,
        isFuture: entry.transactionDate > asOfDate,
      };
    });

  // The balance must be accumulated in chronological order, while a bank
  // register is easier to use with the most recent activity on the first page.
  return chronologicalEntries.reverse();
}
