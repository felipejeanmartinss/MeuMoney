import "server-only";

import { coerceMinorUnits } from "@/domain/money";
import { requireUser } from "@/services/auth/server-auth";
import { currentIsoDate } from "@/utils/dates";
import type { MonthlyFinancialCheckin } from "@/types/database";

function nextMonth(referenceMonth: string) {
  const date = new Date(`${referenceMonth.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type MonthlyCheckinData = {
  referenceMonth: string;
  checkin: MonthlyFinancialCheckin | null;
  checklist: {
    unclassifiedCount: number;
    unreconciledCount: number;
    upcomingRecurrencesCount: number;
    upcomingInvoices: Array<{
      id: string;
      credit_card_name: string;
      due_date: string;
      outstanding_amount_minor: number;
      currency: "BRL" | "USD" | "EUR";
    }>;
    overBudget: Array<{
      category_id: string;
      category_name: string;
      percentage_consumed: number;
      realized_amount_minor: number;
      planned_amount_minor: number;
    }>;
    staleQuotes: Array<{ id: string; asset_name: string; position_date: string }>;
  };
  hasError: boolean;
};

export async function getCurrentUserMonthlyCheckin(referenceMonth: string): Promise<MonthlyCheckinData> {
  const { supabase, user } = await requireUser();
  const monthEnd = nextMonth(referenceMonth);
  const today = currentIsoDate();
  const [checkinResult, unclassifiedResult, unreconciledTransactions, unreconciledTransfers, recurrencesResult, invoicesResult, budgetResult, positionsResult] = await Promise.all([
    supabase.from("monthly_financial_checkins").select("id, user_id, reference_month, status, observation, closed_at, created_at, updated_at").eq("user_id", user.id).eq("reference_month", referenceMonth).maybeSingle(),
    supabase.from("transactions").select("id").eq("user_id", user.id).eq("is_active", true).is("category_id", null).gte("transaction_date", referenceMonth).lt("transaction_date", monthEnd),
    supabase.from("transactions").select("id").eq("user_id", user.id).eq("is_active", true).is("reconciled_at", null).lte("transaction_date", today),
    supabase.from("transfer_entries").select("id").eq("user_id", user.id).eq("is_active", true).is("reconciled_at", null).lte("transaction_date", today),
    supabase.from("financial_dashboard_upcoming_recurrences").select("id").eq("user_id", user.id).gte("next_occurrence", today).lte("next_occurrence", addDays(today, 30)),
    supabase.from("financial_dashboard_invoices").select("id, credit_card_name, due_date, outstanding_amount_minor, currency").eq("user_id", user.id).gte("due_date", today).lte("due_date", addDays(today, 45)).in("effective_status", ["open", "closed", "overdue"]).order("due_date").limit(12),
    supabase.from("monthly_budget_progress").select("category_id, category_name, planned_amount_minor, realized_amount_minor, percentage_consumed").eq("user_id", user.id).eq("reference_month", referenceMonth).eq("category_kind", "expense"),
    supabase.from("investment_positions").select("id, asset_name, position_date").eq("user_id", user.id).eq("is_active", true).lt("position_date", addDays(today, -30)).order("position_date"),
  ]);
  const overBudget = (budgetResult.data ?? []).flatMap((row) => row.percentage_consumed !== null && Number(row.percentage_consumed) >= 80 ? [{ category_id: row.category_id, category_name: row.category_name, percentage_consumed: Number(row.percentage_consumed), realized_amount_minor: coerceMinorUnits(row.realized_amount_minor), planned_amount_minor: coerceMinorUnits(row.planned_amount_minor) }] : []);
  const upcomingInvoices = (invoicesResult.data ?? []).map((row) => ({ ...row, outstanding_amount_minor: coerceMinorUnits(row.outstanding_amount_minor) }));
  const staleQuotes = (positionsResult.data ?? []).map((row) => ({ ...row, position_date: row.position_date }));
  return {
    referenceMonth,
    checkin: (checkinResult.data as MonthlyFinancialCheckin | null) ?? null,
    checklist: {
      unclassifiedCount: unclassifiedResult.data?.length ?? 0,
      unreconciledCount: (unreconciledTransactions.data?.length ?? 0) + (unreconciledTransfers.data?.length ?? 0),
      upcomingRecurrencesCount: recurrencesResult.data?.length ?? 0,
      upcomingInvoices,
      overBudget,
      staleQuotes,
    },
    hasError: Boolean(checkinResult.error || unclassifiedResult.error || unreconciledTransactions.error || unreconciledTransfers.error || recurrencesResult.error || invoicesResult.error || budgetResult.error || positionsResult.error),
  };
}

export async function closeCurrentUserMonthlyCheckin(referenceMonth: string, observation: string | null) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("monthly_financial_checkins").upsert({ user_id: user.id, reference_month: referenceMonth, status: "closed", observation, closed_at: new Date().toISOString() }, { onConflict: "user_id,reference_month" });
  return error ? { ok: false as const, message: "Não foi possível confirmar o fechamento do mês." } : { ok: true as const };
}
