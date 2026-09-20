import "server-only";

import { requireUser } from "@/services/auth/server-auth";
import type { FinancialReportType } from "@/domain/financial-reports";
import type { Json } from "@/types/database";

export async function listCurrentUserSavedFinancialReports() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("saved_financial_reports")
    .select("id, user_id, name, report_type, filters, created_at, updated_at")
    .eq("user_id", user.id)
    .order("name");
  return { reports: data ?? [], hasError: Boolean(error) };
}

export async function createCurrentUserSavedFinancialReport(input: {
  name: string;
  reportType: FinancialReportType;
  filters: Json;
}) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("saved_financial_reports").insert({
    user_id: user.id,
    name: input.name,
    report_type: input.reportType,
    filters: input.filters,
  });
  return error
    ? {
        ok: false as const,
        message:
          error.code === "23505"
            ? "Já existe um relatório salvo com esse nome."
            : "Não foi possível salvar o relatório.",
      }
    : { ok: true as const };
}

export async function deleteCurrentUserSavedFinancialReport(id: string) {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("saved_financial_reports")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  return error || !data
    ? { ok: false as const, message: "Não foi possível excluir o relatório salvo." }
    : { ok: true as const };
}
