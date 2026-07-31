import "server-only";
import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import type {
  FinancialContext,
  MonthlyBudgetProgress,
  SupportedCurrency,
} from "@/types/database";

export type MonthlyBudgetMutationInput = {
  categoryId: string;
  plannedAmountMinor: number;
};

const progressColumns =
  "budget_id, user_id, category_id, category_name, context, currency, reference_month, planned_amount_minor, realized_amount_minor, available_amount_minor, percentage_consumed";

function normalizeProgress(row: MonthlyBudgetProgress): MonthlyBudgetProgress {
  return {
    ...row,
    planned_amount_minor: coerceMinorUnits(row.planned_amount_minor),
    realized_amount_minor: coerceMinorUnits(row.realized_amount_minor),
    available_amount_minor: coerceMinorUnits(row.available_amount_minor),
    percentage_consumed:
      row.percentage_consumed === null
        ? null
        : Number(row.percentage_consumed),
  };
}

export async function getCurrentUserMonthlyBudget(input: {
  referenceMonth: string;
  context: FinancialContext;
  currency: SupportedCurrency;
}) {
  const { supabase, user } = await requireUser();
  const [categoriesResult, progressResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, parent_id, name, context")
      .eq("user_id", user.id)
      .eq("kind", "expense")
      .eq("context", input.context)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("monthly_budget_progress")
      .select(progressColumns)
      .eq("user_id", user.id)
      .eq("reference_month", input.referenceMonth)
      .eq("context", input.context)
      .eq("currency", input.currency)
      .order("category_name"),
  ]);

  return {
    categories: categoriesResult.data ?? [],
    progress: (progressResult.data ?? []).map(normalizeProgress),
    hasError: Boolean(categoriesResult.error || progressResult.error),
  };
}

export async function upsertCurrentUserMonthlyBudgets(
  referenceMonth: string,
  currency: SupportedCurrency,
  rows: MonthlyBudgetMutationInput[],
) {
  const { supabase, user } = await requireUser();
  if (rows.length === 0) return { ok: true as const };

  const { error } = await supabase.from("monthly_budgets").upsert(
    rows.map((row) => ({
      user_id: user.id,
      category_id: row.categoryId,
      reference_month: referenceMonth,
      currency,
      planned_amount_minor: row.plannedAmountMinor,
    })),
    {
      onConflict: "user_id,reference_month,currency,category_id",
    },
  );

  return error
    ? {
        ok: false as const,
        message:
          "Não foi possível salvar o orçamento. Verifique as categorias e tente novamente.",
      }
    : { ok: true as const };
}

export async function copyCurrentUserPreviousMonthBudgets(input: {
  referenceMonth: string;
  context: FinancialContext;
  currency: SupportedCurrency;
}) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("copy_previous_month_budgets", {
    target_reference_month: input.referenceMonth,
    target_context: input.context,
    target_currency: input.currency,
  });

  return error
    ? {
        ok: false as const,
        message: "Não foi possível copiar o orçamento do mês anterior.",
      }
    : { ok: true as const, copiedCount: data };
}
