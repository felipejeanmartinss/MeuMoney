"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  csvImportConfigSchema,
  importFileTypeSchema,
  importClassificationCorrectionSchema,
  importJobIdSchema,
  importRowCorrectionSchema,
  importRowIdSchema,
  importTransferRowCorrectionSchema,
  qifCategoryMappingSchema,
  qifTransferAccountMappingSchema,
} from "@/domain/file-imports";
import {
  cancelCurrentUserImport,
  clearCurrentUserCancelledImports,
  configureCurrentUserImport,
  confirmCurrentUserImport,
  createCurrentUserImport,
  mapCurrentUserQifCategory,
  mapCurrentUserQifTransferAccount,
  setCurrentUserImportRowIgnored,
  updateCurrentUserImportCreditCardTransferRow,
  updateCurrentUserImportRow,
  updateCurrentUserImportTransferRow,
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
  const rawAccountId = formData.get("accountId");
  const accountId =
    typeof rawAccountId === "string" && rawAccountId
      ? importJobIdSchema.safeParse(rawAccountId)
      : null;
  if (accountId && !accountId.success) {
    return {
      status: "error",
      fieldErrors: { accountId: ["Selecione uma conta válida."] },
    };
  }

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
      fieldErrors: { file: ["Selecione um arquivo CSV, OFX, QIF ou PDF."] },
    };
  }

  const result = await createCurrentUserImport({
    file,
    fileType: fileType.data,
    csvConfig: csvConfig?.success ? csvConfig.data : null,
  });
  if (!result.ok) return { status: "error", message: result.message };
  if (accountId?.success) {
    const configuration = await configureCurrentUserImport(
      result.id,
      accountId.data,
    );
    if (!configuration.ok) {
      return {
        status: "error",
        message:
          "O arquivo foi preparado, mas a conta não pôde ser associada. Abra o histórico de importações para continuar a revisão.",
      };
    }
  }
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
  const page = Math.max(1, Number(formData.get("page")) || 1);
  if (!parsed.success || !jobId.success) {
    redirect(
      `/imports/${jobId.success ? jobId.data : ""}?message=row-error&page=${page}`,
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
    `/imports/${jobId.data}?message=${result.ok ? "row-updated" : "row-error"}&page=${page}`,
  );
}

export async function correctFinancialImportTransferRow(formData: FormData) {
  const parsed = importTransferRowCorrectionSchema.safeParse({
    rowId: formData.get("rowId"),
    transactionDate: formData.get("transactionDate"),
    description: formData.get("description"),
    signedAmountMinor: formData.get("signedAmountMinor"),
    transferAccountId: formData.get("transferAccountId"),
  });
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  const page = Math.max(1, Number(formData.get("page")) || 1);
  if (!parsed.success || !jobId.success) {
    redirect(
      `/imports/${jobId.success ? jobId.data : ""}?message=row-error&page=${page}`,
    );
  }

  const result = await updateCurrentUserImportTransferRow(
    parsed.data.rowId,
    {
      transactionDate: parsed.data.transactionDate,
      description: parsed.data.description,
      signedAmountMinor: parsed.data.signedAmountMinor,
      transferAccountId: parsed.data.transferAccountId,
    },
  );
  revalidatePath(`/imports/${jobId.data}`);
  redirect(
    `/imports/${jobId.data}?message=${result.ok ? "row-updated" : "row-error"}&page=${page}`,
  );
}

export async function correctFinancialImportClassification(formData: FormData) {
  const parsed = importClassificationCorrectionSchema.safeParse({
    rowId: formData.get("rowId"),
    transactionDate: formData.get("transactionDate"),
    description: formData.get("description"),
    signedAmountMinor: formData.get("signedAmountMinor"),
    classification: formData.get("classification"),
  });
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  const page = Math.max(1, Number(formData.get("page")) || 1);
  if (!parsed.success || !jobId.success) {
    redirect(
      `/imports/${jobId.success ? jobId.data : ""}?message=row-error&page=${page}`,
    );
  }

  const commonInput = {
    transactionDate: parsed.data.transactionDate,
    description: parsed.data.description,
    signedAmountMinor: parsed.data.signedAmountMinor,
  };
  let result;
  if (parsed.data.classification.kind === "transfer") {
    result = await updateCurrentUserImportTransferRow(parsed.data.rowId, {
      ...commonInput,
      transferAccountId: parsed.data.classification.id,
    });
  } else if (parsed.data.classification.kind === "credit-card") {
    result = await updateCurrentUserImportCreditCardTransferRow(
      parsed.data.rowId,
      {
        ...commonInput,
        creditCardId: parsed.data.classification.id,
      },
    );
  } else {
    result = await updateCurrentUserImportRow(parsed.data.rowId, {
      ...commonInput,
      categoryId: parsed.data.classification.id,
    });
  }
  revalidatePath(`/imports/${jobId.data}`);
  redirect(
    `/imports/${jobId.data}?message=${result.ok ? "row-updated" : "row-error"}&page=${page}`,
  );
}

export async function mapFinancialImportQifCategory(formData: FormData) {
  const parsed = qifCategoryMappingSchema.safeParse({
    jobId: formData.get("jobId"),
    sourceCategoryName: formData.get("sourceCategoryName"),
    transactionType: formData.get("transactionType"),
    categoryId: formData.get("categoryId"),
  });
  const page = Math.max(1, Number(formData.get("page")) || 1);
  if (!parsed.success) redirect("/imports?message=row-error");

  const result = await mapCurrentUserQifCategory(
    parsed.data.jobId,
    parsed.data.sourceCategoryName,
    parsed.data.transactionType,
    parsed.data.categoryId,
  );
  revalidatePath(`/imports/${parsed.data.jobId}`);
  redirect(
    `/imports/${parsed.data.jobId}?message=${result.ok ? "mapping-updated" : "row-error"}&page=${page}`,
  );
}

export async function mapFinancialImportQifTransferAccount(
  formData: FormData,
) {
  const parsed = qifTransferAccountMappingSchema.safeParse({
    jobId: formData.get("jobId"),
    sourceAccountName: formData.get("sourceAccountName"),
    accountId: formData.get("accountId"),
  });
  const page = Math.max(1, Number(formData.get("page")) || 1);
  if (!parsed.success) redirect("/imports?message=row-error");

  const result = await mapCurrentUserQifTransferAccount(
    parsed.data.jobId,
    parsed.data.sourceAccountName,
    parsed.data.accountId,
  );
  revalidatePath(`/imports/${parsed.data.jobId}`);
  redirect(
    `/imports/${parsed.data.jobId}?message=${result.ok ? "mapping-updated" : "row-error"}&page=${page}`,
  );
}

export async function toggleFinancialImportRow(formData: FormData) {
  const rowId = importRowIdSchema.safeParse(formData.get("rowId"));
  const jobId = importJobIdSchema.safeParse(formData.get("jobId"));
  const page = Math.max(1, Number(formData.get("page")) || 1);
  if (!rowId.success || !jobId.success) {
    redirect("/imports?message=row-error");
  }

  const ignored = formData.get("ignored") === "true";
  const result = await setCurrentUserImportRowIgnored(rowId.data, ignored);
  revalidatePath(`/imports/${jobId.data}`);
  redirect(
    `/imports/${jobId.data}?message=${
      result.ok
        ? ignored
          ? "row-ignored"
          : "row-reincluded"
        : "row-error"
    }&page=${page}`,
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
