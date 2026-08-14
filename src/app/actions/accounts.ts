"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  accountFormSchema,
  accountIdSchema,
  archivedAccountDeletionSchema,
} from "@/domain/accounts";
import {
  createCurrentUserAccount,
  deleteCurrentUserArchivedAccount,
  setCurrentUserAccountArchived,
  updateCurrentUserAccount,
} from "@/services/finance/accounts-service";

export type FinancialFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const accountInputFrom = (formData: FormData) => ({
  id: formData.get("id")?.toString(),
  name: formData.get("name"),
  type: formData.get("type"),
  context: formData.get("context"),
  currency: formData.get("currency"),
  openingBalanceMinor: formData.get("openingBalanceMinor"),
  openingBalanceDate: formData.get("openingBalanceDate"),
});

export async function createAccount(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = accountFormSchema.safeParse(accountInputFrom(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await createCurrentUserAccount(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/accounts");
  redirect("/accounts?message=created");
}

export async function updateAccount(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = accountFormSchema.safeParse(accountInputFrom(formData));
  const parsedId = accountIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Conta inválida.",
      fieldErrors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
    };
  }

  const result = await updateCurrentUserAccount(parsedId.data, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/accounts");
  redirect("/accounts?message=updated");
}

export async function toggleAccountStatus(formData: FormData) {
  const parsedId = accountIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/accounts?message=status-error");
  const shouldArchive = formData.get("archive") === "true";
  const result = await setCurrentUserAccountArchived(parsedId.data, shouldArchive);
  revalidatePath("/accounts");
  redirect(`/accounts?message=${result.ok ? "status-updated" : "status-error"}`);
}

export async function deleteArchivedAccount(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = archivedAccountDeletionSchema.safeParse({
    id: formData.get("id"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await deleteCurrentUserArchivedAccount(parsed.data.id);
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/transfers");
  revalidatePath("/recurring-transactions");
  revalidatePath("/imports");
  redirect("/accounts?status=all&message=deleted");
}
