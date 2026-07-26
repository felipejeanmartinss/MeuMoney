import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type {
  AccountType,
  FinancialContext,
  SupportedCurrency,
} from "@/types/database";

export type AccountMutationInput = {
  name: string;
  type: Extract<AccountType, "checking" | "savings" | "cash" | "other">;
  context: FinancialContext;
  currency: SupportedCurrency;
  openingBalanceMinor: number;
  openingBalanceDate: string;
};

export async function listCurrentUserAccounts() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("account_balances")
    .select("id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at, current_balance_minor")
    .eq("user_id", user.id)
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  return { accounts: data ?? [], hasError: Boolean(error) };
}

export async function getCurrentUserAccount(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { account: data, hasError: Boolean(error) };
}

export async function createCurrentUserAccount(input: AccountMutationInput) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: input.name,
    type: input.type,
    context: input.context,
    currency: input.currency,
    opening_balance_minor: input.openingBalanceMinor,
    opening_balance_date: input.openingBalanceDate,
  });

  return error
    ? { ok: false as const, message: "Não foi possível cadastrar a conta." }
    : { ok: true as const };
}

export async function updateCurrentUserAccount(id: string, input: AccountMutationInput) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("accounts")
    .update({
      name: input.name,
      type: input.type,
      context: input.context,
      currency: input.currency,
      opening_balance_minor: input.openingBalanceMinor,
      opening_balance_date: input.openingBalanceDate,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false as const, message: "Não foi possível atualizar a conta." }
    : { ok: true as const };
}

export async function setCurrentUserAccountArchived(id: string, archived: boolean) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("accounts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  return error || !data
    ? { ok: false as const, message: "Não foi possível alterar o status da conta." }
    : { ok: true as const };
}
