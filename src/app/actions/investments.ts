"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  investmentCashFlowFormSchema,
  investmentPositionFormSchema,
  investmentPositionIdSchema,
} from "@/domain/investments";
import {
  createCurrentUserInvestmentCashFlow,
  createCurrentUserInvestmentPosition,
  setCurrentUserInvestmentPositionArchived,
  updateCurrentUserInvestmentPosition,
} from "@/services/finance/investments-service";

export type InvestmentFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const positionInputFrom = (formData: FormData) => ({
  id: formData.get("id")?.toString(),
  institution: formData.get("institution"),
  investmentClass: formData.get("investmentClass"),
  assetName: formData.get("assetName"),
  currency: formData.get("currency"),
  quantity: formData.get("quantity"),
  accumulatedCostMinor: formData.get("accumulatedCostMinor"),
  currentValueMinor: formData.get("currentValueMinor"),
  positionDate: formData.get("positionDate"),
  context: formData.get("context"),
  historyIsComplete: formData.get("historyIsComplete") === "true",
  notes: formData.get("notes") ?? "",
});

export async function createInvestmentPosition(
  _previousState: InvestmentFormState,
  formData: FormData,
): Promise<InvestmentFormState> {
  const parsed = investmentPositionFormSchema.safeParse(
    positionInputFrom(formData),
  );
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await createCurrentUserInvestmentPosition(parsed.data);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/investments");
  revalidatePath("/net-worth");
  redirect("/investments?message=created");
}

export async function updateInvestmentPosition(
  _previousState: InvestmentFormState,
  formData: FormData,
): Promise<InvestmentFormState> {
  const parsed = investmentPositionFormSchema.safeParse(
    positionInputFrom(formData),
  );
  const parsedId = investmentPositionIdSchema.safeParse(formData.get("id"));
  if (!parsed.success || !parsedId.success) {
    return {
      status: "error",
      message: parsedId.success ? undefined : "Posição de investimento inválida.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }

  const result = await updateCurrentUserInvestmentPosition(
    parsedId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/investments");
  revalidatePath(`/investments/${parsedId.data}/history`);
  revalidatePath("/net-worth");
  redirect("/investments?message=updated");
}

export async function toggleInvestmentPositionStatus(formData: FormData) {
  const parsedId = investmentPositionIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/investments?message=status-error");

  const archived = formData.get("archive") === "true";
  const result = await setCurrentUserInvestmentPositionArchived(
    parsedId.data,
    archived,
  );
  revalidatePath("/investments");
  revalidatePath("/net-worth");
  redirect(
    `/investments?message=${result.ok ? "status-updated" : "status-error"}`,
  );
}

export async function createInvestmentCashFlow(
  _previousState: InvestmentFormState,
  formData: FormData,
): Promise<InvestmentFormState> {
  const parsed = investmentCashFlowFormSchema.safeParse({
    positionId: formData.get("positionId"),
    cashFlowType: formData.get("cashFlowType"),
    amountMinor: formData.get("amountMinor"),
    quantity: formData.get("quantity") ?? "",
    cashFlowDate: formData.get("cashFlowDate"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await createCurrentUserInvestmentCashFlow(
    parsed.data.positionId,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/investments");
  revalidatePath(`/investments/${parsed.data.positionId}/history`);
  redirect(`/investments/${parsed.data.positionId}/history?message=flow-created`);
}
