import "server-only";
import {
  calculateInvestmentPerformance,
  summarizeInvestmentPerformance,
  type InvestmentPerformanceCashFlow,
  type InvestmentPerformancePosition,
} from "@/domain/investments";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import type {
  FinancialContext,
  InvestmentAccountEventType,
  InvestmentCashFlowType,
  InvestmentClass,
  InvestmentPositionPerformanceSummary,
  InvestmentType,
  InvestmentTransferCandidate,
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

export type InvestmentAccountEntryMutationInput = {
  accountId: string;
  positionId: string | null;
  eventType: InvestmentAccountEventType;
  description: string;
  amountMinor: number;
  quantity: string | null;
  transactionDate: string;
  notes: string | null;
  newPosition: {
    institution: string;
    investmentClass: InvestmentClass;
    investmentType: InvestmentType;
    assetName: string;
  } | null;
};

export type InvestmentTransferLinkMutationInput = {
  accountId: string;
  transferEntryId: string;
  positionId: string | null;
  eventType: InvestmentAccountEventType;
  quantity: string | null;
  notes: string | null;
  newPosition: {
    institution: string;
    investmentClass: InvestmentClass;
    investmentType: InvestmentType;
    assetName: string;
  } | null;
};

const positionColumns =
  "id, user_id, institution, investment_class, investment_type, asset_name, currency, quantity, accumulated_cost_minor, current_value_minor, position_date, context, history_is_complete, notes, is_active, archived_at, created_at, updated_at";

export async function listCurrentUserInvestmentPositions() {
  const { supabase, user } = await requireUser();
  const cashFlowsPromise = (async () => {
    const rows: {
      position_id: string;
      user_id: string;
      cash_flow_type: InvestmentCashFlowType;
      amount_minor: number;
      cash_flow_date: string;
    }[] = [];
    const pageSize = 1_000;
    for (let start = 0; ; start += pageSize) {
      const page = await supabase
        .from("investment_cash_flows")
        .select(
          "position_id, user_id, cash_flow_type, amount_minor, cash_flow_date",
        )
        .eq("user_id", user.id)
        .order("cash_flow_date", { ascending: true })
        .order("id", { ascending: true })
        .range(start, start + pageSize - 1);
      if (page.error) return { data: rows, error: page.error };
      rows.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < pageSize) {
        return { data: rows, error: null };
      }
    }
  })();
  const [positionsResult, cashFlowsResult] = await Promise.all([
    supabase
      .from("investment_position_summary")
      .select(
        `${positionColumns}, contributions_minor, redemptions_minor, income_minor, unrealized_appreciation_minor, total_result_minor`,
      )
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("currency", { ascending: true })
      .order("asset_name", { ascending: true }),
    cashFlowsPromise,
  ]);

  const cashFlows: InvestmentPerformanceCashFlow[] = (
    cashFlowsResult.data ?? []
  ).map((cashFlow) => ({
    positionId: cashFlow.position_id,
    userId: cashFlow.user_id,
    type: cashFlow.cash_flow_type,
    amountMinor: coerceMinorUnits(cashFlow.amount_minor),
    cashFlowDate: cashFlow.cash_flow_date,
  }));
  const performanceInputs = new Map<string, InvestmentPerformancePosition>();
  const cashFlowsByPosition = new Map<
    string,
    InvestmentPerformanceCashFlow[]
  >();
  for (const cashFlow of cashFlows) {
    const rows = cashFlowsByPosition.get(cashFlow.positionId) ?? [];
    rows.push(cashFlow);
    cashFlowsByPosition.set(cashFlow.positionId, rows);
  }
  const positions: InvestmentPositionPerformanceSummary[] = (
    positionsResult.data ?? []
  ).map((position) => {
    const normalized = {
      ...position,
      accumulated_cost_minor: coerceMinorUnits(
        position.accumulated_cost_minor,
      ),
      current_value_minor: coerceMinorUnits(position.current_value_minor),
      contributions_minor: coerceMinorUnits(position.contributions_minor),
      redemptions_minor: coerceMinorUnits(position.redemptions_minor),
      income_minor: coerceMinorUnits(position.income_minor),
      unrealized_appreciation_minor: coerceMinorUnits(
        position.unrealized_appreciation_minor,
      ),
      total_result_minor:
        position.total_result_minor === null
          ? null
          : coerceMinorUnits(position.total_result_minor),
    };
    const performanceInput: InvestmentPerformancePosition = {
      id: normalized.id,
      userId: normalized.user_id,
      currency: normalized.currency,
      accumulatedCostMinor: normalized.accumulated_cost_minor,
      currentValueMinor: normalized.current_value_minor,
      historyIsComplete: normalized.history_is_complete,
      isActive: normalized.is_active,
      positionDate: normalized.position_date,
    };
    performanceInputs.set(normalized.id, performanceInput);
    const performance = calculateInvestmentPerformance(
      performanceInput,
      cashFlowsByPosition.get(normalized.id) ?? [],
    );
    return {
      ...normalized,
      performance_result_minor: performance.resultMinor,
      performance_result_is_estimated: performance.resultIsEstimated,
      realized_gain_loss_minor: performance.realizedGainLossMinor,
      performance_return_basis_minor: performance.returnBasisMinor,
      total_return_basis_points: performance.totalReturnBasisPoints,
      monthly_return_basis_points: performance.monthlyReturnBasisPoints,
      annualized_return_basis_points:
        performance.annualizedReturnBasisPoints,
    };
  });
  const portfolioPerformance = [...new Set(positions.map((row) => row.currency))]
    .map((currency) => {
      const currencyPositions = positions.filter(
        (position) => position.is_active && position.currency === currency,
      );
      const inputs = currencyPositions.flatMap((position) => {
        const input = performanceInputs.get(position.id);
        return input ? [input] : [];
      });
      return {
        currency,
        ...summarizeInvestmentPerformance(inputs, cashFlows),
      };
    });

  return {
    positions,
    cashFlows,
    performanceInputs,
    portfolioPerformance,
    hasError: Boolean(positionsResult.error || cashFlowsResult.error),
  };
}

