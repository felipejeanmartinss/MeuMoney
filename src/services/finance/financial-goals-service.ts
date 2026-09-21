import "server-only";

import {
  calculateGoalProgress,
  type GoalSourceBalance,
} from "@/domain/financial-goals";
import {
  convertMinorUnits,
  type CurrencyConversionSample,
} from "@/domain/currency-conversion";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import { listCurrentUserFinancingContracts } from "./financing-imports-service";
import { currentIsoDate } from "@/utils/dates";
import type {
  FinancialGoal,
  FinancialGoalContribution,
  FinancialGoalLink,
  FinancialGoalType,
  SupportedCurrency,
} from "@/types/database";

const goalColumns =
  "id, user_id, name, goal_type, currency, target_amount_minor, target_date, status, notes, created_at, updated_at";
const contributionColumns =
  "id, user_id, goal_id, contribution_date, amount_minor, currency, source, description, created_at";
const linkColumns =
  "id, user_id, goal_id, source_type, account_id, investment_position_id, financing_contract_id, created_at";

export type FinancialGoalSourceOption = GoalSourceBalance & {
  linked: boolean;
};

export type FinancialGoalSummary = FinancialGoal & {
  accumulated_amount_minor: number;
  manual_contributions_minor: number;
  linked_amount_minor: number;
  progress: ReturnType<typeof calculateGoalProgress>;
  contributions: FinancialGoalContribution[];
  links: FinancialGoalLink[];
  sources: GoalSourceBalance[];
};

export type FinancialGoalsPageData = {
  goals: FinancialGoalSummary[];
  sourceOptions: FinancialGoalSourceOption[];
  preferredCurrency: SupportedCurrency;
  hasError: boolean;
};

async function loadSamples(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
) {
  const result = await supabase
    .from("transfers")
    .select("currency, destination_currency, amount_minor, destination_amount_minor, transaction_date")
    .eq("user_id", userId)
    .eq("status", "completed")
    .eq("is_active", true)
    .not("destination_currency", "is", null)
    .not("destination_amount_minor", "is", null)
    .order("transaction_date", { ascending: false });
  const samples: CurrencyConversionSample[] = (result.data ?? []).flatMap((row) =>
    row.destination_currency && row.destination_amount_minor
      ? [{
          sourceCurrency: row.currency,
          destinationCurrency: row.destination_currency,
          sourceAmountMinor: coerceMinorUnits(row.amount_minor),
          destinationAmountMinor: coerceMinorUnits(row.destination_amount_minor),
          transactionDate: row.transaction_date,
        }]
      : [],
  );
  return { samples, hasError: Boolean(result.error) };
}

export async function listCurrentUserFinancialGoals(): Promise<FinancialGoalsPageData> {
  const { supabase, user } = await requireUser();
  const [profileResult, goalsResult, contributionsResult, linksResult, accountsResult, positionsResult, financingResult, samplesResult] = await Promise.all([
    supabase.from("profiles").select("preferred_currency").eq("id", user.id).maybeSingle(),
    supabase.from("financial_goals").select(goalColumns).eq("user_id", user.id).neq("status", "archived").order("status").order("target_date"),
    supabase.from("financial_goal_contributions").select(contributionColumns).eq("user_id", user.id).order("contribution_date", { ascending: false }),
    supabase.from("financial_goal_links").select(linkColumns).eq("user_id", user.id),
    supabase.from("account_balances").select("id, name, currency, current_balance_minor, archived_at").eq("user_id", user.id),
    supabase.from("investment_positions").select("id, asset_name, currency, current_value_minor, is_active").eq("user_id", user.id),
    listCurrentUserFinancingContracts(),
    loadSamples(supabase, user.id),
  ]);
  const preferredCurrency = profileResult.data?.preferred_currency ?? "BRL";
  const samples = samplesResult.samples;
  const today = currentIsoDate();
  const accounts = (accountsResult.data ?? []).filter((row) => !row.archived_at);
  const positions = (positionsResult.data ?? []).filter((row) => row.is_active);
  const financing = financingResult.contracts;
  const sourceMap = new Map<string, GoalSourceBalance>();
  for (const row of accounts) sourceMap.set(`account:${row.id}`, { sourceType: "account", sourceId: row.id, name: row.name, currency: row.currency, amountMinor: coerceMinorUnits(row.current_balance_minor) });
  for (const row of positions) sourceMap.set(`investment:${row.id}`, { sourceType: "investment", sourceId: row.id, name: row.asset_name, currency: row.currency, amountMinor: coerceMinorUnits(row.current_value_minor) });
  for (const row of financing) sourceMap.set(`financing:${row.id}`, { sourceType: "financing", sourceId: row.id, name: row.name, currency: row.currency, amountMinor: coerceMinorUnits(row.current_balance_minor) });

  const goals = ((goalsResult.data ?? []) as FinancialGoal[]).map((goal) => {
    const contributions = ((contributionsResult.data ?? []) as FinancialGoalContribution[]).filter((row) => row.goal_id === goal.id);
    const links = ((linksResult.data ?? []) as FinancialGoalLink[]).filter((row) => row.goal_id === goal.id);
    const manualContributions = contributions.reduce((total, row) => {
      const converted = convertMinorUnits(row.amount_minor, row.currency, goal.currency, row.contribution_date, samples);
      return total + (converted ?? (row.currency === goal.currency ? row.amount_minor : 0));
    }, 0);
    const sources = links.flatMap((link) => {
      const source = sourceMap.get(`${link.source_type}:${link.account_id ?? link.investment_position_id ?? link.financing_contract_id}`);
      if (!source) return [];
      return [source];
    });
    const linkedAmount = sources.reduce((total, source) => {
      const amount = source.sourceType === "financing"
        ? Math.max(0, (financing.find((row) => row.id === source.sourceId)?.original_principal_minor ?? 0) - source.amountMinor)
        : source.amountMinor;
      const converted = convertMinorUnits(amount, source.currency, goal.currency, today, samples);
      return total + (converted ?? (source.currency === goal.currency ? amount : 0));
    }, 0);
    const accumulated = manualContributions + linkedAmount;
    return {
      ...goal,
      target_amount_minor: coerceMinorUnits(goal.target_amount_minor),
      accumulated_amount_minor: accumulated,
      manual_contributions_minor: manualContributions,
      linked_amount_minor: linkedAmount,
      progress: calculateGoalProgress({ targetAmountMinor: coerceMinorUnits(goal.target_amount_minor), accumulatedAmountMinor: accumulated, targetDate: goal.target_date, today }),
      contributions,
      links,
      sources,
    } satisfies FinancialGoalSummary;
  });
  const linkedKeys = new Set(((linksResult.data ?? []) as FinancialGoalLink[]).map((row) => `${row.source_type}:${row.account_id ?? row.investment_position_id ?? row.financing_contract_id}`));
  const sourceOptions = [...sourceMap.values()].map((source) => ({ ...source, linked: linkedKeys.has(`${source.sourceType}:${source.sourceId}`) }));
  return {
    goals,
    sourceOptions,
    preferredCurrency,
    hasError: Boolean(profileResult.error || goalsResult.error || contributionsResult.error || linksResult.error || accountsResult.error || positionsResult.error || financingResult.hasError || samplesResult.hasError),
  };
}

