"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  csvImportConfigSchema,
  importFileTypeSchema,
  importJobIdSchema,
  importRowCorrectionSchema,
  importRowIdSchema,
} from "@/domain/file-imports";
import {
  cancelCurrentUserImport,
  clearCurrentUserCancelledImports,
  configureCurrentUserImport,
  confirmCurrentUserImport,
  createCurrentUserImport,
  setCurrentUserImportRowIgnored,
  updateCurrentUserImportRow,
} from "@/services/finance/file-imports-service";

export type FileImportFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function csvConfigFrom(formData: FormData) {
  const rawDelimiter = formData.get("delimiter");
  return {
    delimiter: rawDelimiter === "tab" ? "\t" : rawDelimiter,
    hasHeader: formData.get("hasHeader") === "true",
    skipRows: formData.get("skipRows"),
    dateColumn: formData.get("dateColumn"),
    descriptionColumn: formData.get("descriptionColumn"),
    amountColumn: formData.get("amountColumn"),
    dateFormat: formData.get("dateFormat"),
    decimalSeparator: formData.get("decimalSeparator"),
    invertAmountSign: formData.get("invertAmountSign") === "true",
  };
}

export async function uploadFinancialFile(
  _previousState: FileImportFormState,
  formData: FormData,
): Promise<FileImportFormState> {
  const fileType = importFileTypeSchema.safeParse(formData.get("fileType"));
  if (!fileType.success) {
    return {
      status: "error",
      fieldErrors: { fileType: [fileType.error.issues[0].message] },
    };
  }

  const csvConfig =
    fileType.data === "csv" && formData.get("csvMode") === "manual"
      ? csvImportConfigSchema.safeParse(csvConfigFrom(formData))
      : null;
  if (csvConfig && !csvConfig.success) {
    return {
      status: "error",
      fieldErrors: csvConfig.error.flatten().fieldErrors,
    };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      status: "error",
      fieldErrors: { file: ["Selecione um arquivo CSV, OFX ou PDF."] },
    };
  }

  const result = await createCurrentUserImport({
    file,
    fileType: fileType.data,
    csvConfig: csvConfig?.success ? csvConfig.data : null,
  });
  if (!result.ok) return { status: "error", message: result.message };
  redirect(`/imports/${result.id}?message=uploaded`);
}

export async function configureFinancialImport(formData: FormData) {
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  const accountId = importJobIdSchema.safeParse(formData.get("accountId"));
  if (!jobId.success || !accountId.success) {
    redirect("/imports?message=configuration-error");
  }

  const result = await configureCurrentUserImport(jobId.data, accountId.data);
  revalidatePath(`/imports/${jobId.data}`);
  redirect(
    `/imports/${jobId.data}?message=${
      result.ok ? "account-updated" : "configuration-error"
    }`,
  );
}

export async function correctFinancialImportRow(formData: FormData) {
  const parsed = importRowCorrectionSchema.safeParse({
    rowId: formData.get("rowId"),
    transactionDate: formData.get("transactionDate"),
    description: formData.get("description"),
    signedAmountMinor: formData.get("signedAmountMinor"),
    categoryId: formData.get("categoryId"),
  });
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  if (!parsed.success || !jobId.success) {
    redirect(
      `/imports/${jobId.success ? jobId.data : ""}?message=row-error`,
    );
  }

  const result = await updateCurrentUserImportRow(parsed.data.rowId, {
    transactionDate: parsed.data.transactionDate,
    description: parsed.data.description,
    signedAmountMinor: parsed.data.signedAmountMinor,
    categoryId: parsed.data.categoryId,
  });
  revalidatePath(`/imports/${jobId.data}`);
  redirect(
    `/imports/${jobId.data}?message=${result.ok ? "row-updated" : "row-error"}`,
  );
}

export async function toggleFinancialImportRow(formData: FormData) {
  const rowId = importRowIdSchema.safeParse(formData.get("rowId"));
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  if (!rowId.success || !jobId.success) {
    redirect("/imports?message=row-error");
  }

  const ignored = formData.get("ignored") === "true";
  const result = await setCurrentUserImportRowIgnored(rowId.data, ignored);
  revalidatePath(`/imports/${jobId.data}`);
  redirect(
    `/imports/${jobId.data}?message=${result.ok ? "selection-updated" : "row-error"}`,
  );
}

export async function confirmFinancialImport(formData: FormData) {
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  if (!jobId.success) redirect("/imports?message=confirmation-error");

  const result = await confirmCurrentUserImport(jobId.data);
  revalidatePath("/imports");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  redirect(
    `/imports/${jobId.data}?message=${
      result.ok ? "confirmed" : "confirmation-error"
    }`,
  );
}

export async function cancelFinancialImport(formData: FormData) {
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  if (!jobId.success) redirect("/imports?message=cancel-error");

  const result = await cancelCurrentUserImport(jobId.data);
  revalidatePath("/imports");
  redirect(
    `/imports?message=${result.ok ? "cancelled" : "cancel-error"}`,
  );
}

export async function clearCancelledFinancialImports() {
  const result = await clearCurrentUserCancelledImports();
  revalidatePath("/imports");
  redirect(
    `/imports?message=${result.ok ? "cancelled-cleared" : "clear-error"}`,
  );
}
