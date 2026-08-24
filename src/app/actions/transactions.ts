"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FinancialFormState } from "@/app/actions/accounts";
import { accountRegisterReconciliationSchema } from "@/domain/account-register";
import {
  transactionFormSchema,
  transactionIdSchema,
} from "@/domain/transactions";
import {
  createCurrentUserTransaction,
  setCurrentUserAccountEntryReconciled,
  setCurrentUserTransactionActive,
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
  redirect("/transactions?message=updated");
}

export async function toggleTransactionActivity(formData: FormData) {
  const parsedId = transactionIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) {
    redirect("/transactions?message=status-error");
  }
  const active = formData.get("active") === "true";
  const result = await setCurrentUserTransactionActive(parsedId.data, active);
  revalidateFinancialPaths();
  redirect(
    `/transactions?message=${result.ok ? "status-updated" : "status-error"}`,
  );
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