export async function createCurrentUserFinancialGoal(input: {
  name: string;
  goalType: FinancialGoalType;
  currency: SupportedCurrency;
  targetAmountMinor: number;
  targetDate: string;
  notes: string | null;
}) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("financial_goals").insert({ user_id: user.id, name: input.name, goal_type: input.goalType, currency: input.currency, target_amount_minor: input.targetAmountMinor, target_date: input.targetDate, notes: input.notes }).select("id").single();
  return error || !data ? { ok: false as const, message: "Não foi possível criar a meta." } : { ok: true as const, id: data.id };
}

export async function addCurrentUserGoalContribution(input: {
  goalId: string;
  contributionDate: string;
  amountMinor: number;
  currency: SupportedCurrency;
  description: string | null;
}) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("financial_goal_contributions").insert({ user_id: user.id, goal_id: input.goalId, contribution_date: input.contributionDate, amount_minor: input.amountMinor, currency: input.currency, description: input.description, source: "manual" });
  return error ? { ok: false as const, message: "Não foi possível registrar a contribuição." } : { ok: true as const };
}

export async function linkCurrentUserGoalSource(input: { goalId: string; sourceType: "account" | "investment" | "financing"; sourceId: string }) {
  const { supabase, user } = await requireUser();
  const sourceColumn = input.sourceType === "account" ? "account_id" : input.sourceType === "investment" ? "investment_position_id" : "financing_contract_id";
  const { data: source } = await supabase.from(input.sourceType === "account" ? "accounts" : input.sourceType === "investment" ? "investment_positions" : "financing_contracts").select("id").eq("id", input.sourceId).eq("user_id", user.id).maybeSingle();
  if (!source) return { ok: false as const, message: "A fonte selecionada não está disponível." };
  const link: {
    user_id: string;
    goal_id: string;
    source_type: "account" | "investment" | "financing";
    account_id?: string;
    investment_position_id?: string;
    financing_contract_id?: string;
  } = { user_id: user.id, goal_id: input.goalId, source_type: input.sourceType };
  if (sourceColumn === "account_id") link.account_id = input.sourceId;
  if (sourceColumn === "investment_position_id") link.investment_position_id = input.sourceId;
  if (sourceColumn === "financing_contract_id") link.financing_contract_id = input.sourceId;
  const { error } = await supabase.from("financial_goal_links").insert(link);
  return error ? { ok: false as const, message: "Essa fonte já está vinculada ou não pôde ser adicionada." } : { ok: true as const };
}

export async function unlinkCurrentUserGoalSource(linkId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("financial_goal_links").delete().eq("id", linkId).eq("user_id", user.id);
  return error ? { ok: false as const, message: "Não foi possível remover o vínculo." } : { ok: true as const };
}
