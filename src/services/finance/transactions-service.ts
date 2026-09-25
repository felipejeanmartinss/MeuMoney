import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import {
  isMissingSubscriptionColumn,
  subscriptionMigrationMessage,
  withSubscriptionDefaults,
  withoutSubscriptionFlag,
} from "@/services/finance/subscription-schema";
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
  isSubscription: boolean;
};

export type TransactionFilters = {
  transactionType?: TransactionType;
  status?: TransactionStatus;
  accountId?: string;
  categoryId?: string;
  uncategorized?: boolean;
  dateFrom?: string;
  dateTo?: string;
  activity: "active" | "inactive" | "all";
};

export async function listCurrentUserTransactions(
  filters: TransactionFilters,
) {
  const { supabase, user } = await requireUser();
  let query = supabase
    .from("transactions")
    .select("*")
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
  if (filters.uncategorized) {
    query = query.eq("origin_type", "manual").is("category_id", null);
  }
  if (filters.dateFrom) {
    query = query.gte("transaction_date", filters.dateFrom);
  }
  if (filters.dateTo) query = query.lte("transaction_date", filters.dateTo);
  if (filters.activity !== "all") {
    query = query.eq("is_active", filters.activity === "active");
  }

  const [transactionsResult, accountsResult, categoriesResult, groupsResult] =
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
          "id, group_id, parent_id, name, kind, context, is_system, archived_at",
        )
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("category_groups")
        .select("id, name, kind, context, archived_at")
        .eq("user_id", user.id)
        .order("name"),
    ]);

  return {
    transactions: withSubscriptionDefaults(transactionsResult.data ?? []),
    accounts: accountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    groups: groupsResult.data ?? [],
    hasError: Boolean(
      transactionsResult.error ||
        accountsResult.error ||
        categoriesResult.error ||
        groupsResult.error,
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
    .select("id, name, type, currency, context")
    .eq("user_id", user.id);
  accountsQuery = include?.accountId
    ? accountsQuery.or(
        `archived_at.is.null,id.eq.${include.accountId}`,
      )
    : accountsQuery.is("archived_at", null);

  let categoriesQuery = supabase
    .from("categories")
    .select("id, group_id, parent_id, name, kind, context, is_system, archived_at")
    .eq("user_id", user.id);
  categoriesQuery = include?.categoryId
    ? categoriesQuery.or(
        `archived_at.is.null,id.eq.${include.categoryId}`,
      )
    : categoriesQuery.is("archived_at", null);

  const [accountsResult, categoriesResult, groupsResult] = await Promise.all([
    accountsQuery.order("name"),
    categoriesQuery.order("name"),
    supabase
      .from("category_groups")
      .select("id, name, kind, context, archived_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
  ]);

  return {
    accounts: accountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    groups: groupsResult.data ?? [],
    hasError: Boolean(
      accountsResult.error || categoriesResult.error || groupsResult.error,
    ),
  };
}

export async function getCurrentUserTransaction(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("origin_type", "manual")
    .maybeSingle();

  return {
    transaction: data ? withSubscriptionDefaults([data])[0] : null,
    hasError: Boolean(error),
  };
}

export async function getCurrentUserAutomaticTransaction(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, account_id, description, transaction_date, origin_type, status")
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("is_active", true)
    .in("origin_type", ["system", "credit_card_invoice_payment"])
    .maybeSingle();
  return { transaction: data, hasError: Boolean(error) };
}

export async function updateCurrentUserAutomaticTransactionDate(
  id: string,
  date: string,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_automatic_transaction_date", {
    target_transaction_id: id,
    target_transaction_date: date,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function confirmCurrentUserRecurringForecast(
  forecastId: string,
  input: TransactionMutationInput,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("confirm_recurring_transaction", {
    target_transaction_id: forecastId,
    target_account_id: input.accountId,
    target_transaction_type: input.transactionType,
    target_category_id: input.categoryId,
    target_description: input.description,
    target_amount_minor: input.amountMinor,
    target_transaction_date: input.transactionDate,
    target_notes: input.notes,
  });
  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
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
  const values = {
    user_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId,
    transaction_type: input.transactionType,
    description: input.description,
    amount_minor: input.amountMinor,
    transaction_date: input.transactionDate,
    status: input.status,
    notes: input.notes,
    is_subscription: input.isSubscription,
  };
  const { error } = await supabase.from("transactions").insert(values);
  if (isMissingSubscriptionColumn(error)) {
    if (input.isSubscription) return { ok: false as const, message: subscriptionMigrationMessage };
    const compatibleValues = withoutSubscriptionFlag(values);
    const retry = await supabase.from("transactions").insert(compatibleValues);
    return retry.error
      ? { ok: false as const, message: mutationErrorMessage(retry.error) }
      : { ok: true as const };
  }

  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserTransaction(
  id: string,
  input: TransactionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const values = {
    account_id: input.accountId,
    category_id: input.categoryId,
    transaction_type: input.transactionType,
    description: input.description,
    amount_minor: input.amountMinor,
    transaction_date: input.transactionDate,
    status: input.status,
    notes: input.notes,
    is_subscription: input.isSubscription,
  };
  const { data, error } = await supabase
    .from("transactions")
    .update(values)
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("origin_type", "manual")
    .select("id")
    .maybeSingle();
  if (isMissingSubscriptionColumn(error)) {
    if (input.isSubscription) return { ok: false as const, message: subscriptionMigrationMessage };
    const compatibleValues = withoutSubscriptionFlag(values);
    const retry = await supabase
      .from("transactions")
      .update(compatibleValues)
      .eq("user_id", user.id)
      .eq("id", id)
      .eq("origin_type", "manual")
      .select("id")
      .maybeSingle();
    return retry.error || !retry.data
      ? { ok: false as const, message: mutationErrorMessage(retry.error) }
      : { ok: true as const };
  }

  return error || !data
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function deleteCurrentUserTransaction(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id)
    .in("origin_type", ["manual", "system"])
    .select("id")
    .maybeSingle();

  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível excluir o lançamento.",
      }
    : { ok: true as const };
}

export async function clearCurrentUserInactiveAutomaticTransactions() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .eq("is_active", false)
    .eq("origin_type", "system")
    .select("id");

  return error
    ? {
        ok: false as const,
        message: "Não foi possível limpar os automáticos inativos.",
      }
    : { ok: true as const, deletedCount: data?.length ?? 0 };
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
