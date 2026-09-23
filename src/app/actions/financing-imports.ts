"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  financingImportConfirmationSchema,
  financingImportJobIdSchema,
  manualFinancingContractSchema,
} from "@/domain/financing-imports";
import {
  cancelCurrentUserFinancingImport,
  confirmCurrentUserFinancingImport,
  createCurrentUserManualFinancingContract,
} from "@/services/finance/financing-imports-service";

export type FinancingImportFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function uploadFinancingPdf(): Promise<FinancingImportFormState> {
  return { status: "error", message: "A importação bancária foi descontinuada. Use o cadastro e a edição do fluxo de parcelas." };
}

export async function confirmFinancingImport(
  _previousState: FinancingImportFormState,
  formData: FormData,
): Promise<FinancingImportFormState> {
  const jobId = financingImportJobIdSchema.safeParse(formData.get("jobId"));
  const parsed = financingImportConfirmationSchema.safeParse({
    name: formData.get("name"),
    productType: formData.get("productType"),
    context: formData.get("context"),
  });
  if (!jobId.success || !parsed.success) {
    return {
      status: "error",
      message: jobId.success ? undefined : "Importação inválida.",
      fieldErrors: parsed.success
        ? undefined
        : parsed.error.flatten().fieldErrors,
    };
  }

  const result = await confirmCurrentUserFinancingImport(
    jobId.data,
    parsed.data,
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/investments");
  revalidatePath("/net-worth");
  redirect(`/investments/financings/${result.contractId}?message=imported`);
}

export async function cancelFinancingImport(formData: FormData) {
  const jobId = financingImportJobIdSchema.safeParse(formData.get("jobId"));
  if (!jobId.success) redirect("/investments?tab=financing&message=import-error");

  const result = await cancelCurrentUserFinancingImport(jobId.data);
  redirect(
    `/investments?tab=financing&message=${
      result.ok ? "import-cancelled" : "import-error"
    }`,
  );
}

export async function createManualFinancingContract(
  _previousState: FinancingImportFormState,
  formData: FormData,
): Promise<FinancingImportFormState> {
  const parsed = manualFinancingContractSchema.safeParse({
    name: formData.get("name"),
    institution: formData.get("institution"),
    contractReference: formData.get("contractReference"),
    productType: formData.get("productType"),
    context: formData.get("context"),
    currency: formData.get("currency"),
    amortizationSystem: formData.get("amortizationSystem"),
    indexer: formData.get("indexer") ?? "",
    originalPrincipalMinor: formData.get("originalPrincipalMinor"),
    originalTermMonths: formData.get("originalTermMonths"),
    contractDate: formData.get("contractDate"),
    releaseDate: formData.get("releaseDate") ?? "",
    currentBalanceMinor: formData.get("currentBalanceMinor"),
    balanceDate: formData.get("balanceDate"),
    nominalAnnualRate: formData.get("nominalAnnualRate") ?? "",
    effectiveAnnualRate: formData.get("effectiveAnnualRate") ?? "",
    cetAnnualRate: formData.get("cetAnnualRate") ?? "",
    schedule: formData.get("schedule"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Revise os dados do contrato e a tabela de parcelas.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const contractId = formData.get("contractId");
  const expectedUpdatedAt = formData.get("expectedUpdatedAt");
  if (contractId && (!z.uuid().safeParse(contractId).success || !z.iso.datetime({ offset: true }).safeParse(expectedUpdatedAt).success)) {
    return { status: "error", message: "Contrato inválido. Reabra a página." };
  }
  const result = await createCurrentUserManualFinancingContract(parsed.data, contractId ? String(contractId) : null, contractId ? String(expectedUpdatedAt) : null);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/investments");
  revalidatePath("/net-worth");
  revalidatePath(`/investments/financings/${result.contractId}`);
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  redirect(`/investments/financings/${result.contractId}?message=${contractId ? "updated" : "created"}`);
}
