"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FinancialFormState } from "@/app/actions/accounts";
import {
  accountTransferDestinationValue,
  creditCardTransferFormSchema,
  parseTransferDestinationTarget,
  transferFormSchema,
  transferIdSchema,
} from "@/domain/transfers";
import {
  createCurrentUserCreditCardTransfer,
  createCurrentUserTransfer,
  setCurrentUserTransferActive,
  updateCurrentUserCreditCardTransfer,
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
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/credit-cards");
  revalidatePath("/dashboard");
}

export async function createTransfer(
  _previousState: FinancialFormState,
  formData: FormData,
): Promise<FinancialFormState> {
  const fallbackAccountId = formData.get("destinationAccountId");
  const destination = parseTransferDestinationTarget(
    formData.get("destinationTarget") ??
      (typeof fallbackAccountId === "string"
        ? accountTransferDestinationValue(fallbackAccountId)
        : null),
  );
  if (!destination) {
    return {
      status: "error",
      fieldErrors: {
        destinationTarget: ["Selecione uma conta ou cartão válido."],
      },
    };
  }

  if (destination.kind === "credit_card") {
    const parsedCardTransfer = creditCardTransferFormSchema.safeParse({
      ...transferInputFrom(formData),
      destinationCreditCardId: destination.id,
    });
    if (!parsedCardTransfer.success) {
      return {
        status: "error",
        fieldErrors: parsedCardTransfer.error.flatten().fieldErrors,
      };
    }

    const result = await createCurrentUserCreditCardTransfer(
      parsedCardTransfer.data,
    );
    if (!result.ok) return { status: "error", message: result.message };
    revalidateFinancialPaths();
    redirect("/transfers?message=created");
  }

  const parsed = transferFormSchema.safeParse({
    ...transferInputFrom(formData),
    destinationAccountId: destination.id,
  });
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
  const parsedId = transferIdSchema.safeParse(formData.get("id"));
  const fallbackAccountId = formData.get("destinationAccountId");
  const destination = parseTransferDestinationTarget(
    formData.get("destinationTarget") ??
      (typeof fallbackAccountId === "string"
        ? accountTransferDestinationValue(fallbackAccountId)
        : null),
  );
  if (!parsedId.success || !destination) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Transferência inválida.",
      fieldErrors: destination
        ? undefined
        : { destinationTarget: ["Selecione uma conta ou cartão válido."] },
    };
  }

  const rawInput = transferInputFrom(formData);
  let result;
  if (destination.kind === "account") {
    const parsed = transferFormSchema.safeParse({
      ...rawInput,
      destinationAccountId: destination.id,
    });
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    result = await updateCurrentUserTransfer(parsedId.data, parsed.data);
  } else {
    const parsed = creditCardTransferFormSchema.safeParse({
      ...rawInput,
      destinationCreditCardId: destination.id,
    });
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }
    result = await updateCurrentUserCreditCardTransfer(
      parsedId.data,
      parsed.data,
    );
  }
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
