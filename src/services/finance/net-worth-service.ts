import "server-only";
import { kindForNetWorthItemType } from "@/domain/net-worth";
import { requireUser } from "@/services/auth/server-auth";
import type {
  FinancialContext,
  NetWorthItemType,
  SupportedCurrency,
} from "@/types/database";

export type NetWorthItemMutationInput = {
  itemType: NetWorthItemType;
  name: string;
  currency: SupportedCurrency;
  currentValueMinor: number;
  valuationDate: string;
  context: FinancialContext;
  notes: string | null;
};

export async function listCurrentUserNetWorth() {
  const { supabase, user } = await requireUser();
  const [itemsResult, summaryResult, accountsResult, invoicesResult] =
    await Promise.all([
    supabase
      .from("net_worth_items")
      .select(
        "id, user_id, kind, item_type, name, currency, current_value_minor, valuation_date, context, notes, is_active, archived_at, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("net_worth_summary")
      .select(
        "user_id, currency, assets_minor, manual_assets_minor, investments_minor, liabilities_minor, net_worth_minor",
      )
      .eq("user_id", user.id)
      .order("currency", { ascending: true }),
    supabase
      .from("account_balances")
      .select(
        "id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at, current_balance_minor",
      )
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("financial_dashboard_invoices")
      .select(
        "id, user_id, credit_card_id, credit_card_name, currency, reference_month, due_date, status, effective_status, total_amount_minor, outstanding_amount_minor",
      )
      .eq("user_id", user.id)
      .order("due_date"),
    ]);

  return {
    userId: user.id,
    items: itemsResult.data ?? [],
    summaries: summaryResult.data ?? [],
    accounts: accountsResult.data ?? [],
    invoices: invoicesResult.data ?? [],
    hasError: Boolean(
      itemsResult.error ||
        summaryResult.error ||
        accountsResult.error ||
        invoicesResult.error,
    ),
  };
}

export async function getCurrentUserNetWorthItem(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("net_worth_items")
    .select(
      "id, user_id, kind, item_type, name, currency, current_value_minor, valuation_date, context, notes, is_active, archived_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { item: data, hasError: Boolean(error) };
}

export async function listCurrentUserNetWorthValuations(itemId: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("net_worth_valuations")
    .select(
      "id, item_id, user_id, currency, value_minor, valuation_date, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("item_id", itemId)
    .order("valuation_date", { ascending: false })
    .order("created_at", { ascending: false });

  return { valuations: data ?? [], hasError: Boolean(error) };
}

export async function createCurrentUserNetWorthItem(
  input: NetWorthItemMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("net_worth_items")
    .insert({
      user_id: user.id,
      kind: kindForNetWorthItemType(input.itemType),
      item_type: input.itemType,
      name: input.name,
      currency: input.currency,
      current_value_minor: input.currentValueMinor,
      valuation_date: input.valuationDate,
      context: input.context,
      notes: input.notes,
    })
    .select("id")
    .single();

  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível cadastrar o item patrimonial.",
      }
    : { ok: true as const, id: data.id };
}

export async function updateCurrentUserNetWorthItem(
  id: string,
  input: NetWorthItemMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("net_worth_items")
    .update({
      item_type: input.itemType,
      name: input.name,
      current_value_minor: input.currentValueMinor,
      valuation_date: input.valuationDate,
      context: input.context,
      notes: input.notes,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("currency", input.currency)
    .select("id")
    .maybeSingle();

  return error || !data
    ? {
        ok: false as const,
        message:
          "Não foi possível atualizar o item. Use uma data igual ou posterior à avaliação atual.",
      }
    : { ok: true as const };
}

export async function setCurrentUserNetWorthItemArchived(
  id: string,
  archived: boolean,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("net_worth_items")
    .update({
      is_active: !archived,
      archived_at: archived ? new Date().toISOString() : null,
    })
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível alterar o estado do item patrimonial.",
      }
    : { ok: true as const };
}
