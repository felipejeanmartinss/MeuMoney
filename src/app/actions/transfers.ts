"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FinancialFormState } from "@/app/actions/accounts";
import { transferFormSchema, transferIdSchema } from "@/domain/transfers";
import {
  createCurrentUserTransfer,
  setCurrentUserTransferActive,
  updateCurrentUserTransfer,
} from "@/services/finance/transfers-service";

const transferInputFrom = (formData: FormData) => ({
  sourceAccountId: formData.get("sourceAccountId"),
  destinationAccountId: formData.get("destinationAccountId"),
  amountMinor: formData.get("amountMinor"),
  transactionDate: formData.get("transactionDate"),
  status: formData.get("status"),
  description: formData.get("description") ?? "",
  notes: formData.get("notes") ?? "",
});

function revalidateFinancialPaths() {
  revalidatePath("/transfers");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function createTransfer(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = transferFormSchema.safeParse(transferInputFrom(formData));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await createCurrentUserTransfer(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidateFinancialPaths();
  redirect("/transfers?message=created");
}

export async function updateTransfer(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const parsed = transferFormSchema.safeParse(transferInputFrom(formData));
  const parsedId = transferIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Transferência inválida.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }

  const result = await updateCurrentUserTransfer(parsedId.data, parsed.data);
  if (!result.ok) return { status: "error", message: result.message };
  revalidateFinancialPaths();
  redirect("/transfers?message=updated");
}

export async function toggleTransferActivity(formData: FormData) {
  const parsedId = transferIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/transfers?message=status-error");
  const active = formData.get("active") === "true";
  const result = await setCurrentUserTransferActive(parsedId.data, active);
  revalidateFinancialPaths();
  redirect(
    `/transfers?message=${result.ok ? "status-updated" : "status-error"}`,
  );
}
