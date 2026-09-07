import "server-only";
import { createHash } from "node:crypto";
import {
  parseDetectedCsv,
  parseConfiguredCsv,
  parseStructuredQif,
  parseStructuredOfx,
  type CsvImportConfig,
  type ImportFileType,
  type ParsedImportRow,
} from "@/domain/file-imports";
import {
  parseSupportedPdf,
  PdfImportError,
} from "@/domain/pdf-imports";
import { requireUser } from "@/services/auth/server-auth";
import { extractSearchablePdfText } from "./pdf-text-extractor";
import type { Json } from "@/types/database";

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;
export const IMPORT_REVIEW_PAGE_SIZE = 50;

export type CreateImportInput = {
  file: File;
  fileType: ImportFileType;
  csvConfig: CsvImportConfig | null;
};

export type ImportRowMutationInput = {
  transactionDate: string;
  description: string;
  signedAmountMinor: number;
  categoryId: string;
};

export type ImportTransferRowMutationInput = Omit<
  ImportRowMutationInput,
  "categoryId"
> & {
  transferAccountId: string;
};

export type ImportCreditCardTransferRowMutationInput = Omit<
  ImportRowMutationInput,
  "categoryId"
> & {
  creditCardId: string;
};

function safeFileName(value: string) {
  const baseName = value.split(/[\\/]/).pop() ?? "importacao";
  const sanitized = baseName.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (sanitized || "importacao").slice(0, 255);
}

function decodeFinancialFile(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function validateFile(input: CreateImportInput) {
  if (!(input.file instanceof File) || input.file.size === 0) {
    return "Selecione um arquivo CSV, OFX, QIF ou PDF.";
  }
  if (input.file.size > MAX_IMPORT_FILE_BYTES) {
    return "O arquivo deve ter no máximo 5 MB.";
  }

  const extension = input.file.name.split(".").pop()?.toLowerCase();
  if (extension !== input.fileType) {
    return `Selecione um arquivo .${input.fileType}.`;
  }
  return null;
}

async function parseFileRows(
  bytes: Uint8Array,
  fileType: ImportFileType,
  csvConfig: CsvImportConfig | null,
) {
  if (fileType === "pdf") {
    const document = await extractSearchablePdfText(bytes);
    return { ...parseSupportedPdf(document), csvConfig: null };
  }

  const content = decodeFinancialFile(bytes);
  if (fileType === "csv") {
    if (!csvConfig) {
      const detected = parseDetectedCsv(content);
      return {
        rows: detected.rows,
        adapter: null,
        csvConfig: detected.detection.config,
      };
    }
    return {
      rows: parseConfiguredCsv(content, csvConfig),
      adapter: null,
      csvConfig,
    };
  }
  if (fileType === "qif") {
    return {
      rows: parseStructuredQif(content),
      adapter: null,
      csvConfig: null,
    };
  }
  return {
    rows: parseStructuredOfx(content),
    adapter: null,
    csvConfig: null,
  };
}

function rowsToJson(rows: ParsedImportRow[]): Json {
  return rows.map((row) => ({
    source_row_number: row.sourceRowNumber,
    source_external_id: row.sourceExternalId,
    source_date_text: row.sourceDateText,
    source_amount_text: row.sourceAmountText,
    transaction_date: row.transactionDate,
    description: row.description,
    signed_amount_minor: row.signedAmountMinor,
    validation_code: row.validationCode,
    source_description_original: row.sourceDescriptionOriginal ?? null,
    source_pages: row.sourcePages ?? [],
    confidence: row.confidence ?? null,
    source_adapter_id: row.sourceAdapterId ?? null,
    source_document_type: row.sourceDocumentType ?? null,
    record_kind: row.recordKind ?? "transaction",
    source_category_name: row.sourceCategoryName ?? null,
    transfer_account_name: row.transferAccountName ?? null,
  }));
}

function mutationErrorMessage(
  error: { message?: string } | null,
  fallback: string,
) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("invalid_import_row_count")) {
    return `O arquivo deve conter entre 1 e ${MAX_IMPORT_ROWS} movimentações.`;
  }
  if (message.includes("invalid_import_account")) {
    return "A conta selecionada não está disponível.";
  }
  if (message.includes("import_job_requires_review")) {
    return "Revise as linhas pendentes antes de confirmar a importação.";
  }
  if (
    message.includes("duplicate key") ||
    message.includes("imported_transaction_signatures")
  ) {
    return "Uma duplicidade foi detectada durante a confirmação. Atualize a prévia e tente novamente.";
  }
  return fallback;
}

