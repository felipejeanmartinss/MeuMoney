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
};

export const accountRegisterReconciliationSchema = z.object({
  accountId: z.uuid("Conta inválida."),
  entryType: z.enum(ACCOUNT_REGISTER_ENTRY_TYPES),
  entryId: z.uuid("Movimentação inválida."),
  reconciled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export function accountRegisterSignedAmount(
  direction: AccountRegisterDirection,
  amountMinor: number,
) {
  return direction === "income" || direction === "inflow"
    ? amountMinor
    : -amountMinor;
}

export function buildAccountRegister(
  entries: AccountRegisterSourceEntry[],
  openingBalanceMinor: number,
) {
  let runningBalanceMinor = openingBalanceMinor;

  return [...entries]
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
      if (entry.isActive && entry.status === "completed") {
        runningBalanceMinor += signedAmountMinor;
      }

      return {
        ...entry,
        signedAmountMinor,
        runningBalanceMinor,
      };
    });
}
