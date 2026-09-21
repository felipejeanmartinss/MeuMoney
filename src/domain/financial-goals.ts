import { z } from "zod";
import type {
  FinancialGoalStatus,
  FinancialGoalType,
  SupportedCurrency,
} from "@/types/database";
import { SUPPORTED_CURRENCIES } from "./currencies";
import { parseMoneyInputToMinor } from "./money";

export const FINANCIAL_GOAL_TYPES = [
  "emergency_fund",
  "travel",
  "home_purchase",
  "renovation",
  "financial_independence",
  "financing_payoff",
] as const satisfies readonly FinancialGoalType[];

export const FINANCIAL_GOAL_TYPE_LABELS: Record<FinancialGoalType, string> = {
  emergency_fund: "Reserva de emergência",
  travel: "Viagem",
  home_purchase: "Compra de imóvel",
  renovation: "Reforma",
  financial_independence: "Independência financeira",
  financing_payoff: "Quitação de financiamento",
};

export const FINANCIAL_GOAL_STATUS_LABELS: Record<FinancialGoalStatus, string> = {
  active: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  archived: "Arquivada",
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.");

export const financialGoalFormSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para a meta.").max(120),
  goalType: z.enum(FINANCIAL_GOAL_TYPES),
  currency: z.enum(SUPPORTED_CURRENCIES),
  targetAmountMinor: z.coerce.number().int().positive("Informe um valor alvo maior que zero."),
  targetDate: dateSchema,
  notes: z.string().trim().max(1000).nullable(),
});

export const financialGoalContributionSchema = z.object({
  goalId: z.string().uuid(),
  contributionDate: dateSchema,
  amountMinor: z.coerce.number().int().positive("Informe um valor maior que zero."),
  currency: z.enum(SUPPORTED_CURRENCIES),
  description: z.string().trim().max(240).nullable(),
});

export type FinancialGoalFormInput = z.infer<typeof financialGoalFormSchema>;

export function parseGoalMoneyInput(value: string) {
  return parseMoneyInputToMinor(value);
}

function monthDifference(from: string, to: string) {
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  return Math.max(
    0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth(),
  );
}

export function calculateGoalProgress(input: {
  targetAmountMinor: number;
  accumulatedAmountMinor: number;
  targetDate: string;
  today: string;
}) {
  const remainingAmountMinor = Math.max(
    0,
    input.targetAmountMinor - input.accumulatedAmountMinor,
  );
  const percentage = input.targetAmountMinor
    ? Math.min(100, Math.round((input.accumulatedAmountMinor / input.targetAmountMinor) * 1000) / 10)
    : 0;
  const monthsRemaining = monthDifference(input.today, input.targetDate);
  const monthlyContributionMinor =
    remainingAmountMinor === 0
      ? 0
      : Math.ceil(remainingAmountMinor / Math.max(1, monthsRemaining + 1));
  return {
    remainingAmountMinor,
    percentage,
    monthsRemaining,
    monthlyContributionMinor,
    isOverdue: input.targetDate < input.today && remainingAmountMinor > 0,
  };
}

export type GoalSourceBalance = {
  sourceType: "account" | "investment" | "financing";
  sourceId: string;
  name: string;
  currency: SupportedCurrency;
  amountMinor: number;
};