export async function createCurrentUserImport(input: CreateImportInput) {
  const fileError = validateFile(input);
  if (fileError) return { ok: false as const, message: fileError };

  try {
    const { supabase } = await requireUser();
    const buffer = await input.file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const { rows, csvConfig } = await parseFileRows(
      bytes,
      input.fileType,
      input.csvConfig,
    );

    if (rows.length < 1 || rows.length > MAX_IMPORT_ROWS) {
      return {
        ok: false as const,
        message: `O arquivo deve conter entre 1 e ${MAX_IMPORT_ROWS} movimentações.`,
      };
    }

    const fileSha256 = createHash("sha256").update(bytes).digest("hex");
    const { data, error } = await supabase.rpc("create_import_job", {
      target_file_name: safeFileName(input.file.name),
      target_file_type: input.fileType,
      target_file_sha256: fileSha256,
      target_csv_config: csvConfig as Json | null,
      target_rows: rowsToJson(rows),
    });

    if (error) {
      // Keep production diagnostics useful without logging file names,
      // descriptions, amounts, hashes or normalized financial rows.
      console.error("[file-imports] create_import_job failed", {
        code: error.code || "unknown",
        fileType: input.fileType,
      });
    }

    // The original byte buffer is never persisted. Only normalized staging
    // rows and a one-way file fingerprint cross the database boundary.
    return error || !data
      ? {
          ok: false as const,
          message: mutationErrorMessage(
            error,
            "Não foi possível preparar a importação.",
          ),
        }
      : { ok: true as const, id: data };
  } catch (error) {
    if (error instanceof PdfImportError) {
      return { ok: false as const, message: error.message };
    }
    return {
      ok: false as const,
      message:
        "Não foi possível ler o arquivo. Confirme o formato e a configuração informada.",
    };
  }
}

export async function listCurrentUserImportJobs() {
  const { supabase, user } = await requireUser();
  await supabase.rpc("apply_import_retention");
  const { data, error } = await supabase
    .from("import_jobs")
    .select(
      "id, user_id, account_id, credit_card_id, file_name, file_type, source_adapter_id, source_document_type, status, source_row_count, valid_row_count, duplicate_row_count, imported_row_count, original_file_discarded_at, confirmed_at, cancelled_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return { jobs: data ?? [], hasError: Boolean(error) };
}

export async function getCurrentUserImportReview(jobId: string, page = 1) {
  const { supabase, user } = await requireUser();
  const jobResult = await supabase
    .from("import_jobs")
    .select(
      "id, user_id, account_id, credit_card_id, file_name, file_type, source_adapter_id, source_document_type, status, source_row_count, valid_row_count, duplicate_row_count, imported_row_count, original_file_discarded_at, confirmed_at, cancelled_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("id", jobId)
    .maybeSingle();

  if (!jobResult.data) {
    return {
      job: null,
      rows: [],
      accounts: [],
      creditCards: [],
      categories: [],
      groups: [],
      pagination: { page: 1, totalRows: 0, totalPages: 1 },
      hasError: Boolean(jobResult.error),
    };
  }

  const safePage = Math.max(1, Math.trunc(page) || 1);
  const start = (safePage - 1) * IMPORT_REVIEW_PAGE_SIZE;
  const end = start + IMPORT_REVIEW_PAGE_SIZE - 1;
  const [
    rowsResult,
    accountsResult,
    creditCardsResult,
    categoriesResult,
    groupsResult,
  ] = await Promise.all([
    supabase
      .from("import_staging_rows")
      .select(
        "id, job_id, user_id, source_row_number, source_external_id, source_date_text, source_amount_text, source_description_original, source_pages, confidence, record_kind, source_category_name, transfer_account_name, transfer_account_id, transfer_credit_card_id, transaction_date, description, normalized_description, signed_amount_minor, transaction_type, amount_minor, account_id, category_id, signature, status, validation_code, duplicate_transaction_id, duplicate_transfer_id, is_selected, created_at, updated_at",
        { count: "exact" },
      )
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .order("source_row_number")
      .range(start, end),
    supabase
      .from("accounts")
      .select("id, name, type, currency, context")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("credit_cards")
      .select("id, name, currency")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("categories")
      .select("id, group_id, parent_id, name, kind, context, is_system, archived_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("context")
      .order("kind")
      .order("name"),
    supabase
      .from("category_groups")
      .select("id, name, kind, context, archived_at")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
  ]);

  return {
    job: jobResult.data,
    rows: rowsResult.data ?? [],
    accounts: accountsResult.data ?? [],
    creditCards: (creditCardsResult.data ?? []).map((card) => ({
      id: card.id,
      cardName: card.name,
      currency: card.currency,
    })),
    categories: categoriesResult.data ?? [],
    groups: groupsResult.data ?? [],
    pagination: {
      page: safePage,
      totalRows: rowsResult.count ?? 0,
      totalPages: Math.max(
        1,
        Math.ceil((rowsResult.count ?? 0) / IMPORT_REVIEW_PAGE_SIZE),
      ),
    },
    hasError: Boolean(
      jobResult.error ||
        rowsResult.error ||
        accountsResult.error ||
        creditCardsResult.error ||
        categoriesResult.error ||
        groupsResult.error,
    ),
  };
}

export async function updateCurrentUserImportTransferRow(
  rowId: string,
  input: ImportTransferRowMutationInput,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("update_import_transfer_row", {
    target_row_id: rowId,
    target_transaction_date: input.transactionDate,
    target_description: input.description,
    target_signed_amount_minor: input.signedAmountMinor,
    target_transfer_account_id: input.transferAccountId,
  });
  return error || !data
    ? {
        ok: false as const,
        message: mutationErrorMessage(
          error,
          "Não foi possível corrigir esta transferência.",
        ),
      }
    : { ok: true as const };
}

export async function updateCurrentUserImportCreditCardTransferRow(
  rowId: string,
  input: ImportCreditCardTransferRowMutationInput,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "update_import_credit_card_transfer_row",
    {
      target_row_id: rowId,
      target_transaction_date: input.transactionDate,
      target_description: input.description,
      target_signed_amount_minor: input.signedAmountMinor,
      target_credit_card_id: input.creditCardId,
    },
  );
  return error || !data
    ? {
        ok: false as const,
        message: mutationErrorMessage(
          error,
          "Não foi possível registrar este pagamento de cartão.",
        ),
      }
    : { ok: true as const };
}

export async function mapCurrentUserQifCategory(
  jobId: string,
  sourceCategoryName: string,
  transactionType: "income" | "expense",
  categoryId: string,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("map_import_qif_category", {
    target_job_id: jobId,
    target_source_category_name: sourceCategoryName,
    target_transaction_type: transactionType,
    target_category_id: categoryId,
  });
  return error
    ? {
        ok: false as const,
        message: "Não foi possível aplicar este mapeamento de categoria.",
      }
    : { ok: true as const, updatedCount: data };
}

export async function mapCurrentUserQifTransferAccount(
  jobId: string,
  sourceAccountName: string,
  accountId: string,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "map_import_qif_transfer_account",
    {
      target_job_id: jobId,
      target_source_account_name: sourceAccountName,
      target_account_id: accountId,
    },
  );
  return error
    ? {
        ok: false as const,
        message: "Não foi possível aplicar este mapeamento de conta.",
      }
    : { ok: true as const, updatedCount: data };
}

export async function configureCurrentUserImport(
  jobId: string,
  accountId: string,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("configure_import_job", {
    target_job_id: jobId,
    target_account_id: accountId,
  });
  return error || !data
    ? {
        ok: false as const,
        message: mutationErrorMessage(
          error,
          "Não foi possível associar a conta.",
        ),
      }
    : { ok: true as const };
}

export async function configureCurrentUserCreditCardPurchaseImport(
  jobId: string,
  creditCardId: string,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "configure_credit_card_purchase_import_job",
    {
      target_job_id: jobId,
      target_credit_card_id: creditCardId,
    },
  );
  return error || !data
    ? {
        ok: false as const,
        message: mutationErrorMessage(
          error,
          "Não foi possível associar o cartão.",
        ),
      }
    : { ok: true as const };
}

