import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type {
  TransactionStatus,
  TransactionType,
} from "@/types/database";

export type TransactionMutationInput = {
  accountId: string;
  categoryId: string;
  transactionType: TransactionType;
  description: string;
  amountMinor: number;
  transactionDate: string;
  status: TransactionStatus;
  notes: string | null;
};

export type TransactionFilters = {
  transactionType?: TransactionType;
  status?: TransactionStatus;
  accountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  activity: "active" | "inactive" | "all";
};

const transactionColumns =
  "id, user_id, account_id, category_id, transaction_type, description, amount_minor, transaction_date, status, notes, is_active, reconciled_at, origin_type, origin_id, credit_card_invoice_id, recurring_transaction_id, created_at, updated_at";

export async function listCurrentUserTransactions(
  filters: TransactionFilters,
) {
  const { supabase, user } = await requireUser();
  let query = supabase
    .from("transactions")
    .select(transactionColumns)
    .eq("user_id", user.id)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.transactionType) {
    query = query.eq("transaction_type", filters.transactionType);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.dateFrom) {
    query = query.gte("transaction_date", filters.dateFrom);
  }
  if (filters.dateTo) query = query.lte("transaction_date", filters.dateTo);
  if (filters.activity !== "all") {
    query = query.eq("is_active", filters.activity === "active");
  }

  const [transactionsResult, accountsResult, categoriesResult] =
    await Promise.all([
      query,
      supabase
        .from("accounts")
        .select("id, name, currency, archived_at")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("categories")
        .select(
          "id, parent_id, name, kind, context, is_system, archived_at",
        )
        .eq("user_id", user.id)
        .order("name"),
    ]);

  return {
    transactions: transactionsResult.data ?? [],
    accounts: accountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    hasError: Boolean(
      transactionsResult.error ||
        accountsResult.error ||
        categoriesResult.error,
    ),
  };
}

export async function getTransactionFormOptions(include?: {
  accountId?: string;
  categoryId?: string;
}) {
  const { supabase, user } = await requireUser();
  let accountsQuery = supabase
    .from("accounts")
    .select("id, name, currency, context")
    .eq("user_id", user.id);
  accountsQuery = include?.accountId
    ? accountsQuery.or(
        `archived_at.is.null,id.eq.${include.accountId}`,
      )
    : accountsQuery.is("archived_at", null);

  let categoriesQuery = supabase
    .from("categories")
    .select("id, parent_id, name, kind, context, is_system, archived_at")
    .eq("user_id", user.id);
  categoriesQuery = include?.categoryId
    ? categoriesQuery.or(
        `archived_at.is.null,id.eq.${include.categoryId}`,
      )
    : categoriesQuery.is("archived_at", null);

  const [accountsResult, categoriesResult] = await Promise.all([
    accountsQuery.order("name"),
    categoriesQuery.order("name"),
  ]);

  return {
    accounts: accountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    hasError: Boolean(accountsResult.error || categoriesResult.error),
  };
}

export async function getCurrentUserTransaction(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .select(transactionColumns)
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("origin_type", "manual")
    .maybeSingle();

  return { transaction: data, hasError: Boolean(error) };
}

function mutationErrorMessage(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("invalid_transaction_category")) {
    return "A categoria não corresponde ao tipo do lançamento.";
  }
  if (message.includes("invalid_transaction_account")) {
    return "A conta selecionada não está disponível.";
  }
  return "Não foi possível salvar o lançamento.";
}

export async function createCurrentUserTransaction(
  input: TransactionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId,
    transaction_type: input.transactionType,
    description: input.description,
    amount_minor: input.amountMinor,
    transaction_date: input.transactionDate,
    status: input.status,
    notes: input.notes,
  });

  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserTransaction(
  id: string,
  input: TransactionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .update({
      account_id: input.accountId,
      category_id: input.categoryId,
      transaction_type: input.transactionType,
      description: input.description,
      amount_minor: input.amountMinor,
      transaction_date: input.transactionDate,
      status: input.status,
      notes: input.notes,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("origin_type", "manual")
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function setCurrentUserTransactionActive(
  id: string,
  active: boolean,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .update({ is_active: active })
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("origin_type", "manual")
    .select("id")
    .maybeSingle();

  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível alterar o status do lançamento.",
      }
    : { ok: true as const };
}

export async function setCurrentUserAccountEntryReconciled(
  entryType: "transaction" | "transfer_entry",
  entryId: string,
  reconciled: boolean,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "set_account_entry_reconciled",
    {
      target_entry_type: entryType,
      target_entry_id: entryId,
      target_reconciled: reconciled,
    },
  );

  return error || !data
    ? {
        ok: false as const,
        message:
          "Não foi possível atualizar a conciliação desta movimentação.",
      }
    : { ok: true as const };
}
