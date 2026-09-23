import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import {
  isMissingSubscriptionColumn,
  subscriptionMigrationMessage,
  withSubscriptionDefaults,
  withoutSubscriptionFlag,
} from "@/services/finance/subscription-schema";
import type {
  Json,
  RecurrenceFrequency,
  RecurringTransactionState,
  TransactionType,
  SupportedCurrency,
} from "@/types/database";

export async function getSubscriptionOverview() {
  const { supabase, user } = await requireUser();
  const [cards, purchases, transactions] = await Promise.all([
    supabase.from("credit_cards").select("id,name,currency").eq("user_id", user.id),
    supabase.from("credit_card_purchases").select("id,credit_card_id,description,total_amount,purchase_date").eq("user_id", user.id).eq("is_recurring", true).eq("entry_kind", "purchase").eq("status", "active").order("purchase_date", { ascending: false }).limit(500),
    supabase.from("transactions").select("id,account_id,description,amount_minor,transaction_date").eq("user_id", user.id).eq("is_subscription", true).eq("is_active", true).eq("transaction_type", "expense").is("recurring_transaction_id", null).order("transaction_date", { ascending: false }).limit(500),
  ]);
  const cardById = new Map((cards.data ?? []).map((card) => [card.id, card]));
  const accounts = await supabase.from("accounts").select("id,name,currency").eq("user_id", user.id);
  const accountById = new Map((accounts.data ?? []).map((account) => [account.id, account]));
  const unique = new Set<string>();
  const rows = [
    ...(purchases.data ?? []).flatMap((purchase) => {
      const card = cardById.get(purchase.credit_card_id);
      if (!card) return [];
      return [{ id: purchase.id, name: purchase.description, source: card.name, currency: card.currency as SupportedCurrency, amountMinor: purchase.total_amount, kind: "card" as const, href: `/credit-cards/${card.id}` }];
    }),
    ...(transactions.data ?? []).flatMap((transaction) => {
      const account = accountById.get(transaction.account_id);
      if (!account) return [];
      const key = `${transaction.account_id}:${transaction.description.trim().toLowerCase()}`;
      if (unique.has(key)) return [];
      unique.add(key);
      return [{ id: transaction.id, name: transaction.description, source: account.name, currency: account.currency as SupportedCurrency, amountMinor: transaction.amount_minor, kind: "account" as const, href: `/accounts/${account.id}` }];
    }),
  ];
  return {
    rows,
    hasError: Boolean(cards.error || purchases.error || accounts.error ||
      (transactions.error && !isMissingSubscriptionColumn(transactions.error))),
    subscriptionUnavailable: isMissingSubscriptionColumn(transactions.error),
  };
}

export type RecurringTransactionMutationInput = {
  accountId: string;
  categoryId: string;
  transactionType: TransactionType;
  description: string;
  amountMinor: number;
  isAmountFixed: boolean;
  isSubscription: boolean;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string | null;
  nextOccurrence: string;
  notes: string | null;
};

export type RecurringTransactionReviewInput = {
  recurringId: string;
  scheduledDate: string;
  transactionDate: string;
  amountMinor: number;
};

function mutationErrorMessage(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("invalid_recurring_transaction_category")) {
    return "Selecione uma categoria ativa compatível com o tipo.";
  }
  if (message.includes("invalid_recurring_transaction_account")) {
    return "Selecione uma conta ativa.";
  }
  if (message.includes("recurring_transaction_already_ended")) {
    return "Uma recorrência encerrada não pode ser reativada.";
  }
  if (message.includes("recurring_transaction_schedule_ended")) {
    return "A recorrência já ultrapassou sua data final.";
  }
  if (message.includes("recurring_transaction_generation_limit")) {
    return "O período solicitado é muito extenso. Escolha uma data mais próxima.";
  }
  if (message.includes("recurrence_review")) {
    return "Revise a data e o valor das recorrências aproximadas.";
  }
  return "Não foi possível concluir a operação com a recorrência.";
}

