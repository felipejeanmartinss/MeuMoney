import "server-only";
import { createHash } from "node:crypto";
import {
  parseDetectedCsv,
  parseConfiguredCsv,
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
const MAX_IMPORT_ROWS = 1000;

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
    return "Selecione um arquivo CSV, OFX ou PDF.";
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
  const { data, error } = await supabase
    .from("import_jobs")
    .select(
      "id, user_id, account_id, file_name, file_type, source_adapter_id, source_document_type, status, source_row_count, valid_row_count, duplicate_row_count, imported_row_count, original_file_discarded_at, confirmed_at, cancelled_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return { jobs: data ?? [], hasError: Boolean(error) };
}

export async function getCurrentUserImportReview(jobId: string) {
  const { supabase, user } = await requireUser();
  const jobResult = await supabase
    .from("import_jobs")
    .select(
      "id, user_id, account_id, file_name, file_type, source_adapter_id, source_document_type, status, source_row_count, valid_row_count, duplicate_row_count, imported_row_count, original_file_discarded_at, confirmed_at, cancelled_at, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("id", jobId)
    .maybeSingle();

  if (!jobResult.data) {
    return {
      job: null,
      rows: [],
      accounts: [],
      categories: [],
      hasError: Boolean(jobResult.error),
    };
  }

  const [rowsResult, accountsResult, categoriesResult] = await Promise.all([
    supabase
      .from("import_staging_rows")
      .select(
        "id, job_id, user_id, source_row_number, source_external_id, source_date_text, source_amount_text, source_description_original, source_pages, confidence, transaction_date, description, normalized_description, signed_amount_minor, transaction_type, amount_minor, account_id, category_id, signature, status, validation_code, duplicate_transaction_id, is_selected, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .order("source_row_number"),
    supabase
      .from("accounts")
      .select("id, name, currency, context")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("categories")
      .select("id, name, kind, context")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("context")
      .order("kind")
      .order("name"),
  ]);

  return {
    job: jobResult.data,
    rows: rowsResult.data ?? [],
    accounts: accountsResult.data ?? [],
    categories: categoriesResult.data ?? [],
    hasError: Boolean(
      jobResult.error ||
        rowsResult.error ||
        accountsResult.error ||
        categoriesResult.error,
    ),
  };
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
