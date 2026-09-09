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

type AnnualBudgetMutationInput = MonthlyBudgetMutationInput & {
  referenceMonth: string;
};

const progressColumns =
  "budget_id, user_id, category_id, category_name, context, currency, reference_month, planned_amount_minor, realized_amount_minor, available_amount_minor, percentage_consumed, category_kind";

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
      .select("id, group_id, parent_id, name, kind, context, archived_at")
      .eq("user_id", user.id)
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

export async function getCurrentUserAnnualBudget(input: {
  year: number;
  context: FinancialContext;
  currency: SupportedCurrency;
}) {
  const { supabase, user } = await requireUser();
  const [categoriesResult, progressResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, group_id, parent_id, name, kind, context, archived_at")
      .eq("user_id", user.id)
      .eq("context", input.context)
      .is("archived_at", null)
      .order("kind")
      .order("name"),
    supabase
      .from("monthly_budget_progress")
      .select(progressColumns)
      .eq("user_id", user.id)
      .eq("context", input.context)
      .eq("currency", input.currency)
      .gte("reference_month", `${input.year}-01-01`)
      .lte("reference_month", `${input.year}-12-01`)
      .order("reference_month")
      .order("category_name"),
  ]);

  return {
    categories: categoriesResult.data ?? [],
    progress: (progressResult.data ?? []).map(normalizeProgress),
    hasError: Boolean(categoriesResult.error || progressResult.error),
  };
}

export async function upsertCurrentUserAnnualBudgets(
  currency: SupportedCurrency,
  rows: AnnualBudgetMutationInput[],
) {
  const { supabase, user } = await requireUser();
  if (rows.length === 0) return { ok: true as const };
  return saveCurrentUserBudgetRows({
    supabase,
    userId: user.id,
    currency,
    rows,
  });
}

export async function upsertCurrentUserMonthlyBudgets(
  referenceMonth: string,
  currency: SupportedCurrency,
  rows: MonthlyBudgetMutationInput[],
) {
  const { supabase, user } = await requireUser();
  if (rows.length === 0) return { ok: true as const };
  return saveCurrentUserBudgetRows({
    supabase,
    userId: user.id,
    currency,
    rows: rows.map((row) => ({ ...row, referenceMonth })),
  });
}

async function saveCurrentUserBudgetRows({
  supabase,
  userId,
  currency,
  rows,
}: {
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"];
  userId: string;
  currency: SupportedCurrency;
  rows: AnnualBudgetMutationInput[];
}) {
  const referenceMonths = [...new Set(rows.map((row) => row.referenceMonth))];
  const { data: existingRows, error: readError } = await supabase
    .from("monthly_budgets")
    .select("id, category_id, reference_month, planned_amount_minor")
    .eq("user_id", userId)
    .eq("currency", currency)
    .in("reference_month", referenceMonths);

  if (readError) {
    return {
      ok: false as const,
      message: "Não foi possível conferir os valores já planejados.",
    };
  }

  const existingByCell = new Map(
    (existingRows ?? []).map((row) => [
      `${row.category_id}|${row.reference_month}`,
      row,
    ]),
  );
  const inserts: Array<{
    user_id: string;
    category_id: string;
    reference_month: string;
    currency: SupportedCurrency;
    planned_amount_minor: number;
  }> = [];
  const updates: Array<{ id: string; plannedAmountMinor: number }> = [];

  for (const row of rows) {
    const existing = existingByCell.get(
      `${row.categoryId}|${row.referenceMonth}`,
    );
    if (existing) {
      if (Number(existing.planned_amount_minor) !== row.plannedAmountMinor) {
        updates.push({ id: existing.id, plannedAmountMinor: row.plannedAmountMinor });
      }
    } else if (row.plannedAmountMinor > 0) {
      inserts.push({
        user_id: userId,
        category_id: row.categoryId,
        reference_month: row.referenceMonth,
        currency,
        planned_amount_minor: row.plannedAmountMinor,
      });
    }
  }

  const operations: Array<PromiseLike<{ error: { message?: string } | null }>> = [];
  if (inserts.length) {
    operations.push(supabase.from("monthly_budgets").insert(inserts));
  }
  for (const update of updates) {
    operations.push(
      supabase
        .from("monthly_budgets")
        .update({ planned_amount_minor: update.plannedAmountMinor })
        .eq("user_id", userId)
        .eq("id", update.id),
    );
  }

  const results = await Promise.all(operations);
  return results.some((result) => result.error)
    ? {
        ok: false as const,
        message:
          "Não foi possível salvar todos os valores planejados. Tente novamente.",
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