export async function listCurrentUserRecurringTransactions() {
  const { supabase, user } = await requireUser();
  const [recurrencesResult, accountsResult, categoriesResult, groupsResult] =
    await Promise.all([
      supabase
        .from("recurring_transactions")
        .select("*")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("is_active", { ascending: false })
        .order("next_occurrence"),
      supabase
        .from("accounts")
        .select("id, name, currency, archived_at")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("categories")
        .select("id, group_id, parent_id, name, kind, context, archived_at")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("category_groups")
        .select("id, name, kind, context, archived_at")
        .eq("user_id", user.id)
        .order("name"),
    ]);

  return {
    recurrences: withSubscriptionDefaults(recurrencesResult.data ?? []),
    accounts: accountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    groups: groupsResult.data ?? [],
    hasError: Boolean(
      recurrencesResult.error ||
        accountsResult.error ||
        categoriesResult.error ||
        groupsResult.error,
    ),
  };
}

export async function getRecurringTransactionFormOptions(include?: {
  accountId?: string;
  categoryId?: string;
}) {
  const { supabase, user } = await requireUser();
  let accountsQuery = supabase
    .from("accounts")
    .select("id, name, currency, context")
    .eq("user_id", user.id);
  accountsQuery = include?.accountId
    ? accountsQuery.or(`archived_at.is.null,id.eq.${include.accountId}`)
    : accountsQuery.is("archived_at", null);

  let categoriesQuery = supabase
    .from("categories")
    .select("id, group_id, parent_id, name, kind, context")
    .eq("user_id", user.id);
  categoriesQuery = include?.categoryId
    ? categoriesQuery.or(`archived_at.is.null,id.eq.${include.categoryId}`)
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

export async function getCurrentUserRecurringTransaction(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return {
    recurrence: data ? withSubscriptionDefaults([data])[0] : null,
    hasError: Boolean(error),
  };
}

export async function createCurrentUserRecurringTransaction(
  input: RecurringTransactionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const values = {
    user_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId,
    transaction_type: input.transactionType,
    description: input.description,
    amount_minor: input.amountMinor,
    is_amount_fixed: input.isAmountFixed,
    is_subscription: input.isSubscription,
    frequency: input.frequency,
    start_date: input.startDate,
    end_date: input.endDate,
    next_occurrence: input.nextOccurrence,
    notes: input.notes,
  };
  const { error } = await supabase.from("recurring_transactions").insert(values);
  if (isMissingSubscriptionColumn(error)) {
    if (input.isSubscription) return { ok: false as const, message: subscriptionMigrationMessage };
    const compatibleValues = withoutSubscriptionFlag(values);
    const retry = await supabase.from("recurring_transactions").insert(compatibleValues);
    return retry.error
      ? { ok: false as const, message: mutationErrorMessage(retry.error) }
      : { ok: true as const };
  }

  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserRecurringTransaction(
  id: string,
  input: RecurringTransactionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const values = {
    account_id: input.accountId,
    category_id: input.categoryId,
    transaction_type: input.transactionType,
    description: input.description,
    amount_minor: input.amountMinor,
    is_amount_fixed: input.isAmountFixed,
    is_subscription: input.isSubscription,
    frequency: input.frequency,
    start_date: input.startDate,
    end_date: input.endDate,
    next_occurrence: input.nextOccurrence,
    notes: input.notes,
  };
  const { data, error } = await supabase
    .from("recurring_transactions")
    .update(values)
    .eq("user_id", user.id)
    .eq("id", id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();
  if (isMissingSubscriptionColumn(error)) {
    if (input.isSubscription) return { ok: false as const, message: subscriptionMigrationMessage };
    const compatibleValues = withoutSubscriptionFlag(values);
    const retry = await supabase
      .from("recurring_transactions")
      .update(compatibleValues)
      .eq("user_id", user.id)
      .eq("id", id)
      .is("ended_at", null)
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

export async function setCurrentUserRecurringTransactionState(
  id: string,
  state: RecurringTransactionState,
) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_recurring_transaction_state", {
    target_recurring_id: id,
    target_state: state,
  });

  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function generateCurrentUserRecurringTransactions(
  targetUntil: string,
  reviews: RecurringTransactionReviewInput[] = [],
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "generate_recurring_transactions_reviewed",
    {
      target_until: targetUntil,
      review_overrides: reviews as unknown as Json,
    },
  );

  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const, generatedCount: data ?? 0 };
}
