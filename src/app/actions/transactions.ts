"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FinancialFormState } from "@/app/actions/accounts";
import { accountRegisterReconciliationSchema } from "@/domain/account-register";
import { accountIdSchema } from "@/domain/accounts";
import { nextRecurrenceDate } from "@/domain/recurring-transactions";
import {
  transactionFormSchema,
  transactionIdSchema,
} from "@/domain/transactions";
import {
  createCurrentUserTransaction,
  deleteCurrentUserTransaction,
  setCurrentUserAccountEntryReconciled,
  updateCurrentUserTransaction,
} from "@/services/finance/transactions-service";

const transactionInputFrom = (formData: FormData) => ({
  accountId: formData.get("accountId"),
  categoryId: formData.get("categoryId"),
  transactionType: formData.get("transactionType"),
  description: formData.get("description"),
  amountMinor: formData.get("amountMinor"),
  transactionDate: formData.get("transactionDate"),
  status: formData.get("status"),
  notes: formData.get("notes") ?? "",
});

function revalidateFinancialPaths() {
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

function recurringTransactionHref(input: {
  accountId: string;
  categoryId: string;
  transactionType: "income" | "expense";
  description: string;
  amountMinor: number;
  transactionDate: string;
  notes: string | null;
}) {
  const query = new URLSearchParams({
    accountId: input.accountId,
    categoryId: input.categoryId,
    transactionType: input.transactionType,
    description: input.description,
    amountMinor: String(input.amountMinor),
    startDate: input.transactionDate,
    nextOccurrence: nextRecurrenceDate({
      startDate: input.transactionDate,
      currentOccurrence: input.transactionDate,
      frequency: "monthly",
    }),
  });
  if (input.notes) query.set("notes", input.notes);
  return `/recurring-transactions/new?${query.toString()}`;
}

export async function createTransaction(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = transactionFormSchema.safeParse(
    transactionInputFrom(formData),
  );
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await createCurrentUserTransaction(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidateFinancialPaths();
  if (formData.get("createRecurring") === "true") {
    redirect(recurringTransactionHref(parsed.data));
  }
  if (formData.get("returnAccountId") === parsed.data.accountId) {
    revalidatePath(`/accounts/${parsed.data.accountId}`);
    redirect(
      `/accounts/${parsed.data.accountId}?tab=statement&page=1&message=transaction-created#account-register`,
    );
  }
  redirect("/transactions?message=created");
}

export async function updateTransaction(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = transactionFormSchema.safeParse(
    transactionInputFrom(formData),
  );
  const parsedId = transactionIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Lançamento inválido.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }

  const result = await updateCurrentUserTransaction(
    parsedId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidateFinancialPaths();
  if (formData.get("createRecurring") === "true") {
    redirect(recurringTransactionHref(parsed.data));
  }
  redirect("/transactions?message=updated");
}

export async function deleteTransaction(formData: FormData) {
  const parsedId = transactionIdSchema.safeParse(formData.get("id"));
  const parsedAccountId = accountIdSchema.safeParse(
    formData.get("accountId"),
  );
  const rawPage = Number.parseInt(formData.get("page")?.toString() ?? "1", 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  if (!parsedId.success) {
    redirect("/transactions?message=delete-error");
  }

  const result = await deleteCurrentUserTransaction(parsedId.data);
  revalidateFinancialPaths();
  if (parsedAccountId.success) {
    revalidatePath(`/accounts/${parsedAccountId.data}`);
    redirect(
      `/accounts/${parsedAccountId.data}?tab=statement&page=${page}&message=${
        result.ok ? "transaction-deleted" : "transaction-delete-error"
      }#account-register`,
    );
  }
  redirect(`/transactions?message=${result.ok ? "deleted" : "delete-error"}`);
}

export async function toggleAccountEntryReconciliation(formData: FormData) {
  const parsed = accountRegisterReconciliationSchema.safeParse({
    accountId: formData.get("accountId"),
    entryType: formData.get("entryType"),
    entryId: formData.get("entryId"),
    reconciled: formData.get("reconciled"),
    page: formData.get("page"),
  });
  if (!parsed.success) {
    redirect("/accounts?message=reconciliation-error");
  }

  const result = await setCurrentUserAccountEntryReconciled(
    parsed.data.entryType,
    parsed.data.entryId,
    parsed.data.reconciled,
  );
  revalidateFinancialPaths();
  revalidatePath(`/accounts/${parsed.data.accountId}`);
  redirect(
    `/accounts/${parsed.data.accountId}?tab=statement&page=${
      parsed.data.page
    }&message=${
      result.ok ? "reconciliation-updated" : "reconciliation-error"
    }#account-register`,
  );
}