export async function listCurrentUserInvestmentTransferCandidates() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("investment_transfer_candidates")
    .select(
      "entry_id, transfer_id, user_id, account_id, account_name, currency, context, direction, amount_minor, transaction_date, description, cash_flow_id, position_id, position_asset_name",
    )
    .eq("user_id", user.id)
    .order("transaction_date", { ascending: false })
    .order("entry_id", { ascending: false });

  return {
    candidates: (data ?? []) as InvestmentTransferCandidate[],
    hasError: Boolean(error),
  };
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
        "id, position_id, user_id, cash_flow_type, income_type, transaction_id, source_transfer_id, source_account_id, amount_minor, quantity, cash_flow_date, notes, position_value_delta_minor, position_cost_delta_minor, position_quantity_delta, created_at",
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
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_investment_cash_flow", {
    target_position_id: positionId,
    target_cash_flow_type: input.cashFlowType,
    target_amount_minor: input.amountMinor,
    target_quantity: input.quantity,
    target_cash_flow_date: input.cashFlowDate,
    target_notes: input.notes,
  });

  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("investment_redemption_exceeds_position")) {
    return {
      ok: false as const,
      message: "O resgate não pode superar o valor atual da posição.",
    };
  }
  if (message.includes("investment_redemption_exceeds_quantity")) {
    return {
      ok: false as const,
      message: "A quantidade resgatada não pode superar a posição atual.",
    };
  }

  return error || !data
    ? {
        ok: false as const,
        message:
          "Não foi possível registrar o aporte, resgate ou renda desta posição.",
      }
    : { ok: true as const, id: data };
}

export async function deleteCurrentUserInvestmentCashFlow(id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("delete_investment_cash_flow", {
    target_cash_flow_id: id,
  });
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("investment_cash_flow_reversal_conflict")) {
    return {
      ok: false as const,
      message:
        "Não é possível desfazer este movimento antes de excluir os movimentos posteriores que dependem dele.",
    };
  }
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível excluir o movimento de investimento.",
      }
    : { ok: true as const, positionId: data };
}