export async function updateCurrentUserImportCreditCardPurchaseRow(
  rowId: string,
  input: ImportRowMutationInput,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "update_import_credit_card_purchase_row",
    {
      target_row_id: rowId,
      target_transaction_date: input.transactionDate,
      target_description: input.description,
      target_signed_amount_minor: input.signedAmountMinor,
      target_category_id: input.categoryId,
    },
  );
  return error || !data
    ? {
        ok: false as const,
        message: mutationErrorMessage(
          error,
          "Não foi possível corrigir esta compra.",
        ),
      }
    : { ok: true as const };
}

export async function updateCurrentUserImportRow(
  rowId: string,
  input: ImportRowMutationInput,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("update_import_staging_row", {
    target_row_id: rowId,
    target_transaction_date: input.transactionDate,
    target_description: input.description,
    target_signed_amount_minor: input.signedAmountMinor,
    target_category_id: input.categoryId,
  });
  return error || !data
    ? {
        ok: false as const,
        message: mutationErrorMessage(
          error,
          "Não foi possível corrigir esta linha.",
        ),
      }
    : { ok: true as const };
}

export async function setCurrentUserImportRowIgnored(
  rowId: string,
  ignored: boolean,
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "set_import_staging_row_ignored",
    {
      target_row_id: rowId,
      target_ignored: ignored,
    },
  );
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível alterar a seleção desta linha.",
      }
    : { ok: true as const };
}

export async function confirmCurrentUserImport(jobId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("confirm_import_job", {
    target_job_id: jobId,
  });
  return error || !data
    ? {
        ok: false as const,
        message: mutationErrorMessage(
          error,
          "Não foi possível confirmar a importação.",
        ),
      }
    : { ok: true as const, importedCount: data };
}

export async function cancelCurrentUserImport(jobId: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("cancel_import_job", {
    target_job_id: jobId,
  });
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível cancelar esta importação.",
      }
    : { ok: true as const };
}

export async function clearCurrentUserCancelledImports() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(
    "clear_cancelled_import_jobs",
  );
  return error
    ? {
        ok: false as const,
        message: "Não foi possível limpar as importações canceladas.",
      }
    : { ok: true as const, deletedCount: data };
}
