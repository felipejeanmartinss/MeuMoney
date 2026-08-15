import "server-only";
import { createHash } from "node:crypto";
import {
  FINANCING_IMPORT_MAX_FILE_SIZE,
  FinancingImportError,
  parseSupportedFinancingPdf,
  type FinancingProductType,
} from "@/domain/financing-imports";
import { coerceMinorUnits } from "@/domain/money";
import { PdfImportError } from "@/domain/pdf-imports";
import { requireUser } from "@/services/auth/server-auth";
import type {
  FinancialContext,
  FinancingContractSummary,
  FinancingExtraAmortization,
  FinancingImportExtraAmortization,
  FinancingImportJob,
  FinancingImportScheduleRow,
  FinancingScheduleEntry,
  Json,
} from "@/types/database";
import { extractSearchablePdfText } from "./pdf-text-extractor";

const importJobColumns =
  "id, user_id, file_name, file_sha256, adapter_id, adapter_version, status, institution, contract_reference, currency, amortization_system, indexer, original_principal_minor, original_term_months, contract_date, release_date, current_balance_minor, balance_date, nominal_annual_rate, effective_annual_rate, cet_annual_rate, cesh_annual_rate, source_page_count, original_file_discarded_at, contract_id, confirmed_at, cancelled_at, created_at, updated_at";
const stagingScheduleColumns =
  "id, job_id, user_id, source_sequence, installment_number, due_date, total_amount_minor, principal_minor, interest_minor, correction_factor, insurance_mip_minor, insurance_dfi_minor, service_fee_minor, penalty_minor, late_interest_minor, fgts_minor, balance_correction_factor, outstanding_balance_minor, payment_status, payment_date, paid_amount_minor, source_pages, created_at";
const stagingExtraColumns =
  "id, job_id, user_id, source_sequence, event_date, reduction_type, cash_amount_minor, fgts_amount_minor, installments_reduced, source_pages, created_at";
const contractSummaryColumns =
  "id, user_id, net_worth_item_id, institution, product_type, contract_reference, currency, amortization_system, indexer, original_principal_minor, original_term_months, contract_date, release_date, current_balance_minor, balance_date, nominal_annual_rate, effective_annual_rate, cet_annual_rate, cesh_annual_rate, status, created_at, updated_at, name, context, total_paid_minor, principal_paid_minor, interest_paid_minor, charges_paid_minor, extra_cash_minor, extra_fgts_minor, paid_installments, scheduled_installments";
// Keep these selections literal so supabase-js can infer their result types.
const scheduleColumns =
  "id, contract_id, user_id, source_sequence, installment_number, due_date, total_amount_minor, principal_minor, interest_minor, correction_factor, insurance_mip_minor, insurance_dfi_minor, service_fee_minor, penalty_minor, late_interest_minor, fgts_minor, balance_correction_factor, outstanding_balance_minor, payment_status, payment_date, paid_amount_minor, source_pages, created_at";
const extraColumns =
  "id, contract_id, user_id, source_sequence, event_date, reduction_type, cash_amount_minor, fgts_amount_minor, installments_reduced, source_pages, created_at";

function importErrorMessage(error: unknown) {
  if (error instanceof PdfImportError || error instanceof FinancingImportError) {
    return error.message;
  }
  return "Não foi possível preparar o extrato do financiamento. Tente novamente.";
}

function normalizeJob(row: FinancingImportJob): FinancingImportJob {
  return {
    ...row,
    original_principal_minor: coerceMinorUnits(row.original_principal_minor),
    current_balance_minor: coerceMinorUnits(row.current_balance_minor),
  };
}

function normalizeSchedule<T extends FinancingScheduleEntry | FinancingImportScheduleRow>(
  row: T,
): T {
  return {
    ...row,
    total_amount_minor: coerceMinorUnits(row.total_amount_minor),
    principal_minor: coerceMinorUnits(row.principal_minor),
    interest_minor: coerceMinorUnits(row.interest_minor),
    insurance_mip_minor: coerceMinorUnits(row.insurance_mip_minor),
    insurance_dfi_minor: coerceMinorUnits(row.insurance_dfi_minor),
    service_fee_minor: coerceMinorUnits(row.service_fee_minor),
    penalty_minor: coerceMinorUnits(row.penalty_minor),
    late_interest_minor: coerceMinorUnits(row.late_interest_minor),
    fgts_minor: coerceMinorUnits(row.fgts_minor),
    outstanding_balance_minor: coerceMinorUnits(row.outstanding_balance_minor),
    paid_amount_minor: coerceMinorUnits(row.paid_amount_minor),
  };
}

function normalizeExtra<
  T extends FinancingExtraAmortization | FinancingImportExtraAmortization,
>(row: T): T {
  return {
    ...row,
    cash_amount_minor: coerceMinorUnits(row.cash_amount_minor),
    fgts_amount_minor: coerceMinorUnits(row.fgts_amount_minor),
  };
}

