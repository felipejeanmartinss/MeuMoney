import "server-only";
import { requireUser } from "@/services/auth/server-auth";
import type {
  FinancialContext,
  InvestmentCashFlowType,
  InvestmentClass,
  InvestmentType,
  SupportedCurrency,
} from "@/types/database";

export type InvestmentPositionMutationInput = {
  institution: string;
  investmentClass: InvestmentClass;
  investmentType: InvestmentType;
  assetName: string;
  currency: SupportedCurrency;
  quantity: string;
  accumulatedCostMinor: number;
  currentValueMinor: number;
  positionDate: string;
  context: FinancialContext;
  historyIsComplete: boolean;
  notes: string | null;
};

export type InvestmentCashFlowMutationInput = {
  cashFlowType: InvestmentCashFlowType;
  amountMinor: number;
  quantity: string | null;
  cashFlowDate: string;
  notes: string | null;
};

const positionColumns =
  "id, user_id, institution, investment_class, investment_type, asset_name, currency, quantity, accumulated_cost_minor, current_value_minor, position_date, context, history_is_complete, notes, is_active, archived_at, created_at, updated_at";

export async function listCurrentUserInvestmentPositions() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("investment_position_summary")
    .select(
      `${positionColumns}, contributions_minor, redemptions_minor, income_minor, unrealized_appreciation_minor, total_result_minor`,
    )
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("currency", { ascending: true })
    .order("asset_name", { ascending: true });

  return { positions: data ?? [], hasError: Boolean(error) };
}

export async function getCurrentUserInvestmentPosition(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("investment_positions")
    .select(positionColumns)
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return { position: data, hasError: Boolean(error) };
}

export async function listCurrentUserInvestmentHistory(positionId: string) {
  const { supabase, user } = await requireUser();
  const [snapshotsResult, cashFlowsResult] = await Promise.all([
    supabase
      .from("investment_position_snapshots")
      .select(
        "id, position_id, user_id, currency, quantity, accumulated_cost_minor, current_value_minor, position_date, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .eq("position_id", positionId)
      .order("position_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("investment_cash_flows")
      .select(
        "id, position_id, user_id, cash_flow_type, amount_minor, quantity, cash_flow_date, notes, created_at",
      )
      .eq("user_id", user.id)
      .eq("position_id", positionId)
      .order("cash_flow_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  return {
    snapshots: snapshotsResult.data ?? [],
    cashFlows: cashFlowsResult.data ?? [],
    hasError: Boolean(snapshotsResult.error || cashFlowsResult.error),
  };
}

export async function createCurrentUserInvestmentPosition(
  input: InvestmentPositionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("investment_positions")
    .insert({
      user_id: user.id,
      institution: input.institution,
      investment_class: input.investmentClass,
      investment_type: input.investmentType,
      asset_name: input.assetName,
      currency: input.currency,
      quantity: input.quantity,
      accumulated_cost_minor: input.accumulatedCostMinor,
      current_value_minor: input.currentValueMinor,
      position_date: input.positionDate,
      context: input.context,
      history_is_complete: input.historyIsComplete,
      notes: input.notes,
    })
    .select("id")
    .single();

  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível cadastrar a posição de investimento.",
      }
    : { ok: true as const, id: data.id };
}

export async function updateCurrentUserInvestmentPosition(
  id: string,
  input: InvestmentPositionMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("investment_positions")
    .update({
      institution: input.institution,
      investment_class: input.investmentClass,
      investment_type: input.investmentType,
      asset_name: input.assetName,
      quantity: input.quantity,
      accumulated_cost_minor: input.accumulatedCostMinor,
      current_value_minor: input.currentValueMinor,
      position_date: input.positionDate,
      context: input.context,
      history_is_complete: input.historyIsComplete,
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
          "Não foi possível atualizar a posição. Use uma data igual ou posterior à posição atual.",
      }
    : { ok: true as const };
}

export async function setCurrentUserInvestmentPositionArchived(
  id: string,
  archived: boolean,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("investment_positions")
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
        message: "Não foi possível alterar o estado da posição.",
      }
    : { ok: true as const };
}

export async function createCurrentUserInvestmentCashFlow(
  positionId: string,
  input: InvestmentCashFlowMutationInput,
) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("investment_cash_flows")
    .insert({
      position_id: positionId,
      user_id: user.id,
      cash_flow_type: input.cashFlowType,
      amount_minor: input.amountMinor,
      quantity: input.quantity,
      cash_flow_date: input.cashFlowDate,
      notes: input.notes,
    })
    .select("id")
    .single();

  return error || !data
    ? {
        ok: false as const,
        message:
          "Não foi possível registrar o aporte, resgate ou renda desta posição.",
      }
    : { ok: true as const, id: data.id };
}
