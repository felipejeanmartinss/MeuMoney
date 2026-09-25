import { z } from "zod";
import { parseMoneyInputToMinor } from "@/domain/money";
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
  automaticDateOnly?: boolean;
  canDelete?: boolean;
  investmentPositionId?: string | null;
  investmentCashFlowId?: string | null;
};

export type AccountRegisterEntry = AccountRegisterSourceEntry & {
  signedAmountMinor: number;
  runningBalanceMinor: number;
  isProjected: boolean;
};

export type AccountRegisterBalanceSummary = {
  asOfDate: string;
  currentBalanceMinor: number;
  projectedBalanceMinor: number;
};

export type AccountRegisterFilters = {
  dateFrom?: string;
  dateTo?: string;
  description?: string;
  category?: string;
  income?: string;
  expense?: string;
};

export type PendingRecurrenceMatch = {
  id: string;
  accountId: string;
  categoryId: string | null;
  transactionType: "income" | "expense";
  description: string;
  amountMinor: number;
  transactionDate: string;
};

function normalizedWords(value: string) {
  return normalizedSearch(value).split(/[^a-z0-9]+/).filter((word) => word.length > 2);
}

export function findSimilarPendingRecurrence(
  candidates: readonly PendingRecurrenceMatch[],
  input: Omit<PendingRecurrenceMatch, "id">,
) {
  const words = normalizedWords(input.description);
  const inputDate = Date.parse(`${input.transactionDate}T00:00:00Z`);
  if (!words.length || !Number.isFinite(inputDate) || input.amountMinor <= 0) return null;
  const ranked = candidates.flatMap((candidate) => {
    if (candidate.accountId !== input.accountId || candidate.categoryId !== input.categoryId || candidate.transactionType !== input.transactionType) return [];
    const days = Math.abs(Date.parse(`${candidate.transactionDate}T00:00:00Z`) - inputDate) / 86_400_000;
    const amountDifference = Math.abs(candidate.amountMinor - input.amountMinor);
    if (days > 14 || amountDifference > Math.max(500, Math.floor(candidate.amountMinor / 5))) return [];
    const candidateWords = new Set(normalizedWords(candidate.description));
    const overlap = words.filter((word) => candidateWords.has(word)).length;
    if (!overlap && normalizedSearch(input.description) !== normalizedSearch(candidate.description)) return [];
    return [{ candidate, score: overlap * 10 - days - amountDifference / 100 }];
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.candidate ?? null;
}

function normalizedSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function moneyFilter(value?: string) {
  if (!value?.trim()) return undefined;
  try {
    return parseMoneyInputToMinor(value);
  } catch {
    return Number.NaN;
  }
}

export function filterAccountRegisterEntries(
  entries: readonly AccountRegisterEntry[],
  filters: AccountRegisterFilters,
): AccountRegisterEntry[] {
  const description = normalizedSearch(filters.description ?? "");
  const category = normalizedSearch(filters.category ?? "");
  const income = moneyFilter(filters.income);
  const expense = moneyFilter(filters.expense);
  return entries.filter((entry) =>
    (!filters.dateFrom || entry.transactionDate >= filters.dateFrom) &&
    (!filters.dateTo || entry.transactionDate <= filters.dateTo) &&
    (!description || normalizedSearch(entry.description).includes(description)) &&
    (!category || normalizedSearch(entry.detail).includes(category)) &&
    (income === undefined || (entry.signedAmountMinor > 0 && entry.amountMinor === income)) &&
    (expense === undefined || (entry.signedAmountMinor < 0 && entry.amountMinor === expense))
  );
}

export function accountRegisterMatchesBalance(
  calculated: AccountRegisterBalanceSummary,
  account: { current_balance_minor: number; projected_balance_minor: number },
) {
  return calculated.currentBalanceMinor === account.current_balance_minor &&
    calculated.projectedBalanceMinor === account.projected_balance_minor;
}

export const accountRegisterReconciliationSchema = z.object({
  accountId: z.uuid("Conta inválida."),
  entryType: z.enum(ACCOUNT_REGISTER_ENTRY_TYPES),
  entryId: z.uuid("Movimentação inválida."),
  reconciled: z.enum(["true", "false"]).transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).max(100_000),
});

export function canReconcileAccountEntry(
  entry: Pick<AccountRegisterSourceEntry, "entryType" | "isActive" | "status">,
) {
  return (
    entry.isActive &&
    (entry.status === "completed" || entry.entryType === "transaction")
  );
}

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
    entry.transactionDate < asOfDate
  );
}

function affectsProjectedBalance(
  entry: AccountRegisterSourceEntry,
  asOfDate: string,
) {
  return (
    affectsCurrentBalance(entry, asOfDate) ||
    (entry.isActive && entry.transactionDate >= asOfDate)
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
        isProjected: entry.transactionDate >= asOfDate,
      };
    });

  // The balance must be accumulated in chronological order, while a bank
  // register is easier to use with the most recent activity on the first page.
  return chronologicalEntries.reverse();
}
