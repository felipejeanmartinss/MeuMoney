"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FinancialFormState } from "@/app/actions/accounts";
import { isValidIsoDate } from "@/domain/dates";
import { parseMoneyInputToMinor } from "@/domain/money";
import {
  recurringGenerationDateSchema,
  recurringGenerationReviewSchema,
  recurringTransactionFormSchema,
  recurringTransferFormSchema,
  recurringTransactionIdSchema,
  recurringTransactionStateSchema,
} from "@/domain/recurring-transactions";
import {
  createCurrentUserRecurringTransaction,
  generateCurrentUserRecurringTransactions,
  generateCurrentUserSingleRecurringTransaction,
  setCurrentUserRecurringTransactionState,
  updateCurrentUserRecurringTransaction,
} from "@/services/finance/recurring-transactions-service";
import {
  generateCurrentUserSingleRecurringTransfer,
  saveCurrentUserRecurringTransfer,
  setCurrentUserRecurringTransferState,
} from "@/services/finance/recurring-transfers-service";

const recurringInputFrom = (formData: FormData) => ({
  accountId: formData.get("accountId"),
  categoryId: formData.get("categoryId"),
  transactionType: formData.get("transactionType"),
  description: formData.get("description"),
  amountMinor: formData.get("amountMinor"),
  isAmountFixed: formData.get("isAmountFixed") !== "false",
  isSubscription: formData.get("isSubscription") === "true",
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

  const reviewIds = formData.getAll("reviewRecurringId");
  const scheduledDates = formData.getAll("reviewScheduledDate");
  const transactionDates = formData.getAll("reviewTransactionDate");
  const reviewAmounts = formData.getAll("reviewAmountMinor");
  if (
    reviewIds.length !== scheduledDates.length ||
    reviewIds.length !== transactionDates.length ||
    reviewIds.length !== reviewAmounts.length
  ) {
    redirect("/recurring-transactions?message=generation-error");
  }

  const reviews = reviewIds.flatMap((recurringId, index) => {
    if (String(scheduledDates[index]) > parsedDate.data) return [];
    const parsed = recurringGenerationReviewSchema.safeParse({
      recurringId,
      scheduledDate: scheduledDates[index],
      transactionDate: transactionDates[index],
      amountMinor: reviewAmounts[index],
    });
    return parsed.success ? [parsed.data] : [];
  });
  const eligibleReviewCount = scheduledDates.filter(
    (date) => String(date) <= parsedDate.data,
  ).length;
  if (reviews.length !== eligibleReviewCount) {
    redirect("/recurring-transactions?message=generation-error");
  }

  const result = await generateCurrentUserRecurringTransactions(
    parsedDate.data,
    reviews,
  );
  revalidateRecurringPaths();
  redirect(
    result.ok
      ? `/recurring-transactions?message=generated&count=${result.generatedCount}`
      : "/recurring-transactions?message=generation-error",
  );
}

export async function generateSingleRecurringTransaction(formData: FormData) {
  const parsedId = recurringTransactionIdSchema.safeParse(formData.get("id"));
  const date = String(formData.get("transactionDate") ?? "");
  let amountMinor = 0;
  try {
    amountMinor = parseMoneyInputToMinor(String(formData.get("amount") ?? ""));
  } catch {
    redirect("/recurring-transactions?message=generation-error");
  }
  if (!parsedId.success || !isValidIsoDate(date) || amountMinor <= 0) {
    redirect("/recurring-transactions?message=generation-error");
  }
  const result = await generateCurrentUserSingleRecurringTransaction(
    parsedId.data, date, amountMinor,
  );
  revalidateRecurringPaths();
  redirect(`/recurring-transactions?message=${result.ok ? "single-generated" : "generation-error"}`);
}

export async function saveRecurringTransfer(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = recurringTransferFormSchema.safeParse({
    sourceAccountId: formData.get("sourceAccountId"),
    destinationAccountId: formData.get("destinationAccountId"),
    description: formData.get("description"),
    amountMinor: formData.get("amountMinor"),
    destinationAmountMinor: formData.get("destinationAmountMinor"),
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    nextOccurrence: formData.get("nextOccurrence"),
    endDate: formData.get("endDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
  const rawId = String(formData.get("id") ?? "");
  const parsedId = rawId ? recurringTransactionIdSchema.safeParse(rawId) : null;
  if (!parsed.success || (parsedId && !parsedId.success)) return {
    status: "error",
    message: parsedId && !parsedId.success ? "Recorrência inválida." : undefined,
    fieldErrors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
  };
  const result = await saveCurrentUserRecurringTransfer(
    parsed.data, parsedId?.success ? parsedId.data : undefined,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidateRecurringPaths();
  redirect("/recurring-transactions?message=transfer-saved");
}

export async function changeRecurringTransferState(formData: FormData) {
  const id = recurringTransactionIdSchema.safeParse(formData.get("id"));
  const state = recurringTransactionStateSchema.safeParse(formData.get("state"));
  if (!id.success || !state.success) redirect("/recurring-transactions?message=status-error");
  const result = await setCurrentUserRecurringTransferState(id.data, state.data);
  revalidateRecurringPaths();
  redirect(`/recurring-transactions?message=${result.ok ? "state-" + state.data : "status-error"}`);
}

export async function generateSingleRecurringTransfer(formData: FormData) {
  const id = recurringTransactionIdSchema.safeParse(formData.get("id"));
  const date = String(formData.get("transactionDate") ?? "");
  let amount = 0;
  let destinationAmount = 0;
  try {
    amount = parseMoneyInputToMinor(String(formData.get("amount") ?? ""));
    destinationAmount = parseMoneyInputToMinor(String(formData.get("destinationAmount") ?? ""));
  } catch {
    redirect("/recurring-transactions?message=generation-error");
  }
  if (!id.success || !isValidIsoDate(date) || amount <= 0 || destinationAmount <= 0) {
    redirect("/recurring-transactions?message=generation-error");
  }
  const result = await generateCurrentUserSingleRecurringTransfer(
    id.data, date, amount, destinationAmount,
  );
  revalidateRecurringPaths();
  redirect(`/recurring-transactions?message=${result.ok ? "transfer-generated" : "generation-error"}`);
}
