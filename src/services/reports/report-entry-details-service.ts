import "server-only";

import { requireUser } from "@/services/auth/server-auth";
import { coerceMinorUnits } from "@/domain/money";
import type { FinancialContext, FinancialReportBasis, FinancialReportEntryDetail, SupportedCurrency } from "@/types/database";

export type ReportEntryDetailFilters = {
  fromMonth: string;
  toMonth: string;
  basis: FinancialReportBasis;
  section?: "income" | "expense";
  rowIds?: string[];
  sourceKeys?: string[];
  context?: FinancialContext;
  currencies?: SupportedCurrency[];
};

export async function listCurrentUserReportEntryDetails(filters: ReportEntryDetailFilters) {
  const { supabase, user } = await requireUser();
  const pageSize = 1000;
  const entries: FinancialReportEntryDetail[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("financial_report_entry_details")
      .select("basis,user_id,reference_month,entry_date,currency,section,row_id,category_id,context,source_key,entry_kind,entry_id,description,amount_minor")
      .eq("user_id", user.id)
      .eq("basis", filters.basis)
      .gte("reference_month", `${filters.fromMonth}-01`)
      .lte("reference_month", `${filters.toMonth}-01`);
    if (filters.section) query = query.eq("section", filters.section);
    if (filters.rowIds?.length) query = query.in("row_id", filters.rowIds);
    if (filters.sourceKeys?.length) query = query.in("source_key", filters.sourceKeys);
    if (filters.context) query = query.eq("context", filters.context);
    if (filters.currencies?.length) query = query.in("currency", filters.currencies);
    const result = await query.order("entry_date", { ascending: false }).range(offset, offset + pageSize - 1);
    if (result.error) return { entries, hasError: true };
    entries.push(...(result.data ?? []).map((row) => ({ ...row, amount_minor: coerceMinorUnits(row.amount_minor) })));
    if ((result.data?.length ?? 0) < pageSize) return { entries, hasError: false };
  }
}