export async function deleteCurrentUserInvestmentPosition(id: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("delete_investment_position", {
    target_position_id: id,
  });
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível excluir a posição de investimento.",
      }
    : { ok: true as const };
}

export async function createCurrentUserInvestmentAccountEntry(
  input: InvestmentAccountEntryMutationInput,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "create_investment_account_entry",
    {
      target_account_id: input.accountId,
      target_position_id: input.positionId,
      target_event_type: input.eventType,
      target_description: input.description,
      target_amount_minor: input.amountMinor,
      target_quantity: input.quantity,
      target_transaction_date: input.transactionDate,
      target_notes: input.notes,
      target_create_position: input.newPosition !== null,
      target_new_institution: input.newPosition?.institution ?? null,
      target_new_investment_class:
        input.newPosition?.investmentClass ?? null,
      target_new_investment_type: input.newPosition?.investmentType ?? null,
      target_new_asset_name: input.newPosition?.assetName ?? null,
    },
  );

  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("investment_account_mismatch")) {
    return {
      ok: false as const,
      message: "A conta e a posição devem ter a mesma moeda e contexto.",
    };
  }
  if (message.includes("invalid_investment_account")) {
    return {
      ok: false as const,
      message: "Selecione uma conta ativa do tipo Investimento.",
    };
  }
  if (message.includes("invalid_new_investment_position")) {
    return {
      ok: false as const,
      message: "Revise os dados da nova posição e do aporte inicial.",
    };
  }
  if (message.includes("investment_redemption_exceeds_position")) {
    return {
      ok: false as const,
      message: "O resgate não pode superar o valor atual da posição.",
    };
  }
  if (message.includes("investment_redemption_exceeds_quantity")) {
    return {
      ok: false as const,
      message: "A quantidade resgatada não pode superar a posição atual.",
    };
  }

  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível registrar este movimento de investimento.",
      }
    : { ok: true as const, transactionId: data };
}

export async function linkCurrentUserInvestmentTransferEntry(
  input: InvestmentTransferLinkMutationInput,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "link_investment_transfer_entry",
    {
      target_account_id: input.accountId,
      target_transfer_entry_id: input.transferEntryId,
      target_position_id: input.positionId,
      target_event_type: input.eventType,
      target_quantity: input.quantity,
      target_notes: input.notes,
      target_create_position: input.newPosition !== null,
      target_new_institution: input.newPosition?.institution ?? null,
      target_new_investment_class:
        input.newPosition?.investmentClass ?? null,
      target_new_investment_type: input.newPosition?.investmentType ?? null,
      target_new_asset_name: input.newPosition?.assetName ?? null,
    },
  );

  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("investment_transfer_already_linked")) {
    return {
      ok: false as const,
      message: "Esta transferência já está vinculada a uma posição.",
    };
  }
  if (message.includes("investment_transfer_direction_mismatch")) {
    return {
      ok: false as const,
      message:
        "Entradas aceitam aplicações; saídas aceitam resgates e rendimentos.",
    };
  }
  if (message.includes("invalid_investment_transfer_entry")) {
    return {
      ok: false as const,
      message: "A transferência não está disponível para vínculo.",
    };
  }
  if (message.includes("investment_account_mismatch")) {
    return {
      ok: false as const,
      message: "A conta e a posição devem ter a mesma moeda e contexto.",
    };
  }
  if (message.includes("investment_redemption_exceeds_position")) {
    return {
      ok: false as const,
      message: "O resgate não pode superar o valor atual da posição.",
    };
  }
  if (message.includes("investment_redemption_exceeds_quantity")) {
    return {
      ok: false as const,
      message: "A quantidade resgatada não pode superar a posição atual.",
    };
  }

  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível vincular a transferência à posição.",
      }
    : { ok: true as const, transactionId: data };
}
