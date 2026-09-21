"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  financialGoalContributionSchema,
  financialGoalFormSchema,
} from "@/domain/financial-goals";
import { parseMoneyInputToMinor } from "@/domain/money";
import {
  addCurrentUserGoalContribution,
  createCurrentUserFinancialGoal,
  linkCurrentUserGoalSource,
  unlinkCurrentUserGoalSource,
} from "@/services/finance/financial-goals-service";

export type FinancialGoalFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function money(value: FormDataEntryValue | null) {
  try {
    return parseMoneyInputToMinor(String(value ?? ""));
  } catch {
    return NaN;
  }
}

export async function createFinancialGoal(
  _previousState: FinancialGoalFormState,
  formData: FormData,
): Promise<FinancialGoalFormState> {
  const parsed = financialGoalFormSchema.safeParse({
    name: formData.get("name"),
    goalType: formData.get("goalType"),
    currency: formData.get("currency"),
    targetAmountMinor: money(formData.get("targetAmount")),
    targetDate: formData.get("targetDate"),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  const result = await createCurrentUserFinancialGoal(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/goals");
  redirect(`/goals/${result.id}?message=created`);
}

export async function addGoalContribution(
  _previousState: FinancialGoalFormState,
  formData: FormData,
): Promise<FinancialGoalFormState> {
  const parsed = financialGoalContributionSchema.safeParse({
    goalId: formData.get("goalId"),
    contributionDate: formData.get("contributionDate"),
    amountMinor: money(formData.get("amount")),
    currency: formData.get("currency"),
    description: String(formData.get("description") ?? "").trim() || null,
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  const result = await addCurrentUserGoalContribution(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/goals");
  revalidatePath(`/goals/${parsed.data.goalId}`);
  redirect(`/goals/${parsed.data.goalId}?message=contribution`);
}

export async function linkGoalSource(formData: FormData) {
  const goalId = String(formData.get("goalId") ?? "");
  const sourceType = String(formData.get("sourceType") ?? "") as "account" | "investment" | "financing";
  const sourceId = String(formData.get("sourceId") ?? "");
  const result = await linkCurrentUserGoalSource({ goalId, sourceType, sourceId });
  revalidatePath("/goals");
  revalidatePath(`/goals/${goalId}`);
  redirect(`/goals/${goalId}?message=${result.ok ? "linked" : "link-error"}`);
}

export async function unlinkGoalSource(formData: FormData) {
  const goalId = String(formData.get("goalId") ?? "");
  const linkId = String(formData.get("linkId") ?? "");
  const result = await unlinkCurrentUserGoalSource(linkId);
  revalidatePath("/goals");
  revalidatePath(`/goals/${goalId}`);
  redirect(`/goals/${goalId}?message=${result.ok ? "unlinked" : "link-error"}`);
}
