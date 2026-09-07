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
  const [itemsResult, summaryResult, accountsResult, cardBalancesResult] =
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
        "id, user_id, name, type, context, currency, opening_balance_minor, opening_balance_date, archived_at, created_at, updated_at, current_balance_minor, projected_balance_minor",
      )
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("credit_card_summaries")
      .select("id, user_id, currency, current_balance_minor")
      .eq("user_id", user.id)
      .eq("is_active", true),
    ]);

  return {
    userId: user.id,
    items: itemsResult.data ?? [],
    summaries: summaryResult.data ?? [],
    accounts: accountsResult.data ?? [],
    cardBalances: cardBalancesResult.data ?? [],
    hasError: Boolean(
      itemsResult.error ||
        summaryResult.error ||
        accountsResult.error ||
        cardBalancesResult.error,
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

export async function deleteCurrentUserNetWorthValuation(id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("delete_net_worth_valuation", {
    target_valuation_id: id,
  });
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("last_net_worth_valuation")) {
    return {
      ok: false as const,
      message:
        "A avaliação inicial só pode ser removida excluindo o item patrimonial.",
    };
  }
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível excluir a avaliação patrimonial.",
      }
    : { ok: true as const, itemId: data };
}

export async function deleteCurrentUserNetWorthItem(id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("delete_net_worth_item", {
    target_item_id: id,
  });
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("managed_financing_item")) {
    return {
      ok: false as const,
      message:
        "Este item pertence a um financiamento importado e deve ser excluído pelo contrato.",
    };
  }
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível excluir o item patrimonial.",
      }
    : { ok: true as const };
}
