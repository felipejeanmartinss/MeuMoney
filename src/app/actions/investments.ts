"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  investmentAccountEntryFormSchema,
  investmentCashFlowIdSchema,
  investmentCashFlowFormSchema,
  investmentPositionFormSchema,
  investmentPositionIdSchema,
  investmentPositionSnapshotIdSchema,
  investmentTransferLinkFormSchema,
} from "@/domain/investments";
import {
  createCurrentUserInvestmentAccountEntry,
  createCurrentUserInvestmentCashFlow,
  createCurrentUserInvestmentPosition,
  deleteCurrentUserInvestmentCashFlow,
  deleteCurrentUserInvestmentPosition,
  deleteCurrentUserInvestmentPositionSnapshot,
  linkCurrentUserInvestmentTransferEntry,
  setCurrentUserInvestmentPositionArchived,
  updateCurrentUserInvestmentPosition,
} from "@/services/finance/investments-service";
import { accountIdSchema } from "@/domain/accounts";

export type InvestmentFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const positionInputFrom = (formData: FormData) => ({
  id: formData.get("id")?.toString(),
  institution: formData.get("institution"),
  investmentClass: formData.get("investmentClass"),
  investmentType: formData.get("investmentType"),
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

export async function deleteInvestmentCashFlow(formData: FormData) {
  const parsedId = investmentCashFlowIdSchema.safeParse(
    formData.get("cashFlowId"),
  );
  const accountId = accountIdSchema.safeParse(formData.get("accountId"));
  const page = Math.max(
    1,
    Number.parseInt(String(formData.get("page") ?? "1"), 10) || 1,
  );
  if (!parsedId.success) {
    if (accountId.success) {
      redirect(
        `/accounts/${accountId.data}?tab=statement&page=${page}&message=investment-flow-delete-error#account-register`,
      );
    }
    redirect("/investments?message=flow-delete-error");
  }

  const result = await deleteCurrentUserInvestmentCashFlow(parsedId.data);
  revalidatePath("/accounts");
  revalidatePath("/investments");
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  if (result.ok) {
    revalidatePath(`/investments/${result.positionId}/history`);
  }
  if (accountId.success) {
    revalidatePath(`/accounts/${accountId.data}`);
    redirect(
      `/accounts/${accountId.data}?tab=statement&page=${page}&message=${result.ok ? "investment-flow-deleted" : "investment-flow-delete-error"}#account-register`,
    );
  }
  redirect(
    `/investments/${result.ok ? result.positionId : String(formData.get("positionId") ?? "")}/history?message=${result.ok ? "flow-deleted" : "flow-delete-error"}`,
  );
}

export async function deleteInvestmentPositionSnapshot(formData: FormData) {
  const snapshotId = investmentPositionSnapshotIdSchema.safeParse(
    formData.get("snapshotId"),
  );
  const positionId = investmentPositionIdSchema.safeParse(
    formData.get("positionId"),
  );
  if (!snapshotId.success || !positionId.success) {
    redirect("/investments?message=snapshot-delete-error");
  }

  const result = await deleteCurrentUserInvestmentPositionSnapshot(
    snapshotId.data,
  );
  revalidatePath("/investments");
  revalidatePath(`/investments/${positionId.data}/history`);
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  redirect(
    `/investments/${positionId.data}/history?message=${result.ok ? "snapshot-deleted" : "snapshot-delete-error"}`,
  );
}

export async function deleteInvestmentPosition(formData: FormData) {
  const parsedId = investmentPositionIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/investments?message=delete-error");

  const result = await deleteCurrentUserInvestmentPosition(parsedId.data);
  revalidatePath("/accounts");
  revalidatePath("/investments");
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  redirect(`/investments?message=${result.ok ? "deleted" : "delete-error"}`);
}

export async function createInvestmentAccountEntry(
  _previousState: InvestmentFormState,
  formData: FormData,
): Promise<InvestmentFormState> {
  const parsed = investmentAccountEntryFormSchema.safeParse({
    accountId: formData.get("accountId"),
    positionId: formData.get("positionId"),
    eventType: formData.get("eventType"),
    description: formData.get("description"),
    amountMinor: formData.get("amountMinor"),
    quantity: formData.get("quantity") ?? "",
    transactionDate: formData.get("transactionDate"),
    notes: formData.get("notes") ?? "",
    newInstitution: formData.get("newInstitution") ?? "",
    newInvestmentClass: formData.get("newInvestmentClass") || undefined,
    newInvestmentType: formData.get("newInvestmentType") || undefined,
    newAssetName: formData.get("newAssetName") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await createCurrentUserInvestmentAccountEntry({
    accountId: parsed.data.accountId,
    positionId:
      parsed.data.positionId === "new" ? null : parsed.data.positionId,
    eventType: parsed.data.eventType,
    description: parsed.data.description,
    amountMinor: parsed.data.amountMinor,
    quantity: parsed.data.quantity,
    transactionDate: parsed.data.transactionDate,
    notes: parsed.data.notes,
    newPosition:
      parsed.data.positionId === "new"
        ? {
            institution: parsed.data.newInstitution,
            investmentClass: parsed.data.newInvestmentClass!,
            investmentType: parsed.data.newInvestmentType!,
            assetName: parsed.data.newAssetName,
          }
        : null,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${parsed.data.accountId}`);
  revalidatePath("/investments");
  if (parsed.data.positionId !== "new") {
    revalidatePath(`/investments/${parsed.data.positionId}/history`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  if (formData.get("returnAccountId") === parsed.data.accountId) {
    redirect(
      `/accounts/${parsed.data.accountId}?tab=statement&page=1&message=investment-recorded#account-register`,
    );
  }
  redirect(`/accounts/${parsed.data.accountId}?message=investment-recorded`);
}

export async function linkInvestmentTransferEntry(
  _previousState: InvestmentFormState,
  formData: FormData,
): Promise<InvestmentFormState> {
  const parsed = investmentTransferLinkFormSchema.safeParse({
    accountId: formData.get("accountId"),
    transferEntryId: formData.get("transferEntryId"),
    positionId: formData.get("positionId"),
    eventType: formData.get("eventType"),
    quantity: formData.get("quantity") ?? "",
    notes: formData.get("notes") ?? "",
    newInstitution: formData.get("newInstitution") ?? "",
    newInvestmentClass: formData.get("newInvestmentClass") || undefined,
    newInvestmentType: formData.get("newInvestmentType") || undefined,
    newAssetName: formData.get("newAssetName") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const result = await linkCurrentUserInvestmentTransferEntry({
    accountId: parsed.data.accountId,
    transferEntryId: parsed.data.transferEntryId,
    positionId:
      parsed.data.positionId === "new" ? null : parsed.data.positionId,
    eventType: parsed.data.eventType,
    quantity: parsed.data.quantity,
    notes: parsed.data.notes,
    newPosition:
      parsed.data.positionId === "new"
        ? {
            institution: parsed.data.newInstitution,
            investmentClass: parsed.data.newInvestmentClass!,
            investmentType: parsed.data.newInvestmentType!,
            assetName: parsed.data.newAssetName,
          }
        : null,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${parsed.data.accountId}`);
  revalidatePath("/investments");
  revalidatePath("/investments/movements");
  if (parsed.data.positionId !== "new") {
    revalidatePath(`/investments/${parsed.data.positionId}/history`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/reports");

  const returnPage = Number.parseInt(
    String(formData.get("returnPage") ?? "1"),
    10,
  );
  if (formData.get("returnAccountId") === parsed.data.accountId) {
    redirect(
      `/accounts/${parsed.data.accountId}?tab=statement&page=${Number.isFinite(returnPage) && returnPage > 0 ? returnPage : 1}&message=investment-linked#account-register`,
    );
  }
  redirect("/investments/movements?message=linked");
}
