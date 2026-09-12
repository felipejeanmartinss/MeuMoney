"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  recurringGenerationDateSchema,
  recurringTransactionFormSchema,
  recurringTransactionIdSchema,
  recurringTransactionStateSchema,
} from "@/domain/recurring-transactions";
import {
  createCurrentUserRecurringTransaction,
  generateCurrentUserRecurringTransactions,
  setCurrentUserRecurringTransactionState,
  updateCurrentUserRecurringTransaction,
} from "@/services/finance/recurring-transactions-service";

const recurringInputFrom = (formData: FormData) => ({
  accountId: formData.get("accountId"),
  categoryId: formData.get("categoryId"),
  transactionType: formData.get("transactionType"),
  description: formData.get("description"),
  amountMinor: formData.get("amountMinor"),
  frequency: formData.get("frequency"),
  startDate: formData.get("startDate"),
  endDate: formData.get("endDate") ?? "",
  nextOccurrence: formData.get("nextOccurrence"),
  notes: formData.get("notes") ?? "",
});

function revalidateRecurringPaths() {
  revalidatePath("/recurring-transactions");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function createRecurringTransaction(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = recurringTransactionFormSchema.safeParse(
    recurringInputFrom(formData),
  );
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await createCurrentUserRecurringTransaction(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidateRecurringPaths();
  redirect("/recurring-transactions?message=created");
}

export async function updateRecurringTransaction(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = recurringTransactionFormSchema.safeParse(
    recurringInputFrom(formData),
  );
  const parsedId = recurringTransactionIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Recorrência inválida.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }

  const result = await updateCurrentUserRecurringTransaction(
    parsedId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidateRecurringPaths();
  redirect("/recurring-transactions?message=updated");
}

export async function changeRecurringTransactionState(formData: FormData) {
  const parsedId = recurringTransactionIdSchema.safeParse(formData.get("id"));
  const parsedState = recurringTransactionStateSchema.safeParse(
    formData.get("state"),
  );
  if (!parsedId.success || !parsedState.success) {
    redirect("/recurring-transactions?message=status-error");
  }

  const result = await setCurrentUserRecurringTransactionState(
    parsedId.data,
    parsedState.data,
  );
  revalidateRecurringPaths();
  redirect(
    `/recurring-transactions?message=${
      result.ok ? `state-${parsedState.data}` : "status-error"
    }`,
  );
}

export async function generateRecurringTransactions(formData: FormData) {
  const parsedDate = recurringGenerationDateSchema.safeParse(
    formData.get("targetUntil"),
  );
  if (!parsedDate.success) {
    redirect("/recurring-transactions?message=generation-error");
  }

  const result = await generateCurrentUserRecurringTransactions(
    parsedDate.data,
  );
  revalidateRecurringPaths();
  redirect(
    result.ok
      ? `/recurring-transactions?message=generated&count=${result.generatedCount}`
      : "/recurring-transactions?message=generation-error",
  );
}