function normalizeSummary(row: FinancingContractSummary): FinancingContractSummary {
  return {
    ...row,
    original_principal_minor: coerceMinorUnits(row.original_principal_minor),
    current_balance_minor: coerceMinorUnits(row.current_balance_minor),
    total_paid_minor: coerceMinorUnits(row.total_paid_minor),
    principal_paid_minor: coerceMinorUnits(row.principal_paid_minor),
    interest_paid_minor: coerceMinorUnits(row.interest_paid_minor),
    charges_paid_minor: coerceMinorUnits(row.charges_paid_minor),
    extra_cash_minor: coerceMinorUnits(row.extra_cash_minor),
    extra_fgts_minor: coerceMinorUnits(row.extra_fgts_minor),
  };
}

export async function createCurrentUserFinancingImport(file: File) {
  if (file.size === 0 || file.size > FINANCING_IMPORT_MAX_FILE_SIZE) {
    return {
      ok: false as const,
      message: "Selecione um PDF de até 5 MB.",
    };
  }
  if (file.type && file.type !== "application/pdf") {
    return {
      ok: false as const,
      message: "O extrato do financiamento deve estar em PDF.",
    };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileSha256 = createHash("sha256").update(bytes).digest("hex");
    const document = await extractSearchablePdfText(bytes);
    const parsed = parseSupportedFinancingPdf(document);
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("create_financing_import_job", {
      target_file_name: file.name || "extrato-financiamento.pdf",
      target_file_sha256: fileSha256,
      target_adapter_id: parsed.adapter.id,
      target_adapter_version: parsed.adapter.layoutVersion,
      target_contract: parsed.contract as unknown as Json,
      target_schedule: parsed.schedule as unknown as Json,
      target_extra_amortizations:
        parsed.extraAmortizations as unknown as Json,
    });

    if (error || !data) {
      return {
        ok: false as const,
        message: "O PDF foi lido, mas a prévia não pôde ser armazenada.",
      };
    }
    return { ok: true as const, id: data };
  } catch (error) {
    return { ok: false as const, message: importErrorMessage(error) };
  }
}

export async function getCurrentUserFinancingImport(id: string) {
  const { supabase, user } = await requireUser();
  const [jobResult, scheduleResult, extraResult] = await Promise.all([
    supabase
      .from("financing_import_jobs")
      .select(importJobColumns)
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("financing_import_schedule_rows")
      .select(stagingScheduleColumns)
      .eq("user_id", user.id)
      .eq("job_id", id)
      .order("source_sequence"),
    supabase
      .from("financing_import_extra_amortizations")
      .select(stagingExtraColumns)
      .eq("user_id", user.id)
      .eq("job_id", id)
      .order("event_date"),
  ]);

  return {
    job: jobResult.data ? normalizeJob(jobResult.data) : null,
    schedule: (scheduleResult.data ?? []).map(normalizeSchedule),
    extraAmortizations: (extraResult.data ?? []).map(normalizeExtra),
    hasError: Boolean(jobResult.error || scheduleResult.error || extraResult.error),
  };
}

export async function confirmCurrentUserFinancingImport(
  id: string,
  input: {
    name: string;
    productType: FinancingProductType;
    context: FinancialContext;
  },
) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("confirm_financing_import", {
    target_job_id: id,
    target_name: input.name,
    target_product_type: input.productType,
    target_context: input.context,
  });
  return error || !data
    ? {
        ok: false as const,
        message: "Não foi possível confirmar a importação do financiamento.",
      }
    : { ok: true as const, contractId: data };
}

export async function cancelCurrentUserFinancingImport(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_financing_import", {
    target_job_id: id,
  });
  return error
    ? { ok: false as const, message: "Não foi possível cancelar a importação." }
    : { ok: true as const };
}

export async function listCurrentUserFinancingContracts() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("financing_contract_summaries")
    .select(contractSummaryColumns)
    .eq("user_id", user.id)
    .order("status")
    .order("institution")
    .order("name");

  return {
    contracts: (data ?? []).map(normalizeSummary),
    hasError: Boolean(error),
  };
}

export async function getCurrentUserFinancingContract(id: string) {
  const { supabase, user } = await requireUser();
  const [contractResult, scheduleResult, extraResult] = await Promise.all([
    supabase
      .from("financing_contract_summaries")
      .select(contractSummaryColumns)
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("financing_schedule_entries")
      .select(scheduleColumns)
      .eq("user_id", user.id)
      .eq("contract_id", id)
      .order("source_sequence"),
    supabase
      .from("financing_extra_amortizations")
      .select(extraColumns)
      .eq("user_id", user.id)
      .eq("contract_id", id)
      .order("event_date"),
  ]);

  return {
    contract: contractResult.data
      ? normalizeSummary(contractResult.data)
      : null,
    schedule: (scheduleResult.data ?? []).map(normalizeSchedule),
    extraAmortizations: (extraResult.data ?? []).map(normalizeExtra),
    hasError: Boolean(
      contractResult.error || scheduleResult.error || extraResult.error,
    ),
  };
}
