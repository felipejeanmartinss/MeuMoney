"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  financingImportConfirmationSchema,
  financingImportJobIdSchema,
} from "@/domain/financing-imports";
import {
  cancelCurrentUserFinancingImport,
  confirmCurrentUserFinancingImport,
  createCurrentUserFinancingImport,
} from "@/services/finance/financing-imports-service";

export type FinancingImportFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function uploadFinancingPdf(
  _previousState: FinancingImportFormState,
  formData: FormData,
): Promise<FinancingImportFormState> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      status: "error",
      fieldErrors: { file: ["Selecione o extrato financeiro em PDF."] },
    };
  }

  const result = await createCurrentUserFinancingImport(file);
  if (!result.ok) return { status: "error", message: result.message };
  redirect(`/investments/financing-imports/${result.id}`);
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
