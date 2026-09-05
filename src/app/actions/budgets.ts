"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  annualBudgetBatchSchema,
  monthlyBudgetBatchSchema,
  toReferenceMonth,
} from "@/domain/budgets";
import {
  copyCurrentUserPreviousMonthBudgets,
  upsertCurrentUserAnnualBudgets,
  upsertCurrentUserMonthlyBudgets,
} from "@/services/finance/budgets-service";

export type BudgetFormState = {
  status: "idle" | "error";
  message?: string;
};

function budgetUrl(input: {
  month: string;
  context: string;
  currency: string;
  message?: string;
  count?: number;
}) {
  const params = new URLSearchParams({
    month: input.month,
    context: input.context,
    currency: input.currency,
  });
  if (input.message) params.set("message", input.message);
  if (input.count !== undefined) params.set("count", String(input.count));
  return `/budgets?${params.toString()}`;
}

export async function saveAnnualBudgets(
  _previousState: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const cells = formData.getAll("budgetCell");
  const amounts = formData.getAll("plannedAmountMinor");
  const parsed = annualBudgetBatchSchema.safeParse({
    year: formData.get("year"),
    context: formData.get("context"),
    currency: formData.get("currency"),
    rows: cells.map((cell, index) => {
      const [categoryId, referenceMonth] = String(cell).split("|");
      return {
        categoryId,
        referenceMonth,
        plannedAmountMinor: amounts[index],
      };
    }),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revise os valores do orçamento anual.",
    };
  }
  const keys = parsed.data.rows.map(
    (row) => `${row.categoryId}|${row.referenceMonth}`,
  );
  if (new Set(keys).size !== keys.length) {
    return { status: "error", message: "Existem células duplicadas no orçamento." };
  }

  const result = await upsertCurrentUserAnnualBudgets(
    parsed.data.currency,
    parsed.data.rows,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect(`/budgets?view=annual&year=${parsed.data.year}&context=${parsed.data.context}&currency=${parsed.data.currency}&message=saved`);
}

function budgetBatchFrom(formData: FormData) {
  const categoryIds = formData.getAll("categoryId");
  const plannedAmounts = formData.getAll("plannedAmountMinor");
  return {
    referenceMonth: formData.get("referenceMonth"),
    context: formData.get("context"),
    currency: formData.get("currency"),
    rows: categoryIds.map((categoryId, index) => ({
      categoryId,
      plannedAmountMinor: plannedAmounts[index],
    })),
  };
}

export async function saveMonthlyBudgets(
  _previousState: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const parsed = monthlyBudgetBatchSchema.safeParse(budgetBatchFrom(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Revise os valores informados no orçamento.",
    };
  }

  if (
    new Set(parsed.data.rows.map((row) => row.categoryId)).size !==
    parsed.data.rows.length
  ) {
    return { status: "error", message: "Existem categorias duplicadas." };
  }

  const result = await upsertCurrentUserMonthlyBudgets(
    toReferenceMonth(parsed.data.referenceMonth),
    parsed.data.currency,
    parsed.data.rows,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/budgets");
  redirect(
    budgetUrl({
      month: parsed.data.referenceMonth,
      context: parsed.data.context,
      currency: parsed.data.currency,
      message: "saved",
    }),
  );
}

export async function copyPreviousMonthBudgets(formData: FormData) {
  const parsed = monthlyBudgetBatchSchema
    .pick({
      referenceMonth: true,
      context: true,
      currency: true,
    })
    .safeParse({
      referenceMonth: formData.get("referenceMonth"),
      context: formData.get("context"),
      currency: formData.get("currency"),
    });

  if (!parsed.success) redirect("/budgets?message=copy-error");

  const result = await copyCurrentUserPreviousMonthBudgets({
    referenceMonth: toReferenceMonth(parsed.data.referenceMonth),
    context: parsed.data.context,
    currency: parsed.data.currency,
  });
  revalidatePath("/budgets");
  redirect(
    budgetUrl({
      month: parsed.data.referenceMonth,
      context: parsed.data.context,
      currency: parsed.data.currency,
      message: result.ok ? "copied" : "copy-error",
      count: result.ok ? result.copiedCount : undefined,
    }),
  );
}
