import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type {
  RecurrenceFrequency,
  RecurringTransactionState,
  TransactionType,
} from "@/types/database";

export type RecurringTransactionMutationInput = {
  accountId: string;
  categoryId: string;
  transactionType: TransactionType;
  description: string;
  amountMinor: number;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string | null;
  nextOccurrence: string;
  notes: string | null;
};

const recurringTransactionColumns =
  "id, user_id, account_id, category_id, transaction_type, description, amount_minor, frequency, start_date, end_date, next_occurrence, notes, is_active, ended_at, created_at, updated_at";

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
  return "Não foi possível concluir a operação com a recorrência.";
}

export async function listCurrentUserRecurringTransactions() {
  const { supabase, user } = await requireUser();
  const [recurrencesResult, accountsResult, categoriesResult] =
    await Promise.all([
      supabase
        .from("recurring_transactions")
        .select(recurringTransactionColumns)
        .eq("user_id", user.id)
        .order("ended_at", { ascending: true, nullsFirst: true })
        .order("is_active", { ascending: false })
        .order("next_occurrence"),
      supabase
        .from("accounts")
        .select("id, name, currency, archived_at")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("categories")
        .select("id, name, kind, context, archived_at")
        .eq("user_id", user.id)
        .order("name"),
    ]);

  return {
    recurrences: recurrencesResult.data ?? [],
    accounts: accountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    hasError: Boolean(
      recurrencesResult.error ||
        accountsResult.error ||
        categoriesResult.error,
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
    .select("id, name, kind, context")
    .eq("user_id", user.id);
  categoriesQuery = include?.categoryId
    ? categoriesQuery.or(`archived_at.is.null,id.eq.${include.categoryId}`)
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

export async function getCurrentUserRecurringTransaction(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select(recurringTransactionColumns)
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { recurrence: data, hasError: Boolean(error) };
}

export async function createCurrentUserRecurringTransaction(
  input: RecurringTransactionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("recurring_transactions").insert({
    user_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId,
    transaction_type: input.transactionType,
    description: input.description,
    amount_minor: input.amountMinor,
    frequency: input.frequency,
    start_date: input.startDate,
    end_date: input.endDate,
    next_occurrence: input.nextOccurrence,
    notes: input.notes,
  });

  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const };
}

export async function updateCurrentUserRecurringTransaction(
  id: string,
  input: RecurringTransactionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("recurring_transactions")
    .update({
      account_id: input.accountId,
      category_id: input.categoryId,
      transaction_type: input.transactionType,
      description: input.description,
      amount_minor: input.amountMinor,
      frequency: input.frequency,
      start_date: input.startDate,
      end_date: input.endDate,
      next_occurrence: input.nextOccurrence,
      notes: input.notes,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();

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
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "generate_recurring_transactions",
    { target_until: targetUntil },
  );

  return error
    ? { ok: false as const, message: mutationErrorMessage(error) }
    : { ok: true as const, generatedCount: data ?? 0 };
}
